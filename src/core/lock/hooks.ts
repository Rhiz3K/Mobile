type Hook = () => void;

const hooks = new Set<Hook>();

/** Things that must let go of the keyboard when the app locks. */
export function onAppLocked(hook: Hook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

export function runLockHooks(): void {
  hooks.forEach((h) => {
    try {
      h();
    } catch {
      // a broken hook must not stop the lock
    }
  });
}
