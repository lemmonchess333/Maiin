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
