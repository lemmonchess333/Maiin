/**
 * The one door to the browser's local storage.
 *
 * Every read and write under `src/` goes through here — pinned by
 * `localStorageGuard.test.ts`; `public/init.js` is the single raw reader,
 * because it applies the theme before any bundle can load. Storage can be
 * absent (SSR, a Node test), refuse the getter itself (a browser with site
 * data blocked throws before any method is reached), or throw per call
 * (quota, private mode). Nothing here throws: reads answer with the
 * fallback, and writes report success as a boolean so a caller with an
 * ordering invariant (write the chunks, THEN commit the meta) can stop
 * before committing on top of a write that never landed.
 *
 * Keys are the caller's business, with one rule: storage is per DEVICE, so
 * a key holding per-ACCOUNT state must carry the uid (`scopedKey`) or the
 * next account to sign in on the phone inherits it
 * (`localStorageUidScoping.test.ts` checks every call site).
 */

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * True when storage can be reached at all. For callers that should do LESS
 * without it — skip a one-shot migration rather than re-run it every
 * session. Everyone else just reads and takes the fallback.
 */
export function isAvailable(): boolean {
  return store() !== null;
}

/** The stored string, or null when absent, unreachable or unreadable. */
export function readString(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** True only when the value is now stored. */
export function writeString(key: string, value: string): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** True when the key is gone (a missing key counts); false when storage refused. */
export function remove(key: string): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Parsed JSON at `key`, or `fallback` when absent, unreadable or malformed. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** JSON-serialise and store; false when the value cannot be serialised. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    return writeString(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** Every stored key starting with `prefix` — empty when storage is unreachable. */
export function keysWithPrefix(prefix: string): string[] {
  const out: string[] = [];
  try {
    const s = store();
    if (!s) return out;
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key !== null && key.startsWith(prefix)) out.push(key);
    }
  } catch {
    // A partial listing is still usable; nothing to add.
  }
  return out;
}

/** The per-account form of a key: `<base>:<uid>`. */
export function scopedKey(base: string, uid: string): string {
  return `${base}:${uid}`;
}
