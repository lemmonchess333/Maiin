/**
 * Profile field registry — the single source of truth for which `UserProfile`
 * fields a CLIENT may persist, and which of those flow through the Cloud
 * Function sanitiser.
 *
 * Why this exists (D1, docs/deepening-backlog.md). A persisted profile field
 * historically had to be kept in agreement across FOUR places — the
 * `UserProfile` TS type, `firestore.rules` `allowedUserFields()`,
 * `functions/profileSanitizer.js` `PROFILE_FIELD_VALIDATORS`, and the
 * Settings/onboarding widget. They drifted, and every miss is a SILENT
 * data-loss bug (the security rule rejects the write, or the Cloud-Function
 * write strips the field — both fail quietly). This registry pins the two
 * machine-checkable allow-lists to one list: the parity test
 * (`profileFieldRegistry.test.ts`) asserts
 *   • registry field set  ≡  rules `allowedUserFields()`
 *   • registry-where-sanitized  ≡  `profileSanitizer.PROFILE_ALLOWED_FIELDS`
 * so drift fails CI instead of shipping a quiet bug.
 *
 * Scope (deliberately narrow — see the backlog's scope check): this owns the
 * field LIST and the `sanitized` bit, nothing else. It does NOT generate the
 * rules or the sanitiser (three languages, fragile) — it pins them equal. Add a
 * new client-writable field HERE first, then the test tells you exactly which
 * of rules / sanitiser you still have to update.
 *
 * Fields:
 *  - `sanitized`     — flows through `completeOnboarding` / `configurePlan`, so
 *                      it MUST have a validator in `functions/profileSanitizer.js`
 *                      (the loud-drop guard rejects unknown payload keys).
 *                      `false` = direct-write-only (written via `updateProfile`
 *                      straight to Firestore, never sent to those callables).
 *  - `serverGuarded` — identity / subscription / billing field that appears in
 *                      the rules allow-list but is held immutable from the
 *                      client by `subscriptionFieldsUnchanged()` etc. Never
 *                      sanitised (the server owns its value).
 */

export interface ProfileFieldEntry {
  field: string;
  /** Must have a validator in functions/profileSanitizer.js. */
  sanitized: boolean;
  /** Identity/billing field — in rules allow-list but server-owned. */
  serverGuarded?: boolean;
}

export const PROFILE_FIELD_REGISTRY: readonly ProfileFieldEntry[] = [
  { field: "activityLevel", sanitized: true },
  { field: "adaptiveCapState", sanitized: true },
  { field: "adjustCaloriesForTraining", sanitized: true },
  { field: "age", sanitized: true },
  { field: "ageRange", sanitized: true },
  { field: "aiCalorieAdjustment", sanitized: true },
  {
    field: "appleOriginalTransactionId",
    sanitized: false,
    serverGuarded: true,
  },
  { field: "appleProductId", sanitized: false, serverGuarded: true },
  { field: "athleteType", sanitized: true },
  { field: "audioCues", sanitized: true },
  { field: "autoPostBadges", sanitized: false },
  { field: "autoPostRuns", sanitized: false },
  { field: "autoPostWorkouts", sanitized: false },
  { field: "autoRestTimer", sanitized: true },
  { field: "createdAt", sanitized: false, serverGuarded: true },
  { field: "crewId", sanitized: false },
  { field: "currentStreak", sanitized: true },
  { field: "customCalorieTarget", sanitized: true },
  { field: "darkMode", sanitized: true },
  { field: "daysPerWeek", sanitized: true },
  { field: "defaultRestSeconds", sanitized: true },
  { field: "defaultVisibility", sanitized: false },
  { field: "displayName", sanitized: true },
  { field: "email", sanitized: true },
  { field: "enableRolloverCalories", sanitized: true },
  { field: "equipment", sanitized: true },
  { field: "experience", sanitized: true },
  { field: "gender", sanitized: true },
  { field: "goal", sanitized: true },
  { field: "goalWeightKg", sanitized: true },
  { field: "heightCm", sanitized: true },
  { field: "hideSharedRouteEnds", sanitized: true },
  { field: "hideWeightNumber", sanitized: true },
  { field: "injuries", sanitized: true },
  { field: "lastActiveAt", sanitized: false },
  { field: "lastLogDate", sanitized: true },
  { field: "longestStreak", sanitized: true },
  { field: "macroTargets", sanitized: true },
  { field: "maxHeartRate", sanitized: true },
  { field: "mealReminders", sanitized: false },
  { field: "onboardingComplete", sanitized: false },
  { field: "phaseMode", sanitized: false },
  { field: "photoURL", sanitized: true },
  { field: "preferredHeightUnit", sanitized: true },
  { field: "preferredSplit", sanitized: true },
  { field: "preferredWeightUnit", sanitized: true },
  { field: "primaryGoal", sanitized: true },
  { field: "privacyZones", sanitized: false },
  { field: "program", sanitized: true },
  { field: "raceGoal", sanitized: true },
  { field: "runFitness", sanitized: true },
  { field: "runFrequency", sanitized: true },
  { field: "runMode", sanitized: true },
  { field: "sex", sanitized: true },
  { field: "shoes", sanitized: false },
  { field: "stallPopupCooldowns", sanitized: false },
  { field: "stepGoal", sanitized: false },
  { field: "stripeCustomerId", sanitized: false, serverGuarded: true },
  { field: "stripeSubscriptionId", sanitized: false, serverGuarded: true },
  { field: "subscriptionExpiresAt", sanitized: false, serverGuarded: true },
  { field: "subscriptionTier", sanitized: false, serverGuarded: true },
  { field: "targetCalories", sanitized: true },
  { field: "targetCarbs", sanitized: true },
  { field: "targetFat", sanitized: true },
  { field: "targetFiber", sanitized: true },
  { field: "targetProtein", sanitized: true },
  { field: "targetSodium", sanitized: true },
  { field: "targetSugar", sanitized: true },
  { field: "targetWaterGlasses", sanitized: true },
  { field: "tdeeBase", sanitized: true },
  { field: "trainingPhase", sanitized: false },
  { field: "trialExpiresAt", sanitized: false, serverGuarded: true },
  { field: "trialExpiryPromptShown", sanitized: false },
  { field: "uid", sanitized: false, serverGuarded: true },
  { field: "updatedAt", sanitized: false },
  { field: "weekSchedule", sanitized: true },
  { field: "weekScheduleVersion", sanitized: true },
  { field: "weeklyMealsTarget", sanitized: true },
  { field: "weeklyRateKg", sanitized: true },
  { field: "weeklyRunDaysTarget", sanitized: true },
  { field: "weeklyRunsTarget", sanitized: true },
  { field: "weeklyWorkoutsTarget", sanitized: true },
  { field: "weightKg", sanitized: true },
];

/** Every field a client is permitted to write (≡ rules allowedUserFields()). */
export const CLIENT_WRITABLE_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.map((e) => e.field);

/** Fields that flow through the CF sanitiser (≡ profileSanitizer allow-list). */
export const SANITIZED_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.filter((e) => e.sanitized).map((e) => e.field);
