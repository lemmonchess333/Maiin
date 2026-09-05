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

import { readString, remove, scopedKey, writeString } from "@/lib/localStore";

const LAST_SHOWN_PREFIX = "tropos:easeNudge:lastShown";
const DISMISSED_PREFIX = "tropos:easeNudge:dismissedWeek";
/** A6: the Sunday weekKey the athlete APPLIED an easier week in — read
 *  by the post-ease bounce check the following week. */
const EASED_PREFIX = "tropos:easeNudge:easedWeek";

function lastShownKey(uid: string): string {
  return scopedKey(LAST_SHOWN_PREFIX, uid);
}
function dismissedKey(uid: string): string {
  return scopedKey(DISMISSED_PREFIX, uid);
}

/** YYYY-MM-DD the card was last shown for this uid, or null. */
export function getLastShownAt(uid: string): string | null {
  return uid ? readString(lastShownKey(uid)) : null;
}

export function setLastShownAt(uid: string, dateKey: string): void {
  if (uid) writeString(lastShownKey(uid), dateKey);
}

/** The Sunday weekKey the user dismissed the card in for this uid, or null. */
export function getDismissedWeekKey(uid: string): string | null {
  return uid ? readString(dismissedKey(uid)) : null;
}

export function setDismissedWeekKey(uid: string, weekKey: string): void {
  if (uid) writeString(dismissedKey(uid), weekKey);
}

function easedKey(uid: string): string {
  return scopedKey(EASED_PREFIX, uid);
}

/** A6: the Sunday weekKey an easier week was applied in, or null. */
export function getEasedWeekKey(uid: string): string | null {
  return uid ? readString(easedKey(uid)) : null;
}

export function setEasedWeekKey(uid: string, weekKey: string): void {
  if (uid) writeString(easedKey(uid), weekKey);
}

/**
 * RUN-EASE-01: forget the eased week, because it was undone.
 *
 * The marker exists to let `evaluatePostEaseBounce` ask "did the quality
 * come back?" the week AFTER an easier week. Left standing through an undo
 * it makes that question dishonest — the app would report a recovery, or a
 * failure to recover, from a reduction the athlete cancelled and never
 * ran. Undo only became reachable beyond an 8-second toast when the
 * snapshot moved server-side, which is what turned this from a
 * theoretical case into a routine one.
 */
export function clearEasedWeekKey(uid: string): void {
  if (uid) remove(easedKey(uid));
}
