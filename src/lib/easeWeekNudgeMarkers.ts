/**
 * Run14 — local (non-Firestore) markers for the ease-week nudge.
 *
 * A nudge doesn't earn a Firestore write (Run14f): the cooldown
 * timestamp and the per-week dismissal live in localStorage, uid-scoped
 * so account B on a shared device never inherits account A's nudge
 * state (same posture as offlineQueue / runResumeStorage).
 *
 * Best-effort throughout — private-mode / SSR / quota failures fall
 * through to "no marker" (the nudge simply behaves as if never shown /
 * never dismissed), never throwing into the render path.
 */

const LAST_SHOWN_PREFIX = "tropos:easeNudge:lastShown";
const DISMISSED_PREFIX = "tropos:easeNudge:dismissedWeek";

function lastShownKey(uid: string): string {
  return `${LAST_SHOWN_PREFIX}:${uid}`;
}
function dismissedKey(uid: string): string {
  return `${DISMISSED_PREFIX}:${uid}`;
}

/** YYYY-MM-DD the card was last shown for this uid, or null. */
export function getLastShownAt(uid: string): string | null {
  if (typeof localStorage === "undefined" || !uid) return null;
  try {
    return localStorage.getItem(lastShownKey(uid));
  } catch {
    return null;
  }
}

export function setLastShownAt(uid: string, dateKey: string): void {
  if (typeof localStorage === "undefined" || !uid) return;
  try {
    localStorage.setItem(lastShownKey(uid), dateKey);
  } catch {
    /* best-effort */
  }
}

/** The Sunday weekKey the user dismissed the card in for this uid, or null. */
export function getDismissedWeekKey(uid: string): string | null {
  if (typeof localStorage === "undefined" || !uid) return null;
  try {
    return localStorage.getItem(dismissedKey(uid));
  } catch {
    return null;
  }
}

export function setDismissedWeekKey(uid: string, weekKey: string): void {
  if (typeof localStorage === "undefined" || !uid) return;
  try {
    localStorage.setItem(dismissedKey(uid), weekKey);
  } catch {
    /* best-effort */
  }
}
