# termix-ssh

The phone's own SSH and SFTP engine. A Rust core on [russh](https://github.com/warp-tech/russh) and
[russh-sftp](https://github.com/AspectUnk/russh-sftp), exposed to Kotlin and Swift with
[UniFFI](https://github.com/mozilla/uniffi-rs), wrapped as an Expo module. The local transport in
`src/core/transport` builds on it, so the app can reach hosts with no Termix server.

## What it does

- Logins: password, key (OpenSSH, PEM, PKCS8, PuTTY PPK) with or without passphrase, key plus password,
  OpenSSH user certificates, keyboard-interactive (every round goes to the app, so TOTP, push and Warpgate
  work like on the server)
- Host key check before login, with the raw blob hex Termix stores and the `SHA256:` fingerprint; host
  certificates are reported with their CA
- Shell with a pty and resize, exec, SFTP list, stat, streamed download and upload, remove
- Local forwards and a SOCKS5 proxy on the phone, jump hosts (any number of hops)
- Keepalive with interval and count max, like core's `sshOptions`
- Core's algorithm list, plus a legacy set (ssh-rsa, sha1 key exchange, 3des, hmac-sha1) behind
  `allowLegacyAlgorithms`. Not supported: `sntrup761x25519-sha512` (mlkem768 and curve25519 are)

## Use

```ts
import { connect } from "@/modules/termix-ssh";

const session = await connect(
  { host, port: 22, username, password },
  {
    verifyHostKey: async (key) => askUser(key),
    keyboardInteractive: async (round) => askUser(round.prompts),
  },
);
const shell = await session.openShell(
  { cols: 80, rows: 24 },
  { onData: (bytes) => term.write(bytes), onExit: () => {} },
);
await shell.write("ls\n");
session.onDisconnect((reason) => {});
```

Errors are `SshError` with a `kind` (`auth`, `hostKeyRejected`, `passphraseRequired`, ...).
`isSshEngineAvailable` is false in Expo Go and on web.

## Layout

| Path               | What                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| `rust/`            | The engine crate (`termix_ssh_core`) and its scenario tests                        |
| `bindgen/`         | UniFFI binding generator                                                           |
| `android/`, `ios/` | Expo module glue; `uniffi/` and `ios/Generated/` are generated bindings, committed |
| `index.ts`, `src/` | JS API                                                                             |
| `test-server/`     | Docker OpenSSH servers the tests run against                                       |
| `engine.lock.json` | The engine release this code expects, with sha256 of each archive                  |

## Binaries

The compiled engine is not in git. The SSH engine workflow builds it and publishes a GitHub release
named `termix-ssh-v<version>`. During `expo prebuild` (and so on EAS), `plugins/withTermixSsh.js` runs
`scripts/fetch-ssh-engine.cjs`, which downloads the archives pinned in `engine.lock.json`, checks their
sha256 and unpacks them to `android/src/main/jniLibs` and `ios/TermixSshCore.xcframework`.

A Jest test fails when `rust/` changes without a new release. To ship a Rust change:

1. Bump `version` in `package.json`.
2. Run `scripts/gen-bindings.sh` and commit the bindings (CI checks they are current).
3. Run the SSH engine workflow with publish on, then commit the `engine.lock.json` it attaches to the
   release.

To build locally instead: `scripts/build-android.sh` (needs `ANDROID_NDK_HOME` and `cargo-ndk`) or
`scripts/build-ios.sh` (macOS), then `node scripts/fetch-ssh-engine.cjs --from modules/termix-ssh/dist`.

## Tests

```sh
docker compose -f test-server/compose.yml up -d --build
cd rust && SSH_TEST_DOCKER=1 cargo test --release
```

The JS wrapper has Jest tests in `tests/modules/termix-ssh`.

## Notes for callers

- Long loops (transfers) run inside Rust. Driving them step by step from Kotlin or Swift through UniFFI
  allocates native memory per poll that only GC frees.
- Every socket the engine opens or accepts sets `SO_NOSIGPIPE` on iOS, where SIGPIPE would kill the app.
- Panics unwind and come back as errors, they never abort the app.
