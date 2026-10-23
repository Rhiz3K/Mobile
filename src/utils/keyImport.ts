import {
  convertKeyToOpenssh,
  inspectKey,
  isSshEngineAvailable,
  SshError,
} from "@/modules/termix-ssh";

export interface ImportedKey {
  key: string;
  /** The `authorized_keys` line, when the key could be read. */
  publicKey?: string;
  /** A PuTTY key was turned into OpenSSH text. */
  converted: boolean;
  /** The key is locked and no passphrase (or a wrong one) was given. */
  locked: boolean;
}

/**
 * Gets a picked or pasted private key ready to save. PuTTY keys become OpenSSH
 * text with the same passphrase, so every client reads them. Without the SSH
 * engine (web, Expo Go) the text is kept as it is.
 */
export function importPrivateKey(
  text: string,
  passphrase?: string,
): ImportedKey {
  const key = text.trim();
  const plain = { key, converted: false, locked: false };
  if (!isSshEngineAvailable || !key) return plain;
  try {
    const info = inspectKey(key, passphrase);
    if (info.format !== "ppk") {
      return { ...plain, publicKey: info.publicOpenssh };
    }
    return {
      key: convertKeyToOpenssh(key, passphrase, passphrase),
      publicKey: info.publicOpenssh,
      converted: true,
      locked: false,
    };
  } catch (err) {
    const locked =
      err instanceof SshError &&
      (err.kind === "passphraseRequired" || err.kind === "badPassphrase");
    return { ...plain, locked };
  }
}

/** The public key line for a private key, read on the phone. Null when it can't be read here. */
export function publicKeyOf(text: string, passphrase?: string): string | null {
  if (!isSshEngineAvailable) return null;
  return inspectKey(text.trim(), passphrase).publicOpenssh;
}

/** One line for the toast after loading a key file. */
export function importMessage(name: string, imported: ImportedKey): string {
  if (imported.converted)
    return `Loaded ${name} and changed it to OpenSSH format`;
  if (imported.locked) {
    return `Loaded ${name}. It needs its passphrase to connect`;
  }
  return `Loaded ${name}`;
}
