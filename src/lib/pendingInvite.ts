/**
 * An invite code that arrived in a link (`?invite=K7P49M2H`), kept on this
 * device until setup finishes and uses it.
 *
 * The link opens the web app signed out, and the person may read the
 * welcome screen, sign up and answer setup's questions before there is an
 * account to use it with, across reloads and the Google or Apple sign-in
 * round trip. So the code is read from the address once, at boot, kept in
 * local storage and taken out of the address bar. Setup's invite field
 * starts from it, and People offers it to a new account that finished
 * setup without using it.
 *
 * Per device, not per account: there is no account when it is written. It
 * is kept for the 14 days an account may use an invite and cleared once
 * used or refused, so a second account on the phone does not find it.
 *
 * Installed iPhone builds can receive the same code through Universal
 * Links. Installing the app does not transfer browser storage: copy the
 * code before installing, or tap the original link again afterward.
 */
import { readJson, remove, writeJson } from "@/lib/localStore";
import { INVITE_WINDOW_DAYS, normaliseInviteCode } from "@/lib/inviteCode";
import { INVITE_PARAM } from "@/lib/publicLinks";

const PENDING_INVITE_KEY = "tropos.pendingInvite";
const KEEP_MS = INVITE_WINDOW_DAYS * 86_400_000;

const listeners = new Set<() => void>();
let revision = 0;

/** Each delivered link counts, even if its code is the same as before. */
export function pendingInviteRevision(): number {
  return revision;
}

export interface PendingInviteSnapshot {
  revision: number;
  code: string | null;
}

/** Capture before sending a manually edited or link-filled code. */
export function snapshotPendingInvite(): PendingInviteSnapshot {
  return { revision, code: readPendingInvite() };
}

export function pendingInviteUnchanged(
  snapshot: PendingInviteSnapshot
): boolean {
  return (
    revision === snapshot.revision && readPendingInvite() === snapshot.code
  );
}

/** Same-window updates, including links delivered to an already open app. */
export function subscribePendingInvite(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyPendingInvite(): void {
  revision++;
  for (const listener of listeners) listener();
}

interface StoredInvite {
  code?: unknown;
  savedAt?: unknown;
}

// A native link should still fill the current screen when storage is blocked.
// This fallback deliberately makes no promise across reload or installation.
let volatileInvite: StoredInvite | null | undefined;

/** The code waiting on this device, or null. */
export function readPendingInvite(now = Date.now()): string | null {
  const stored =
    volatileInvite !== undefined
      ? volatileInvite
      : readJson<StoredInvite | null>(PENDING_INVITE_KEY, null);
  if (!stored || typeof stored !== "object") return null;
  const code = normaliseInviteCode(stored.code);
  const savedAt = stored.savedAt;
  if (
    !code ||
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    now - savedAt > KEEP_MS
  ) {
    return null;
  }
  return code;
}

/** Keep `code` for setup. False when it is not a code, or storage refused. */
export function savePendingInvite(code: string, now = Date.now()): boolean {
  const normalised = normaliseInviteCode(code);
  if (!normalised) return false;
  const saved = writeJson(PENDING_INVITE_KEY, {
    code: normalised,
    savedAt: now,
  });
  volatileInvite = saved ? undefined : { code: normalised, savedAt: now };
  notifyPendingInvite();
  return saved;
}

/** Forget the waiting code: it was used, or the server refused it. */
export function clearPendingInvite(snapshot?: PendingInviteSnapshot): void {
  // Clear the code that was waiting when submission began, even if the
  // person manually replaced it. Preserve only a subsequently opened link.
  if (snapshot && !pendingInviteUnchanged(snapshot)) return;
  // Even a refused removal must not resurrect an old stored code in this session.
  volatileInvite = remove(PENDING_INVITE_KEY) ? undefined : null;
  notifyPendingInvite();
}

/**
 * Keep the code an invite link carried, and take it out of the address so
 * it is not shared on or bookmarked. Run once at boot, before the router
 * reads the address. Returns the code it kept, or null.
 */
export function captureInviteFromUrl(
  win: Pick<Window, "location" | "history"> | undefined = typeof window ===
  "undefined"
    ? undefined
    : window
): string | null {
  if (!win) return null;
  let url: URL;
  try {
    url = new URL(win.location.href);
  } catch {
    return null;
  }
  if (!url.searchParams.has(INVITE_PARAM)) return null;
  const code = normaliseInviteCode(url.searchParams.get(INVITE_PARAM));
  if (code) savePendingInvite(code);
  url.searchParams.delete(INVITE_PARAM);
  try {
    win.history.replaceState(
      win.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    /* The code is kept either way; the address keeps it too. */
  }
  return code;
}
