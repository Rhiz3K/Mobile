package expo.modules.termixssh

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import uniffi.termix_ssh_core.ConnectConfig
import uniffi.termix_ssh_core.EnvVar
import uniffi.termix_ssh_core.Forward
import uniffi.termix_ssh_core.HostKeyInfo
import uniffi.termix_ssh_core.KbdRequest
import uniffi.termix_ssh_core.ProgressCallback
import uniffi.termix_ssh_core.Session
import uniffi.termix_ssh_core.SessionCallbacks
import uniffi.termix_ssh_core.Sftp
import uniffi.termix_ssh_core.Shell
import uniffi.termix_ssh_core.ShellCallbacks
import uniffi.termix_ssh_core.SshException
import uniffi.termix_ssh_core.connect
import uniffi.termix_ssh_core.engineVersion
import java.util.concurrent.ConcurrentHashMap

// How long a login waits for the user to answer a host key or prompt.
private const val PROMPT_TIMEOUT_MS = 5 * 60 * 1000L

private class SshCodedException(code: String, message: String) : CodedException(code, message, null)

private fun SshException.coded(): CodedException = when (this) {
    is SshException.Connect -> SshCodedException("SSH_CONNECT", msg)
    is SshException.HostKeyRejected -> SshCodedException("SSH_HOST_KEY_REJECTED", "Host key was rejected")
    is SshException.PassphraseRequired -> SshCodedException("SSH_PASSPHRASE_REQUIRED", "The key needs a passphrase")
    is SshException.BadPassphrase -> SshCodedException("SSH_BAD_PASSPHRASE", "Wrong passphrase")
    is SshException.InvalidKey -> SshCodedException("SSH_INVALID_KEY", msg)
    is SshException.Auth -> SshCodedException("SSH_AUTH", msg)
    is SshException.AuthCancelled -> SshCodedException("SSH_AUTH_CANCELLED", "Login cancelled")
    is SshException.Channel -> SshCodedException("SSH_CHANNEL", msg)
    is SshException.Sftp -> SshCodedException("SSH_SFTP", msg)
    is SshException.Io -> SshCodedException("SSH_IO", msg)
    is SshException.Disconnected -> SshCodedException("SSH_DISCONNECTED", "Disconnected")
}

private suspend fun <T> ssh(block: suspend () -> T): T = try {
    block()
} catch (e: SshException) {
    throw e.coded()
}

private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

private fun localPath(path: String) = path.removePrefix("file://")

private fun HostKeyInfo.toMap() = mapOf(
    "host" to host,
    "port" to port.toInt(),
    "keyType" to keyType,
    "blobHex" to blobHex,
    "sha256" to sha256,
    "isCertificate" to isCertificate,
    "caSha256" to caSha256,
    "principals" to principals,
)

private class Live(val session: Session) {
    @Volatile var sftp: Sftp? = null
}

class TermixSshModule : Module() {
    private val sessions = ConcurrentHashMap<String, Live>()
    private val shells = ConcurrentHashMap<String, Shell>()
    private val forwards = ConcurrentHashMap<String, Forward>()
    private val hostKeyAnswers = ConcurrentHashMap<String, CompletableDeferred<Boolean>>()
    private val kbdAnswers = ConcurrentHashMap<String, CompletableDeferred<List<String>?>>()

    private fun live(id: String) = sessions[id] ?: throw SshCodedException("SSH_DISCONNECTED", "No session $id")

    private suspend fun sftp(id: String): Sftp {
        val l = live(id)
        return l.sftp ?: l.session.openSftp().also { l.sftp = it }
    }

    private fun callbacks(id: String) = object : SessionCallbacks {
        override suspend fun verifyHostKey(info: HostKeyInfo): Boolean {
            val answer = CompletableDeferred<Boolean>()
            hostKeyAnswers[id] = answer
            sendEvent("onHostKey", mapOf("sessionId" to id, "hostKey" to info.toMap()))
            return (withTimeoutOrNull(PROMPT_TIMEOUT_MS) { answer.await() } ?: false).also { hostKeyAnswers.remove(id) }
        }

        override suspend fun keyboardInteractive(request: KbdRequest): List<String>? {
            val answer = CompletableDeferred<List<String>?>()
            kbdAnswers[id] = answer
            sendEvent(
                "onKeyboardInteractive",
                mapOf(
                    "sessionId" to id,
                    "request" to mapOf(
                        "name" to request.name,
                        "instructions" to request.instructions,
                        "prompts" to request.prompts.map { mapOf("prompt" to it.prompt, "echo" to it.echo) },
                        "round" to request.round.toInt(),
                    ),
                ),
            )
            return withTimeoutOrNull(PROMPT_TIMEOUT_MS) { answer.await() }.also { kbdAnswers.remove(id) }
        }

        override fun onBanner(banner: String) = sendEvent("onBanner", mapOf("sessionId" to id, "banner" to banner))

        override fun onDisconnect(reason: String) {
            sendEvent("onDisconnect", mapOf("sessionId" to id, "reason" to reason))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("TermixSsh")

        Events(
            "onHostKey", "onKeyboardInteractive", "onBanner", "onDisconnect",
            "onShellData", "onShellExit", "onTransferProgress",
        )

        Function("engineVersion") { engineVersion() }

        AsyncFunction("connect") Coroutine { id: String, c: Map<String, Any?>, parentId: String? ->
            val config = ConnectConfig(
                host = c["host"] as String,
                port = (c["port"] as Number).toInt().toUShort(),
                username = c["username"] as String,
                password = c["password"] as String?,
                privateKey = c["privateKey"] as String?,
                passphrase = c["passphrase"] as String?,
                certificate = c["certificate"] as String?,
                forceKeyboardInteractive = c["forceKeyboardInteractive"] as Boolean? ?: false,
                allowLegacyAlgorithms = c["allowLegacyAlgorithms"] as Boolean? ?: false,
                connectTimeoutSecs = ((c["connectTimeoutSecs"] as Number?)?.toInt() ?: 15).toUInt(),
                keepaliveIntervalSecs = ((c["keepaliveIntervalSecs"] as Number?)?.toInt() ?: 30).toUInt(),
                keepaliveCountMax = ((c["keepaliveCountMax"] as Number?)?.toInt() ?: 5).toUInt(),
            )
            val session = ssh {
                if (parentId != null) live(parentId).session.connectVia(config, callbacks(id))
                else connect(config, callbacks(id))
            }
            sessions[id] = Live(session)
            mapOf(
                "hostKey" to session.hostKey().toMap(),
                "algorithms" to session.algorithms()?.let {
                    mapOf("kex" to it.kex, "hostKey" to it.hostKey, "cipher" to it.cipher, "mac" to it.mac)
                },
            )
        }

        Function("answerHostKey") { id: String, accept: Boolean -> hostKeyAnswers[id]?.complete(accept) }

        Function("answerKeyboardInteractive") { id: String, answers: List<String>? -> kbdAnswers[id]?.complete(answers) }

        Function("isClosed") { id: String -> sessions[id]?.session?.isClosed() ?: true }

        AsyncFunction("ping") Coroutine { id: String -> ssh { live(id).session.ping() } }

        AsyncFunction("disconnect") Coroutine { id: String ->
            val l = sessions.remove(id) ?: return@Coroutine
            runCatching { l.session.disconnect() }
            l.sftp?.destroy()
            l.session.destroy()
        }

        AsyncFunction("exec") Coroutine { id: String, command: String ->
            val r = ssh { live(id).session.exec(command) }
            mapOf("stdout" to b64(r.stdout), "stderr" to b64(r.stderr), "exitCode" to r.exitCode?.toInt())
        }

        AsyncFunction("openShell") Coroutine { id: String, shellId: String, term: String, cols: Int, rows: Int, env: Map<String, String> ->
            val shell = ssh {
                live(id).session.openShell(
                    term, cols.toUInt(), rows.toUInt(), env.map { EnvVar(it.key, it.value) },
                    object : ShellCallbacks {
                        override fun onData(data: ByteArray) = sendEvent("onShellData", mapOf("shellId" to shellId, "data" to b64(data)))
                        override fun onExit(exitCode: UInt?) {
                            shells.remove(shellId)?.destroy()
                            sendEvent("onShellExit", mapOf("shellId" to shellId, "exitCode" to exitCode?.toInt()))
                        }
                    },
                )
            }
            shells[shellId] = shell
        }

        AsyncFunction("writeShell") Coroutine { shellId: String, data: String ->
            val shell = shells[shellId] ?: throw SshCodedException("SSH_DISCONNECTED", "Shell closed")
            ssh { shell.write(Base64.decode(data, Base64.DEFAULT)) }
        }

        AsyncFunction("resizeShell") Coroutine { shellId: String, cols: Int, rows: Int ->
            shells[shellId]?.let { ssh { it.resize(cols.toUInt(), rows.toUInt()) } }
        }

        AsyncFunction("closeShell") Coroutine { shellId: String ->
            shells[shellId]?.let { s -> runCatching { s.end() } }
        }

        AsyncFunction("sftpList") Coroutine { id: String, path: String ->
            ssh { sftp(id).list(path) }.map {
                mapOf(
                    "name" to it.name, "size" to it.size.toDouble(), "isDir" to it.isDir, "isSymlink" to it.isSymlink,
                    "permissions" to it.permissions.toInt(), "mtime" to it.mtime.toDouble(),
                )
            }
        }

        AsyncFunction("sftpSize") Coroutine { id: String, path: String -> ssh { sftp(id).size(path) }.toDouble() }

        AsyncFunction("sftpDownload") Coroutine { id: String, transferId: String, remote: String, local: String ->
            val r = ssh { sftp(id).download(remote, localPath(local), progress(transferId)) }
            mapOf("bytes" to r.bytes.toDouble(), "millis" to r.millis.toDouble())
        }

        AsyncFunction("sftpUpload") Coroutine { id: String, transferId: String, local: String, remote: String ->
            val r = ssh { sftp(id).upload(localPath(local), remote, progress(transferId)) }
            mapOf("bytes" to r.bytes.toDouble(), "millis" to r.millis.toDouble())
        }

        AsyncFunction("sftpRemove") Coroutine { id: String, path: String -> ssh { sftp(id).remove(path) } }

        AsyncFunction("forwardLocal") Coroutine { id: String, forwardId: String, bindHost: String, bindPort: Int, host: String, port: Int ->
            val f = ssh { live(id).session.forwardLocal(bindHost, bindPort.toUShort(), host, port.toUShort()) }
            forwards[forwardId] = f
            f.port().toInt()
        }

        AsyncFunction("forwardDynamic") Coroutine { id: String, forwardId: String, bindHost: String, bindPort: Int ->
            val f = ssh { live(id).session.forwardDynamic(bindHost, bindPort.toUShort()) }
            forwards[forwardId] = f
            f.port().toInt()
        }

        Function("closeForward") { forwardId: String ->
            forwards.remove(forwardId)?.let { it.stop(); it.destroy() }
        }

        OnDestroy {
            forwards.values.forEach { it.stop(); it.destroy() }
            forwards.clear()
            shells.values.forEach { it.destroy() }
            shells.clear()
            sessions.values.forEach { it.sftp?.destroy(); it.session.destroy() }
            sessions.clear()
        }
    }

    private fun progress(transferId: String) = object : ProgressCallback {
        override fun onProgress(done: ULong, total: ULong) {
            sendEvent("onTransferProgress", mapOf("transferId" to transferId, "done" to done.toDouble(), "total" to total.toDouble()))
        }
    }
}
