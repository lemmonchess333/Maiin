/**
 * Which activity notifications a person gets: the switches under Settings →
 * Notifications → Activity (S3).
 *
 * S3 locked one switch per kind, calm by default: props and comments on,
 * new followers off, and no prompt nudging anyone to turn more on. Crews,
 * which S3 also named, were retired before this was built; their place went
 * to Circles and Spaces, both on by default, as every notification was
 * before the switches existed.
 *
 * `createNotification` (socialFanout.js) reads `users/{uid}.
 * notificationPreferences` and writes nothing for a kind that is off: a
 * switch that only hid the row would still let the row arrive.
 *
 * The client keeps a copy of the switches and their defaults in
 * src/lib/notificationPreferences.ts so Settings shows what this file will
 * do; notificationPreferences.cross.test.ts pins the two equal, and pins
 * the value gate in firestore.rules to the same keys.
 */

/** The stored keys, in the order Settings lists them. `kudos` is the name
 *  of the notification type; the app calls the action props. */
const NOTIFICATION_CATEGORIES = Object.freeze([
  "kudos",
  "comments",
  "follows",
  "circles",
  "spaces",
]);

/** What a switch is when the person has never touched it. */
const NOTIFICATION_DEFAULTS = Object.freeze({
  kudos: true,
  comments: true,
  follows: false,
  circles: true,
  spaces: true,
});

/**
 * Every notification type, and the switch that controls it. `null` means no
 * switch: the type is always sent. Total over VALID_NOTIFICATION_TYPES (a
 * test holds it there), so a new type has to be given a switch, or null on
 * purpose, here.
 *
 * `challenge_milestone` has no sender today. When one is built, decide its
 * switch then; until then it would arrive unconditionally, like a type with
 * no switch.
 */
const CATEGORY_BY_TYPE = Object.freeze({
  kudos: "kudos",
  comment: "comments",
  follow: "follows",
  challenge_milestone: null,
  circle_focus_backed: "circles",
  circle_milestone: "circles",
  circle_needs_support: "circles",
  circle_joined: "circles",
  circle_routine_shared: "circles",
  space_post_like: "spaces",
  space_post_comment: "spaces",
});

/** The switch for a notification type, or null when it has none. */
function categoryFor(type) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_BY_TYPE, type)
    ? CATEGORY_BY_TYPE[type]
    : null;
}

/**
 * Whether a notification of `type` should be written for someone whose
 * stored preferences are `prefs` (the profile field, which may be absent,
 * null or malformed). A stored boolean decides; anything else falls back to
 * the default, so a bad value can never silence a kind for good.
 */
function wantsNotification(prefs, type) {
  const category = categoryFor(type);
  if (category === null) return true;
  const stored =
    prefs && typeof prefs === "object" && !Array.isArray(prefs)
      ? prefs[category]
      : undefined;
  return typeof stored === "boolean" ? stored : NOTIFICATION_DEFAULTS[category];
}

module.exports = {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_DEFAULTS,
  CATEGORY_BY_TYPE,
  categoryFor,
  wantsNotification,
};
