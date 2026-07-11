/**
 * Notification id for the streak-at-risk reminder.
 *
 * Lives in its own module to break the `useStreaks` ↔ `useStreakReminder`
 * import cycle: both need this constant, while `useStreakReminder` also imports
 * the `useStreaks` hook. Sharing the id from here lets `useStreaks` reference it
 * WITHOUT importing `useStreakReminder` (which would close the cycle and let
 * modules observe partially-initialised exports).
 */
export const STREAK_NOTIFICATION_ID = 3001;

/**
 * Notification id for the once-ever first-week (day-2) return nudge — the
 * one-shot local notification scheduled the evening after a brand-new user's
 * first log (D-1, docs/frontend-design-principles-2026-07.md). Distinct id so
 * cancel-on-log for the pending day-2 fire can't clobber the daily streak
 * reminder, and vice versa.
 */
export const FIRST_WEEK_NOTIFICATION_ID = 3002;
