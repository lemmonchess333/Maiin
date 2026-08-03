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
 * write strips the field — both fail quietly). This registry pins the
 * machine-checkable lists to one list; `profileFieldRegistry.test.ts` asserts
 *   • registry field set  ≡  rules `allowedUserFields()`
 *   • registry-where-sanitized  ≡  `profileSanitizer.PROFILE_ALLOWED_FIELDS`
 *   • registry  ≡  the `UserProfile*` interfaces in `src/lib/auth.tsx`
 * so drift fails CI instead of shipping a quiet bug.
 *
 * That THIRD pin was missing until 2026-07-25, and its absence is the reason
 * the drift kept recurring: rules and sanitiser were both pinned to the
 * registry, but the TYPE — the file a developer actually edits when adding a
 * field — was pinned to nothing. A field could be declared, wired to a real
 * Settings control, and rejected by the security rules with nothing failing.
 * It happened at least three times: `hideWeightNumber` (#984), `goalWeightKg`
 * (#1140), and then `aiAnalysisEnabled` + `timezone`, both found by adding
 * the pin. The rule uses `hasOnly()`, so an unlisted field doesn't get
 * dropped — it rejects the ENTIRE write.
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
 *  - `serverOnly`    — on the type but deliberately NOT in the rules
 *                      allow-list: Admin-SDK-written, and allow-listing it
 *                      would itself be the bug (`hasUsedTrial`).
 *  - `undeclared`    — in the allow-list but not yet on the type; written via
 *                      a cast. Debt, enumerated so it can only shrink.
 *
 * @oracle — this module's PURPOSE is to be the pinned declaration read by
 *   profileFieldRegistry.test.ts / profileFieldParity.cross.test.ts. It is
 *   test-only by design and always will be; do not "wire it up".
 */

export interface ProfileFieldEntry {
  field: string;
  /** Must have a validator in functions/profileSanitizer.js. */
  sanitized: boolean;
  /** Identity/billing field — in rules allow-list but server-owned. */
  serverGuarded?: boolean;
  /**
   * Declared on `UserProfile` but deliberately ABSENT from the rules
   * allow-list: written only by the Admin SDK, and a client write must stay
   * impossible. Distinct from `serverGuarded`, which IS allow-listed and then
   * held immutable — for these, allow-listing would itself be the bug (a
   * client that could write `hasUsedTrial: false` grants itself a new trial).
   */
  serverOnly?: boolean;
  /**
   * In the rules allow-list but NOT declared on `UserProfile` — written
   * through a cast. Legacy debt, enumerated so it can only shrink: give the
   * field a type and drop this flag. A registry entry is not a licence to
   * skip the type.
   */
  undeclared?: string;
}

export const PROFILE_FIELD_REGISTRY: readonly ProfileFieldEntry[] = [
  { field: "activityLevel", sanitized: true },
  { field: "adaptiveCapState", sanitized: true },
  { field: "adjustCaloriesForTraining", sanitized: true },
  { field: "age", sanitized: true },
  { field: "ageRange", sanitized: true },
  // Settings → Privacy → "AI food analysis". Written client-side via
  // updateProfile, and it was in the UserProfile type but in NEITHER the
  // rules allow-list nor here — so every toggle hit permission-denied. Same
  // shape as the hideWeightNumber (#984) and goalWeight (#1140) misses; the
  // type↔registry parity test is what stops the third repeat.
  { field: "aiAnalysisEnabled", sanitized: false },
  { field: "aiCalorieAdjustment", sanitized: true },
  {
    field: "appleOriginalTransactionId",
    sanitized: false,
    serverGuarded: true,
  },
  {
    field: "appleProductId",
    sanitized: false,
    serverGuarded: true,
    undeclared: "Apple IAP product id, written by verifyApplePurchase",
  },
  { field: "athleteType", sanitized: true },
  { field: "audioCues", sanitized: true },
  // LEGACY: superseded by the share composer's saved default (#1416) —
  // never read, and no longer written since ShareDefaultsRow replaced the
  // two dead Settings toggles. Kept on the same terms as `crewId`.
  { field: "autoPostBadges", sanitized: false },
  { field: "autoPostRuns", sanitized: false },
  { field: "autoPostWorkouts", sanitized: false },
  { field: "autoRestTimer", sanitized: true },
  { field: "createdAt", sanitized: false, serverGuarded: true },
  // LEGACY: crews retired 2026-07-20 — kept so existing docs pass the
  // allow-list; never read or written by live code.
  { field: "crewId", sanitized: false },
  { field: "currentStreak", sanitized: true },
  { field: "customCalorieTarget", sanitized: true },
  { field: "darkMode", sanitized: true },
  { field: "daysPerWeek", sanitized: true },
  { field: "defaultRestSeconds", sanitized: true },
  { field: "defaultVisibility", sanitized: false },
  { field: "displayName", sanitized: true },
  { field: "email", sanitized: true },
  {
    field: "enableRolloverCalories",
    sanitized: true,
    undeclared: "nutrition rollover toggle",
  },
  { field: "equipment", sanitized: true },
  { field: "experience", sanitized: true },
  // Experience auto-detection: last dismissed suggestion, so a declined
  // level change isn't re-nagged on every visit (cross-device, hence
  // profile not localStorage). Direct-write-only — the detection surface
  // writes it via updateProfile; onboarding/configurePlan never send it.
  { field: "experienceSuggestionDismissed", sanitized: false },
  { field: "gender", sanitized: true },
  { field: "goal", sanitized: true },
  { field: "goalWeightKg", sanitized: true },
  { field: "hasUsedTrial", sanitized: false, serverOnly: true },
  { field: "heightCm", sanitized: true },
  { field: "hideSharedRouteEnds", sanitized: true },
  { field: "hideWeightNumber", sanitized: true },
  { field: "injuries", sanitized: true },
  {
    field: "lastActiveAt",
    sanitized: false,
    undeclared: "activity timestamp written by the Firestore triggers",
  },
  { field: "lastLogDate", sanitized: true },
  { field: "longestStreak", sanitized: true },
  { field: "macroTargets", sanitized: true },
  { field: "maxHeartRate", sanitized: true },
  { field: "onboardingComplete", sanitized: false },
  { field: "photoURL", sanitized: true },
  { field: "preferredHeightUnit", sanitized: true },
  { field: "preferredSplit", sanitized: true },
  { field: "preferredWeightUnit", sanitized: true },
  { field: "primaryGoal", sanitized: true },
  { field: "program", sanitized: true },
  { field: "raceGoal", sanitized: true },
  // Pgm6 run-plan tuning knob (quality-work difficulty preset).
  { field: "runDifficulty", sanitized: true },
  { field: "runFitness", sanitized: true },
  { field: "runFrequency", sanitized: true },
  { field: "runMode", sanitized: true },
  // Pgm6 run-plan tuning knob (long-run volume preset).
  { field: "runVolume", sanitized: true },
  { field: "sex", sanitized: true },
  { field: "stripeCustomerId", sanitized: false, serverGuarded: true },
  { field: "stripeSubscriptionId", sanitized: false, serverGuarded: true },
  { field: "subscriptionExpiresAt", sanitized: false, serverGuarded: true },
  { field: "subscriptionSource", sanitized: false, serverOnly: true },
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
  // #962 device-timezone capture, written on boot by AuthProvider. It was
  // never allow-listed, and the capture is fire-and-forget behind
  // `.catch(logger.warn)`, so it failed silently for every user — leaving
  // `timezone` null forever, which the streak-nudge CF reads as
  // "skip-on-null-tz" and never sends.
  { field: "timezone", sanitized: false },
  // D16 personal "why" — free-text motivation (onboarding + Settings).
  { field: "trainingWhy", sanitized: true },
  { field: "trialExpiresAt", sanitized: false, serverGuarded: true },
  { field: "trialExpiryPromptShown", sanitized: false },
  { field: "uid", sanitized: false, serverGuarded: true },
  {
    field: "updatedAt",
    sanitized: false,
    undeclared: "profile write timestamp",
  },
  { field: "weekSchedule", sanitized: true },
  { field: "weekScheduleVersion", sanitized: true },
  { field: "weeklyMealsTarget", sanitized: true },
  { field: "weeklyRateKg", sanitized: true },
  { field: "weeklyRunDaysTarget", sanitized: true },
  { field: "weeklyRunsTarget", sanitized: true },
  { field: "weeklyWorkoutsTarget", sanitized: true },
  { field: "weightKg", sanitized: true },
];

/**
 * Every field a client is permitted to write (≡ rules allowedUserFields()).
 * `serverOnly` entries are excluded BY CONSTRUCTION — they are recorded here
 * so the type↔registry pin is complete, not so they become writable.
 */
export const CLIENT_WRITABLE_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.filter((e) => !e.serverOnly).map((e) => e.field);

/** Fields that flow through the CF sanitiser (≡ profileSanitizer allow-list). */
export const SANITIZED_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.filter((e) => e.sanitized).map((e) => e.field);

/**
 * Every field the `UserProfile` TS type must declare (≡ the union of the
 * `UserProfile*` interfaces in src/lib/auth.tsx). This is the gate that was
 * missing: rules and sanitiser were both pinned to the registry, but the TYPE
 * — the thing a developer actually edits when adding a field — was pinned to
 * nothing, so a field could exist in the type, be written by real UI code, and
 * be rejected by the rules with nobody the wiser.
 */
export const TYPED_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.filter((e) => !e.undeclared).map((e) => e.field);
