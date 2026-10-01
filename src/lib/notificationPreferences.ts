/**
 * The activity notification switches — Settings → Notifications → Activity
 * (S3: one switch per kind, props and comments on, new followers off).
 *
 * The server decides what is sent: createNotification
 * (functions/lib/socialFanout.js) reads `profile.notificationPreferences`
 * and writes nothing for a kind that is off. This is the client's copy of
 * the server's switches and defaults (functions/lib/notificationPreferences.js)
 * so Settings shows what the server will do;
 * notificationPreferences.cross.test.ts pins the two equal, and the rules'
 * value gate to the same keys.
 */

/** The stored keys, in the order Settings lists them. `kudos` is the
 *  notification type's name; the app calls the action props. */
export const NOTIFICATION_CATEGORIES = [
  "kudos",
  "comments",
  "follows",
  "circles",
  "spaces",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** As stored on the profile. A switch never touched is absent. */
export type NotificationPreferences = Partial<
  Record<NotificationCategory, boolean>
>;

/** What a switch is when the person has never touched it. */
export const NOTIFICATION_DEFAULTS: Readonly<
  Record<NotificationCategory, boolean>
> = {
  kudos: true,
  comments: true,
  follows: false,
  circles: true,
  spaces: true,
};

/** Whether a kind is on: the stored boolean, else its default — the same
 *  reading the server makes, so a malformed value shows as the default it
 *  will be treated as. */
export function notificationEnabled(
  prefs: NotificationPreferences | null | undefined,
  category: NotificationCategory
): boolean {
  const stored =
    prefs && typeof prefs === "object" && !Array.isArray(prefs)
      ? prefs[category]
      : undefined;
  return typeof stored === "boolean" ? stored : NOTIFICATION_DEFAULTS[category];
}

/** Every switch as it stands, defaults filled in. Written whole, so the
 *  stored map always says what the person saw. */
export function resolvedNotificationPreferences(
  prefs: NotificationPreferences | null | undefined
): Record<NotificationCategory, boolean> {
  const out = {} as Record<NotificationCategory, boolean>;
  for (const category of NOTIFICATION_CATEGORIES) {
    out[category] = notificationEnabled(prefs, category);
  }
  return out;
}
