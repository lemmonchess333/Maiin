/**
 * When a deleted meal is removed for good (F5c).
 *
 * Deleting a meal in the diary stamps `deletedAt` on it and it waits in
 * Settings, Recently deleted meals. The server's hourly
 * `purgeSoftDeletedMeals` (functions/lib/mealPurge.js) deletes it 30 days
 * after that stamp. This is the app's copy of the 30 days, which the page
 * says and counts down from; `mealPurge.cross.test.ts` runs the server's
 * job against it, so the page never names a day the job does not keep.
 */

/** How long a deleted meal is kept before it is removed for good. */
export const DELETED_MEAL_RETENTION_DAYS = 30;

const DAY_MS = 86_400_000;

/** How long a meal deleted at `deletedAtMs` has left: whole days, counted
 *  up (a meal deleted a minute ago has 30, one in its last 24 hours has 1),
 *  or `due` once its 30 days are up and the job has yet to reach it. */
export type PurgeCountdown = { kind: "days"; days: number } | { kind: "due" };

export function purgeCountdown(
  deletedAtMs: number,
  nowMs: number
): PurgeCountdown {
  const left = deletedAtMs + DELETED_MEAL_RETENTION_DAYS * DAY_MS - nowMs;
  return left > 0
    ? { kind: "days", days: Math.ceil(left / DAY_MS) }
    : { kind: "due" };
}
