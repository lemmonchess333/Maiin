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
 *   • registry-where-retired  ≡  `profileSanitizer.RETIRED_PROFILE_FIELDS`
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
 *                      it MUST have a validator in `functions/profileSanitizer.js`.
 *                      Without one the callables DROP the key and log
 *                      `unexpected_dropped_fields` (the loud-drop guard warns;
 *                      it does not refuse the call), so the field is lost.
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
 *  - `retired`       — nothing reads it and nothing writes it (App1 Q24, 13
 *                      November 2026). Off the type and without a validator,
 *                      but STILL in the rules allow-list, because an older
 *                      build may still send it: sign-up's create checks every
 *                      key with hasOnly(), so dropping one from the rules
 *                      would refuse that build's sign-up outright. The
 *                      sanitiser's `RETIRED_PROFILE_FIELDS` is the same list
 *                      (it drops them without a warning), and
 *                      `functions/scripts/stripRetiredProfileFields.js` deletes
 *                      the stored copies. The rules entries go once
 *                      `config/client.minSupportedVersion` is past the release
 *                      that stopped writing them (docs/qa/pre-launch-backlog.md
 *                      has the steps), and these entries go with them.
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
  /**
   * Retired: no reader and no writer, kept in the rules allow-list only
   * until no supported build sends it. The note says what it was. Never on
   * the type, never sanitised.
   */
  retired?: string;
}

export const PROFILE_FIELD_REGISTRY: readonly ProfileFieldEntry[] = [
  { field: "activationBillingFirsts", sanitized: false, serverOnly: true },
  { field: "activationJourneyVersion", sanitized: false, serverOnly: true },
  { field: "activityLevel", sanitized: true },
  { field: "adaptiveCapState", sanitized: true },
  {
    field: "adjustCaloriesForTraining",
    sanitized: false,
    retired:
      "a switch Settings dropped (Nutr1); the target already counts training",
  },
  // The age an account set up before `birthYear` was given, read as its
  // fallback (`profileAge`). `ageRange` is read and written by nothing now
  // and stays allow-listed for clients still running an older bundle.
  { field: "age", sanitized: true },
  { field: "ageRange", sanitized: true },
  // Settings → Privacy → "AI food analysis". Written client-side via
  // updateProfile, and it was in the UserProfile type but in NEITHER the
  // rules allow-list nor here — so every toggle hit permission-denied. Same
  // shape as the hideWeightNumber (#984) and goalWeight (#1140) misses; the
  // type↔registry parity test is what stops the third repeat.
  { field: "aiAnalysisEnabled", sanitized: false },
  {
    field: "aiCalorieAdjustment",
    sanitized: false,
    retired: "written 0 by setup, never read",
  },
  {
    field: "appleOriginalTransactionId",
    sanitized: false,
    serverGuarded: true,
  },
  {
    field: "appleProductId",
    sanitized: false,
    serverGuarded: true,
    retired: "Apple IAP product id from before RevenueCat; nothing wrote it",
  },
  // Polish2 call 4: Settings → Privacy → Approve followers. Value-gated in
  // firestore.rules (`approveFollowersValid`), which also reads it to
  // decide whether a follow is direct or a request.
  { field: "approveFollowers", sanitized: false },
  { field: "athleteType", sanitized: true },
  { field: "audioCues", sanitized: true },
  {
    field: "autoPostBadges",
    sanitized: false,
    retired: "never written or read; `shareDefaults` decides sharing",
  },
  {
    field: "autoPostRuns",
    sanitized: false,
    retired: "superseded by `shareDefaults` (#1416)",
  },
  {
    field: "autoPostWorkouts",
    sanitized: false,
    retired: "superseded by `shareDefaults` (#1416)",
  },
  { field: "autoRestTimer", sanitized: true },
  { field: "barbellAtHome", sanitized: true },
  // App1 (grill Q57): the year the person was born, which their age is
  // worked out from (src/lib/age.ts). Sent by setup through
  // completeOnboarding and written by Settings → Profile; value-gated in
  // firestore.rules (`birthYearValid`).
  { field: "birthYear", sanitized: true },
  { field: "createdAt", sanitized: false, serverGuarded: true },
  { field: "crewId", sanitized: false, retired: "crews retired 2026-07-20" },
  {
    field: "currentStreak",
    sanitized: false,
    retired: "a copy of streaks/data nothing read on this document",
  },
  { field: "customCalorieTarget", sanitized: true },
  { field: "darkMode", sanitized: true },
  { field: "daysPerWeek", sanitized: true },
  { field: "defaultRestSeconds", sanitized: true },
  {
    field: "defaultVisibility",
    sanitized: false,
    retired: "a Settings select that changed nothing; `shareDefaults` decides",
  },
  { field: "displayName", sanitized: true },
  {
    field: "email",
    sanitized: false,
    retired: "a copy of the Auth address nothing read",
  },
  {
    field: "enableRolloverCalories",
    sanitized: false,
    retired: "a rollover switch that never shipped",
  },
  { field: "equipment", sanitized: true },
  { field: "experience", sanitized: true },
  // Experience auto-detection: last dismissed suggestion, so a declined
  // level change isn't re-nagged on every visit (cross-device, hence
  // profile not localStorage). Direct-write-only — the detection surface
  // writes it via updateProfile; onboarding/configurePlan never send it.
  { field: "experienceSuggestionDismissed", sanitized: false },
  { field: "gender", sanitized: true },
  {
    field: "goal",
    sanitized: false,
    retired: "never written; the phase is `program.goal`",
  },
  { field: "goalWeightKg", sanitized: true },
  { field: "hasUsedTrial", sanitized: false, serverOnly: true },
  { field: "heightCm", sanitized: true },
  { field: "hideSharedRouteEnds", sanitized: true },
  { field: "hideWeightNumber", sanitized: true },
  { field: "injuries", sanitized: true },
  // Soc15 invites: the person's own code, written only by getInviteCode,
  // and when they joined from someone's, written only by redeemInvite. A
  // client that could write the first could claim any code, and one that
  // could clear the second could join from a second invite.
  { field: "inviteCode", sanitized: false, serverOnly: true },
  { field: "invitedAt", sanitized: false, serverOnly: true },
  // Whose invite it was: a block of this account by them renews their code.
  // A client that could write it could renew someone else's by blocking.
  { field: "invitedBy", sanitized: false, serverOnly: true },
  {
    field: "lastActiveAt",
    sanitized: false,
    undeclared: "activity timestamp written by the Firestore triggers",
  },
  {
    field: "lastLogDate",
    sanitized: false,
    retired: "stored null at sign-up, never read",
  },
  // Soc15 call 3: in the weekly leagues or not. Written only by the
  // setLeagueSharing callable, which keeps the membership
  // (leagueMembers/{uid}) in step with the answer.
  { field: "leagueOptIn", sanitized: false, serverOnly: true },
  { field: "liftTimeBudgetMinutes", sanitized: true },
  // Lift18: the unit lifting loads are shown in; loads stay stored in kg.
  { field: "liftingWeightUnit", sanitized: true },
  {
    field: "longestStreak",
    sanitized: false,
    retired: "a copy of streaks/data nothing read on this document",
  },
  {
    field: "macroTargets",
    sanitized: false,
    retired: "setup's day-one split, frozen; History reads the live targets",
  },
  { field: "maxHeartRate", sanitized: true },
  { field: "nonRaceGoal", sanitized: true },
  // S3 activity notification switches (Settings → Notifications). Written
  // only by the Settings page through updateProfile; value-gated in
  // firestore.rules (`notificationPreferencesValid`) and read by the server
  // in createNotification.
  { field: "notificationPreferences", sanitized: false },
  { field: "onboardingComplete", sanitized: false },
  // Stamped by `completeOnboarding` alone: the day setup finished, which a
  // new runner's first weeks count from.
  { field: "onboardingCompletedAt", sanitized: false, serverOnly: true },
  { field: "onboardingPlatform", sanitized: false, serverOnly: true },
  { field: "onboardingSport", sanitized: false, serverOnly: true },
  { field: "photoURL", sanitized: true },
  { field: "preferredDistanceUnit", sanitized: true },
  { field: "preferredHeightUnit", sanitized: true },
  { field: "preferredSplit", sanitized: true },
  { field: "preferredWeightUnit", sanitized: true },
  { field: "primaryGoal", sanitized: true },
  { field: "program", sanitized: true },
  { field: "raceGoal", sanitized: true },
  { field: "raceLegTrim", sanitized: true },
  // Q85: the account has had its free week of a half or full marathon
  // plan. Written once, `true`, by `useRacePlanLocked` through
  // updateProfile; never sent to the plan callables. Value-gated in
  // firestore.rules (`racePlanFreeWeekUsedValid`), which keeps it once set.
  { field: "racePlanFreeWeekUsed", sanitized: false },
  // Pgm6 run-plan tuning knob (quality-work difficulty preset).
  { field: "runDifficulty", sanitized: true },
  { field: "runFitness", sanitized: true },
  { field: "runFrequency", sanitized: true },
  { field: "runMode", sanitized: true },
  { field: "runTimeLimits", sanitized: true },
  // Pgm6 run-plan tuning knob (long-run volume preset).
  { field: "runVolume", sanitized: true },
  { field: "runningBaseline", sanitized: true },
  { field: "sex", sanitized: true },
  // Soc11 share answers, per type ("Share sessions automatically?").
  // Written by the client (`updateShareDefaults`), one field path per type;
  // value-gated in firestore.rules (`shareDefaultsValid`) and validated by
  // the sanitiser on the same vocabulary.
  { field: "shareDefaults", sanitized: true },
  // Run9's starter goal (30 minutes without stopping). Value-gated in
  // firestore.rules (`starterGoalValid`); the programme's transaction writes
  // it when the goal is finished.
  { field: "starterGoal", sanitized: true },
  { field: "stripeCustomerId", sanitized: false, serverGuarded: true },
  { field: "stripeSubscriptionId", sanitized: false, serverGuarded: true },
  { field: "subscriptionExpiresAt", sanitized: false, serverGuarded: true },
  { field: "subscriptionSource", sanitized: false, serverOnly: true },
  { field: "subscriptionTier", sanitized: false, serverGuarded: true },
  // The free trial a purchase is in, written by the RevenueCat sync
  // (functions/lib/trialReminder.js). The reminder email reads it, so a
  // client that could write it could move or cancel its own reminder.
  { field: "subscriptionTrial", sanitized: false, serverOnly: true },
  { field: "targetCalories", sanitized: true },
  {
    field: "targetCarbs",
    sanitized: false,
    retired: "worked out from the calorie target wherever it is shown",
  },
  {
    field: "targetFat",
    sanitized: false,
    retired: "worked out from the calorie target wherever it is shown",
  },
  { field: "targetFiber", sanitized: false, retired: "never written or read" },
  { field: "targetProtein", sanitized: true },
  { field: "targetSodium", sanitized: false, retired: "never written or read" },
  { field: "targetSugar", sanitized: false, retired: "never written or read" },
  { field: "targetWaterGlasses", sanitized: true },
  {
    field: "tdeeBase",
    sanitized: false,
    retired: "the formula target, written and never read",
  },
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
    retired: "a write time only the RevenueCat sync stamped, never read",
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
 * `retired` entries are included: the rules still let an older build write
 * them, though this one never does.
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
  PROFILE_FIELD_REGISTRY.filter((e) => !e.undeclared && !e.retired).map(
    (e) => e.field
  );

/**
 * Retired fields (≡ profileSanitizer `RETIRED_PROFILE_FIELDS`, ⊆ the rules
 * allow-list, absent from the type). The strip script deletes exactly these
 * from stored profiles, plus `program.startWeight`, a key inside a field.
 */
export const RETIRED_PROFILE_FIELDS: readonly string[] =
  PROFILE_FIELD_REGISTRY.filter((e) => e.retired).map((e) => e.field);
