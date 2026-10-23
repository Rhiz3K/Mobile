import ExpoModulesCore
import Foundation

// How long a login waits for the user to answer a host key or prompt.
private let promptTimeoutNs: UInt64 = 5 * 60 * 1_000_000_000

struct SshCodedException: CodedError {
  let code: String
  let description: String
  init(_ code: String, _ description: String) {
    self.code = code
    self.description = description
  }
}

private func coded(_ error: Error) -> Error {
  guard let e = error as? SshError else { return error }
  switch e {
  case let .Connect(msg): return SshCodedException("SSH_CONNECT", msg)
  case .HostKeyRejected: return SshCodedException("SSH_HOST_KEY_REJECTED", "Host key was rejected")
  case .PassphraseRequired: return SshCodedException("SSH_PASSPHRASE_REQUIRED", "The key needs a passphrase")
  case .BadPassphrase: return SshCodedException("SSH_BAD_PASSPHRASE", "Wrong passphrase")
  case let .InvalidKey(msg): return SshCodedException("SSH_INVALID_KEY", msg)
  case let .Auth(msg): return SshCodedException("SSH_AUTH", msg)
  case .AuthCancelled: return SshCodedException("SSH_AUTH_CANCELLED", "Login cancelled")
  case let .Channel(msg): return SshCodedException("SSH_CHANNEL", msg)
  case let .Sftp(msg): return SshCodedException("SSH_SFTP", msg)
  case let .Io(msg): return SshCodedException("SSH_IO", msg)
  case .Disconnected: return SshCodedException("SSH_DISCONNECTED", "Disconnected")
  }
}

private func ssh<T>(_ block: () async throws -> T) async throws -> T {
  do { return try await block() } catch { throw coded(error) }
}

private func localPath(_ path: String) -> String {
  path.hasPrefix("file://") ? (URL(string: path)?.path ?? String(path.dropFirst(7))) : path
}

private func hostKeyMap(_ k: HostKeyInfo) -> [String: Any?] {
  [
    "host": k.host, "port": Int(k.port), "keyType": k.keyType, "blobHex": k.blobHex, "sha256": k.sha256,
    "isCertificate": k.isCertificate, "caSha256": k.caSha256, "principals": k.principals,
  ]
}

/// A one shot answer the JS side gives while a login waits.
private final class Answer<T>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: T?
  private var waiter: CheckedContinuation<T?, Never>?
  private var done = false

  func complete(_ v: T?) {
    lock.lock()
    guard !done else { lock.unlock(); return }
    done = true
    value = v
    let w = waiter
    waiter = nil
    lock.unlock()
    w?.resume(returning: v)
  }

  func wait() async -> T? {
    let timeout = Task { [weak self] in
      try? await Task.sleep(nanoseconds: promptTimeoutNs)
      self?.complete(nil)
    }
    defer { timeout.cancel() }
    return await withCheckedContinuation { c in
      lock.lock()
      if done {
        lock.unlock()
        c.resume(returning: value)
      } else {
        waiter = c
        lock.unlock()
      }
    }
  }
}

private final class Live: @unchecked Sendable {
  let session: Session
  var sftp: Sftp?
  init(_ s: Session) { session = s }
}

/// Thread safe dictionary, since UniFFI calls back from Rust threads.
private final class Store<V>: @unchecked Sendable {
  private let lock = NSLock()
  private var items = [String: V]()
  subscript(key: String) -> V? {
    get { lock.lock(); defer { lock.unlock() }; return items[key] }
    set { lock.lock(); items[key] = newValue; lock.unlock() }
  }
  func remove(_ key: String) -> V? { lock.lock(); defer { lock.unlock() }; return items.removeValue(forKey: key) }
  func removeAll() -> [V] { lock.lock(); defer { lock.unlock() }; let v = Array(items.values); items.removeAll(); return v }
}

private final class Callbacks: SessionCallbacks, @unchecked Sendable {
  let id: String
  weak var module: TermixSshModule?
  init(_ id: String, _ module: TermixSshModule) {
    self.id = id
    self.module = module
  }

  func verifyHostKey(info: HostKeyInfo) async -> Bool {
    guard let module else { return false }
    let answer = Answer<Bool>()
    module.hostKeyAnswers[id] = answer
    module.sendEvent("onHostKey", ["sessionId": id, "hostKey": hostKeyMap(info)])
    let ok = await answer.wait() ?? false
    _ = module.hostKeyAnswers.remove(id)
    return ok
  }

  func keyboardInteractive(request: KbdRequest) async -> [String]? {
    guard let module else { return nil }
    let answer = Answer<[String]>()
    module.kbdAnswers[id] = answer
    module.sendEvent("onKeyboardInteractive", [
      "sessionId": id,
      "request": [
        "name": request.name,
        "instructions": request.instructions,
        "prompts": request.prompts.map { ["prompt": $0.prompt, "echo": $0.echo] },
        "round": Int(request.round),
      ],
    ])
    let answers = await answer.wait()
    _ = module.kbdAnswers.remove(id)
    return answers
  }

  func onBanner(banner: String) { module?.sendEvent("onBanner", ["sessionId": id, "banner": banner]) }

  func onDisconnect(reason: String) { module?.sendEvent("onDisconnect", ["sessionId": id, "reason": reason]) }
}

private final class ShellSink: ShellCallbacks, @unchecked Sendable {
  let shellId: String
  weak var module: TermixSshModule?
  init(_ shellId: String, _ module: TermixSshModule) {
    self.shellId = shellId
    self.module = module
  }
  func onData(data: Data) { module?.sendEvent("onShellData", ["shellId": shellId, "data": data.base64EncodedString()]) }
  func onExit(exitCode: UInt32?) {
    _ = module?.shells.remove(shellId)
    module?.sendEvent("onShellExit", ["shellId": shellId, "exitCode": exitCode.map { Int($0) } as Any])
  }
}

private final class TransferProgress: ProgressCallback, @unchecked Sendable {
  let transferId: String
  weak var module: TermixSshModule?
  init(_ transferId: String, _ module: TermixSshModule) {
    self.transferId = transferId
    self.module = module
  }
  func onProgress(done: UInt64, total: UInt64) {
    module?.sendEvent("onTransferProgress", ["transferId": transferId, "done": Double(done), "total": Double(total)])
  }
}

public final class TermixSshModule: Module {
  fileprivate let sessions = Store<Live>()
  fileprivate let shells = Store<Shell>()
  fileprivate let forwards = Store<Forward>()
  fileprivate let hostKeyAnswers = Store<Answer<Bool>>()
  fileprivate let kbdAnswers = Store<Answer<[String]>>()

  private func live(_ id: String) throws -> Live {
    guard let l = sessions[id] else { throw SshCodedException("SSH_DISCONNECTED", "No session \(id)") }
    return l
  }

  private func sftp(_ id: String) async throws -> Sftp {
    let l = try live(id)
    if let s = l.sftp { return s }
    let s = try await l.session.openSftp()
    l.sftp = s
    return s
  }

  public func definition() -> ModuleDefinition {
    Name("TermixSsh")

    Events(
      "onHostKey", "onKeyboardInteractive", "onBanner", "onDisconnect",
      "onShellData", "onShellExit", "onTransferProgress"
    )

    Function("engineVersion") { engineVersion() }

    AsyncFunction("connect") { (id: String, c: [String: Any], parentId: String?) async throws -> [String: Any?] in
      let config = ConnectConfig(
        host: c["host"] as? String ?? "",
        port: UInt16((c["port"] as? NSNumber)?.intValue ?? 22),
        username: c["username"] as? String ?? "",
        password: c["password"] as? String,
        privateKey: c["privateKey"] as? String,
        passphrase: c["passphrase"] as? String,
        certificate: c["certificate"] as? String,
        forceKeyboardInteractive: c["forceKeyboardInteractive"] as? Bool ?? false,
        allowLegacyAlgorithms: c["allowLegacyAlgorithms"] as? Bool ?? false,
        connectTimeoutSecs: UInt32((c["connectTimeoutSecs"] as? NSNumber)?.intValue ?? 15),
        keepaliveIntervalSecs: UInt32((c["keepaliveIntervalSecs"] as? NSNumber)?.intValue ?? 30),
        keepaliveCountMax: UInt32((c["keepaliveCountMax"] as? NSNumber)?.intValue ?? 5)
      )
      let cb = Callbacks(id, self)
      let session = try await ssh {
        if let parentId {
          return try await self.live(parentId).session.connectVia(config: config, callbacks: cb)
        }
        return try await connect(config: config, callbacks: cb)
      }
      self.sessions[id] = Live(session)
      let a = session.algorithms()
      return [
        "hostKey": hostKeyMap(session.hostKey()),
        "algorithms": a.map { ["kex": $0.kex, "hostKey": $0.hostKey, "cipher": $0.cipher, "mac": $0.mac] },
      ]
    }

    Function("answerHostKey") { (id: String, accept: Bool) in self.hostKeyAnswers[id]?.complete(accept) }

    Function("answerKeyboardInteractive") { (id: String, answers: [String]?) in self.kbdAnswers[id]?.complete(answers) }

    Function("isClosed") { (id: String) -> Bool in self.sessions[id]?.session.isClosed() ?? true }

    AsyncFunction("ping") { (id: String) async throws in try await ssh { try await self.live(id).session.ping() } }

    AsyncFunction("disconnect") { (id: String) async in
      guard let l = self.sessions.remove(id) else { return }
      try? await l.session.disconnect()
    }

    AsyncFunction("exec") { (id: String, command: String) async throws -> [String: Any?] in
      let r = try await ssh { try await self.live(id).session.exec(command: command) }
      return ["stdout": r.stdout.base64EncodedString(), "stderr": r.stderr.base64EncodedString(), "exitCode": r.exitCode.map { Int($0) }]
    }

    AsyncFunction("openShell") { (id: String, shellId: String, term: String, cols: Int, rows: Int, env: [String: String]) async throws in
      let shell = try await ssh {
        try await self.live(id).session.openShell(
          term: term, cols: UInt32(cols), rows: UInt32(rows),
          env: env.map { EnvVar(name: $0.key, value: $0.value) }, callbacks: ShellSink(shellId, self))
      }
      self.shells[shellId] = shell
    }

    AsyncFunction("writeShell") { (shellId: String, data: String) async throws in
      guard let shell = self.shells[shellId] else { throw SshCodedException("SSH_DISCONNECTED", "Shell closed") }
      try await ssh { try await shell.write(data: Data(base64Encoded: data) ?? Data()) }
    }

    AsyncFunction("resizeShell") { (shellId: String, cols: Int, rows: Int) async throws in
      guard let shell = self.shells[shellId] else { return }
      try await ssh { try await shell.resize(cols: UInt32(cols), rows: UInt32(rows)) }
    }

    AsyncFunction("closeShell") { (shellId: String) async in
      try? await self.shells[shellId]?.end()
    }

    AsyncFunction("sftpList") { (id: String, path: String) async throws -> [[String: Any]] in
      try await ssh { try await self.sftp(id).list(path: path) }.map {
        [
          "name": $0.name, "size": Double($0.size), "isDir": $0.isDir, "isSymlink": $0.isSymlink,
          "permissions": Int($0.permissions), "mtime": Double($0.mtime),
        ]
      }
    }

    AsyncFunction("sftpSize") { (id: String, path: String) async throws -> Double in
      Double(try await ssh { try await self.sftp(id).size(path: path) })
    }

    AsyncFunction("sftpDownload") { (id: String, transferId: String, remote: String, local: String) async throws -> [String: Double] in
      let r = try await ssh {
        try await self.sftp(id).download(remote: remote, local: localPath(local), progress: TransferProgress(transferId, self))
      }
      return ["bytes": Double(r.bytes), "millis": Double(r.millis)]
    }

    AsyncFunction("sftpUpload") { (id: String, transferId: String, local: String, remote: String) async throws -> [String: Double] in
      let r = try await ssh {
        try await self.sftp(id).upload(local: localPath(local), remote: remote, progress: TransferProgress(transferId, self))
      }
      return ["bytes": Double(r.bytes), "millis": Double(r.millis)]
    }

    AsyncFunction("sftpRemove") { (id: String, path: String) async throws in
      try await ssh { try await self.sftp(id).remove(path: path) }
    }

    AsyncFunction("forwardLocal") { (id: String, forwardId: String, bindHost: String, bindPort: Int, host: String, port: Int) async throws -> Int in
      let f = try await ssh {
        try await self.live(id).session.forwardLocal(
          bindHost: bindHost, bindPort: UInt16(bindPort), remoteHost: host, remotePort: UInt16(port))
      }
      self.forwards[forwardId] = f
      return Int(f.port())
    }

    AsyncFunction("forwardDynamic") { (id: String, forwardId: String, bindHost: String, bindPort: Int) async throws -> Int in
      let f = try await ssh { try await self.live(id).session.forwardDynamic(bindHost: bindHost, bindPort: UInt16(bindPort)) }
      self.forwards[forwardId] = f
      return Int(f.port())
    }

    Function("closeForward") { (forwardId: String) in self.forwards.remove(forwardId)?.stop() }

    OnDestroy {
      self.forwards.removeAll().forEach { $0.stop() }
      _ = self.shells.removeAll()
      _ = self.sessions.removeAll()
    }
  }
}
