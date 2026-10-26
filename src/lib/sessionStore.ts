/**
 * Small per-visit memory in the browser's session storage: what a screen
 * should still hold when the person comes back to it in the same visit (a
 * tab chosen, a half-typed meal, a sign-in form), and nothing that must
 * outlive the app closing.
 *
 * Session storage can be absent or refuse every call (a private window,
 * blocked site data), so nothing here throws: a read answers null and a
 * write reports whether it landed. The screen then simply starts fresh.
 * As with `localStore`, a key holding one account's state carries its uid.
 */

function store(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function readSessionString(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeSessionString(key: string, value: string): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeSessionKey(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    // Nothing to undo: the screen starts fresh next time.
  }
}

export function readSessionJson<T>(key: string): T | null {
  const raw = readSessionString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSessionJson(key: string, value: unknown): boolean {
  try {
    return writeSessionString(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
