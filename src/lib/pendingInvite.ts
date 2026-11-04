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
 * The iPhone app does not open troposfit.com links (no associated
 * domains), so there a person types the code in setup instead.
 */
import { readJson, remove, writeJson } from "@/lib/localStore";
import { INVITE_WINDOW_DAYS, normaliseInviteCode } from "@/lib/inviteCode";
import { INVITE_PARAM } from "@/lib/publicLinks";

const PENDING_INVITE_KEY = "tropos.pendingInvite";
const KEEP_MS = INVITE_WINDOW_DAYS * 86_400_000;

interface StoredInvite {
  code?: unknown;
  savedAt?: unknown;
}

/** The code waiting on this device, or null. */
export function readPendingInvite(now = Date.now()): string | null {
  const stored = readJson<StoredInvite | null>(PENDING_INVITE_KEY, null);
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
  return writeJson(PENDING_INVITE_KEY, { code: normalised, savedAt: now });
}

/** Forget the waiting code: it was used, or the server refused it. */
export function clearPendingInvite(): void {
  remove(PENDING_INVITE_KEY);
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
