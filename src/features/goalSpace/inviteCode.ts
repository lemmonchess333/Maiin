/**
 * When a Circle's invite code stops working, and how the app says so.
 *
 * The server decides: `joinGoalSpace` refuses a code past its expiry, and
 * `renewGoalSpaceInviteCode` gives the owner a new one. This is the app's
 * copy of the rule, so the code it shows the owner carries the same
 * expiry the server will hold an invitee to. `inviteCode.cross.test.ts`
 * pins both halves to `functions/lib/goalSpaceMembership.js`.
 *
 * A code made before codes carried an expiry is as old as its Circle,
 * and one of unknown age reads as expired, as on the server.
 */

import {
  formatShortWeekdayDayMonth,
  formatTimeOfDay,
} from "@/utils/formatters";

/** How long a code works after it is made. */
export const INVITE_CODE_TTL_DAYS = 7;
const INVITE_CODE_TTL_MS = INVITE_CODE_TTL_DAYS * 86_400_000;

/** The ms a Circle's current code stops working, from its space doc. */
export function inviteCodeExpiresAt(space: {
  inviteCodeExpiresAt?: unknown;
  createdAt?: unknown;
}): number {
  const stamped = space.inviteCodeExpiresAt;
  if (typeof stamped === "number" && Number.isFinite(stamped)) return stamped;
  const made = space.createdAt;
  if (typeof made === "number" && Number.isFinite(made)) {
    return made + INVITE_CODE_TTL_MS;
  }
  return 0;
}

/** Whether a code with this expiry has stopped working at `now`. */
export function isInviteCodeExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

/** "Works until 14:05 on Sat 1 Nov", or that it has expired. */
export function inviteCodeExpiryLine(expiresAt: number, now: number): string {
  if (isInviteCodeExpired(expiresAt, now)) return "This code has expired.";
  const at = new Date(expiresAt);
  return `Works until ${formatTimeOfDay(at)} on ${formatShortWeekdayDayMonth(at)}`;
}
