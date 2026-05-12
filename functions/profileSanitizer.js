/**
 * Field-allowlist sanitiser for the `completeOnboarding` callable.
 *
 * Pre-sanitiser the handler validated *required* fields and stripped
 * a small block-list (`stripeCustomerId`, `stripeSubscriptionId`)
 * before writing the WHOLE incoming `profileData` object via
 * `users/{uid}.set(..., { merge: true })`. That left a stored-data
 * surface: a malicious caller could send arbitrary extra fields
 * (e.g. `photoURL: "https://pixel-tracker.example/uid=victim"`) that
 * Firestore would happily store, and downstream renderers would
 * pull into `<img src>` / `<a href>` / leaderboard rows.
 *
 * This module flips the contract to allow-list: only known fields
 * survive, each one type-checked, with `photoURL` further
 * protocol-validated. Anything else is dropped silently — the
 * caller doesn't need to know which fields exist (security by
 * obscurity isn't the goal, but error-leaking the schema isn't
 * either).
 *
 * Pure, no Firebase Admin dependency. Unit-testable.
 */

/**
 * Server-managed fields the caller must never set. These get set
 * deterministically by the handler post-sanitise; including them
 * here makes sure a client-supplied value is dropped even if the
 * handler ordering is ever refactored.
 *
 * `uid`, `subscriptionTier`, `onboardingComplete` are set/overridden
 * by the handler unconditionally and don't need to be sanitised
 * (the post-sanitise overwrite is the gate). They're listed here
 * as documentation of the deny-list intent.
 */
const SERVER_MANAGED_PROFILE_FIELDS = Object.freeze([
  "uid",
  "subscriptionTier",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "appleOriginalTransactionId",
  "appleProductId",
  "subscriptionExpiresAt",
  "trialExpiresAt",
  "createdAt",
]);

/**
 * Allow-list of profile fields the client may supply, mapped to a
 * per-field validator that returns the cleaned value or `undefined`
 * to drop the field. The validators are intentionally narrow:
 * strings get a length cap + control-character strip, numbers a
 * range check, booleans a strict-true/false coerce, enums an
 * `includes()` test.
 *
 * Adding a new field: extend this table. Anything not here is
 * dropped — fail-closed by design.
 */

const MAX_STRING_LENGTH = 200;
const MAX_DISPLAY_NAME_LENGTH = 50;
const MAX_PHOTO_URL_LENGTH = 2048;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;

function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(CONTROL_CHAR_RE, "").trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);
  return trimmed;
}

function cleanEnum(value, allowed) {
  if (typeof value !== "string") return undefined;
  return allowed.includes(value) ? value : undefined;
}

function cleanNumber(value, { min, max, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (typeof min === "number" && value < min) return undefined;
  if (typeof max === "number" && value > max) return undefined;
  return value;
}

function cleanBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * photoURL validation. Must be http(s), parseable, reasonable
 * length, not a data:/javascript:/file: scheme even though those
 * fail the http/https check too. Returning `null` (rather than
 * `undefined`) for an absent-or-cleared value preserves the
 * "user has no photo" state in Firestore.
 */
function cleanPhotoURL(value) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_PHOTO_URL_LENGTH) return undefined;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    return undefined;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
  return parsed.toString();
}

/**
 * Clean a nested object by allow-listing its keys. The sub-object
 * itself must be a plain object (not an Array, not null). Each key
 * goes through its validator; the result is the cleaned object
 * with only valid keys present.
 */
function cleanObject(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out = {};
  for (const [key, validator] of Object.entries(fields)) {
    const cleaned = validator(value[key]);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanInjuries(value) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => cleanString(entry, 60))
    .filter((entry) => entry !== undefined);
  return cleaned.slice(0, 50);
}

function cleanWeekSchedule(value) {
  if (!Array.isArray(value)) return undefined;
  const ALLOWED_TYPES = ["lift", "run", "both", "rest"];
  const cleaned = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const day = cleanNumber(entry.day, { min: 0, max: 6, integer: true });
      const type = cleanEnum(entry.type, ALLOWED_TYPES);
      if (day === undefined || type === undefined) return undefined;
      return { day, type };
    })
    .filter(Boolean)
    .slice(0, 7);
  return cleaned.length > 0 ? cleaned : undefined;
}

const PROFILE_FIELD_VALIDATORS = Object.freeze({
  // Identity / display
  displayName: (v) => cleanString(v, MAX_DISPLAY_NAME_LENGTH),
  email: (v) => cleanString(v, 254),
  photoURL: cleanPhotoURL,
  athleteType: (v) => cleanString(v, 30),

  // Demographics
  gender: (v) => cleanEnum(v, ["male", "female", "other", "prefer_not_say"]),
  ageRange: (v) => cleanString(v, 20),
  age: (v) => cleanNumber(v, { min: 16, max: 120, integer: true }),
  sex: (v) => cleanEnum(v, ["male", "female"]),
  activityLevel: (v) =>
    cleanEnum(v, ["sedentary", "light", "moderate", "active", "very_active"]),

  // Body metrics
  heightCm: (v) => cleanNumber(v, { min: 120, max: 230 }),
  weightKg: (v) => cleanNumber(v, { min: 30, max: 300 }),
  preferredHeightUnit: (v) => cleanEnum(v, ["cm", "ft"]),
  preferredWeightUnit: (v) => cleanEnum(v, ["kg", "lbs"]),

  // Preferences
  darkMode: cleanBoolean,
  autoRestTimer: cleanBoolean,
  defaultRestSeconds: (v) => cleanNumber(v, { min: 0, max: 600, integer: true }),
  audioCues: cleanBoolean,
  enableRolloverCalories: cleanBoolean,

  // Streak summary
  currentStreak: (v) => cleanNumber(v, { min: 0, max: 100000, integer: true }),
  longestStreak: (v) => cleanNumber(v, { min: 0, max: 100000, integer: true }),
  lastLogDate: (v) => {
    if (v === null) return null;
    return cleanString(v, 30);
  },

  // Training targets
  weeklyWorkoutsTarget: (v) => cleanNumber(v, { min: 0, max: 14, integer: true }),
  weeklyMealsTarget: (v) => cleanNumber(v, { min: 0, max: 100, integer: true }),
  weeklyRunsTarget: (v) => cleanNumber(v, { min: 0, max: 14, integer: true }),
  weeklyRunDaysTarget: (v) => cleanNumber(v, { min: 0, max: 14, integer: true }),

  // Program / goal
  primaryGoal: (v) => cleanString(v, 30),
  experience: (v) => cleanString(v, 30),
  daysPerWeek: (v) => cleanNumber(v, { min: 0, max: 14, integer: true }),
  equipment: (v) => cleanString(v, 30),
  preferredSplit: (v) => cleanString(v, 30),
  goal: (v) => cleanString(v, 30),
  runFrequency: (v) => cleanString(v, 30),
  runMode: (v) => cleanEnum(v, ["freeform", "structured", "race_prep"]),
  raceGoal: (v) =>
    cleanObject(v, {
      distance: (d) => cleanEnum(d, ["5k", "10k", "half", "marathon"]),
      targetDate: (d) => cleanString(d, 30),
    }),

  injuries: cleanInjuries,
  weekSchedule: cleanWeekSchedule,

  // TDEE / nutrition targets — numeric ranges sized for human plausibility
  tdeeBase: (v) => cleanNumber(v, { min: 0, max: 10000 }),
  aiCalorieAdjustment: (v) => cleanNumber(v, { min: -2000, max: 2000 }),
  targetCalories: (v) => cleanNumber(v, { min: 0, max: 10000 }),
  targetProtein: (v) => cleanNumber(v, { min: 0, max: 1000 }),
  targetCarbs: (v) => cleanNumber(v, { min: 0, max: 2000 }),
  targetFat: (v) => cleanNumber(v, { min: 0, max: 1000 }),
  customCalorieTarget: (v) => cleanNumber(v, { min: 0, max: 10000 }),
  targetFiber: (v) => cleanNumber(v, { min: 0, max: 500 }),
  targetSugar: (v) => cleanNumber(v, { min: 0, max: 500 }),
  targetSodium: (v) => cleanNumber(v, { min: 0, max: 20000 }),
  targetWaterGlasses: (v) => cleanNumber(v, { min: 0, max: 50, integer: true }),
  adjustCaloriesForTraining: cleanBoolean,

  macroTargets: (v) =>
    cleanObject(v, {
      calories: (n) => cleanNumber(n, { min: 0, max: 10000 }),
      protein: (n) => cleanNumber(n, { min: 0, max: 1000 }),
      carbs: (n) => cleanNumber(n, { min: 0, max: 2000 }),
      fat: (n) => cleanNumber(n, { min: 0, max: 1000 }),
    }),

  program: (v) =>
    cleanObject(v, {
      goal: (g) => cleanString(g, 30),
      startWeight: (n) => cleanNumber(n, { min: 30, max: 300 }),
      currentPhase: (p) => cleanString(p, 30),
    }),
});

const PROFILE_ALLOWED_FIELDS = Object.freeze(Object.keys(PROFILE_FIELD_VALIDATORS));

/**
 * Returns a new object containing only allow-listed profile fields
 * from the input, each one type / range / format validated. Fields
 * absent from the input or failing validation are omitted from the
 * output entirely (Firestore `merge: true` leaves the existing
 * Firestore value in place for those keys).
 *
 * Special cases:
 *  - `photoURL: null` → preserved as `null` (clears the photo).
 *  - `lastLogDate: null` → preserved as `null`.
 *  - All other null values → omitted (treated as "absent").
 *
 * The function does NOT mutate the input.
 */
function sanitizeProfileData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out = {};
  for (const [key, validator] of Object.entries(PROFILE_FIELD_VALIDATORS)) {
    const raw = input[key];
    if (raw === undefined) continue;
    const cleaned = validator(raw);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

module.exports = {
  SERVER_MANAGED_PROFILE_FIELDS,
  PROFILE_ALLOWED_FIELDS,
  sanitizeProfileData,
  cleanPhotoURL,
};
