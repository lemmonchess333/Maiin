/**
 * Race-day completion — the SERVER rule, extracted from index.js.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS A DELIBERATE NON-MIRROR. Do not pin it against
 * `src/lib/scheduledRunCompletion.ts` with an equality cross-test.
 * ─────────────────────────────────────────────────────────────────────
 *
 * The client and the server answer DIFFERENT questions about the same
 * race day, over DIFFERENT data shapes:
 *
 *   client — "is this plan slot complete?" It runs over a *normalised*
 *     `SavedRunLike` (produced by the `useClaimMap` adapter, which maps
 *     each Firestore row into `{ templateId, ... }`) and resolves the
 *     slot through a CLAIM MAP: the run that this runDay claimed.
 *
 *   server (here) — "was this race actually run?" It runs over RAW
 *     Firestore docs, which carry `actualTemplateId` (what RunSummary
 *     writes — there is no plain `templateId` field on the doc), and
 *     asks a date-scoped ANY question: did any race-templated run on
 *     the race date clear the distance bar?
 *
 * They disagree by construction on real cases — e.g. two race-templated
 * runs on the same date: the client resolves whichever the slot claimed,
 * the server accepts either. An equality pin between them would be
 * WRONG in the same way an equality pin on `dateUtils.js` (UTC server /
 * local client) would be wrong.
 *
 * History (`/improve-codebase-architecture`, 2026-07-11): a
 * `functions/lib/scheduledRunCompletion.js` port of the CLIENT rule was
 * written and cross-tested, but never `require`d by anything — because
 * it reads `templateId`, which raw docs don't have, so wiring it in
 * would have matched nothing and read every race as a no-show. Two
 * copies were pinned to each other and NEITHER was the running copy;
 * the rule below (third implementation, inline and unpinned) was what
 * actually ran. That port and its cross-test are deleted; this module
 * is the running rule, pinned by golden fixtures in
 * `functions/__tests__/raceDayCompletion.test.js`.
 *
 * Pure — no Firestore handle, no admin SDK. Callers pass plain data.
 */

const { isRaceTemplateId } = require("./raceTemplateIds");

/** Q1 P4: a race counts as run at ≥95% of the planned distance. */
const RACE_STRICT_DISTANCE_RATIO = 0.95;

/** Planned race distance in metres, by race-goal distance key. */
const PLANNED_RACE_DISTANCE_METERS = Object.freeze({
  "5k": 5000,
  "10k": 10000,
  half: 21097,
  marathon: 42195,
});

/** Post-race easy weeks, by race-goal distance key. Mirrors the
 *  scheduler's `recoveryWeeksForDistance` VALUES by intent — but the
 *  server derives `recoveryEndDate` from it AND uses that date as the
 *  identity check for "which race did recovery come from", so a drift
 *  here mis-identifies the completed race. Pinned by fixtures below. */
const RECOVERY_WEEKS_BY_DISTANCE = Object.freeze({
  "5k": 1,
  "10k": 2,
  half: 3,
  marathon: 4,
});

/** Planned distance for a race-goal key, or 0 when unknown/unset.
 *  0 is the documented "unconfigured goal accepts any distance"
 *  fallback (Q1 P29), NOT an error. */
function plannedDistanceFor(distanceKey) {
  return PLANNED_RACE_DISTANCE_METERS[distanceKey] || 0;
}

/** Post-race recovery weeks for a race-goal key, or 0 when unknown. */
function recoveryWeeksFor(distanceKey) {
  return RECOVERY_WEEKS_BY_DISTANCE[distanceKey] || 0;
}

/**
 * Does ONE raw saved-run doc count as running this race?
 *
 * Gate ORDER is load-bearing and preserved verbatim from the inline
 * original — a numeric `distance` is required BEFORE the zero-planned
 * fallback, so a race-templated run with no distance does NOT count
 * even when the goal is unconfigured. (Reordering these two would
 * change production behaviour; this module is an extraction, not a
 * rewrite.)
 *
 *   1. not `isInvalid` / `savedAnyway` — a "Save anyway" on a borked
 *      GPS trace the user explicitly flagged must never clear a no-show;
 *   2. `distance` is a number;
 *   3. `plannedDistanceMeters <= 0` → nothing to measure against, so the
 *      race-type `actualTemplateId` is the only evidence left and IS
 *      required (Q1 P29 fallback). Resolved through the pinned
 *      `raceTemplateIds` mirror — it compared against the literal "race"
 *      until 2026-07-26, which no doc satisfies; see that module;
 *   4. otherwise distance ≥ ratio × planned.
 *
 * EVIDENCE, NOT CEREMONY (2026-08-12). Gates 2 and 4 used to be `AND`ed:
 * a run had to be race-templated *and* clear the distance bar. But
 * `actualTemplateId` is only written when the run was launched from the
 * scheduled slot — `freeformPlanMetadata` writes null — so a user who
 * tapped Start Run on the start line saved their marathon untemplated,
 * `isStrictRaceRun` returned false, and `dailyRaceReconciliationSweep`
 * recorded a `race_no_show` for a race they had just run. No recovery
 * entry, and at `NO_SHOW_EXIT_GRACE_DAYS = 14` the L4 auto-exit strips
 * `raceGoal` outright — the race goal is lost for having opened the app
 * the wrong way.
 *
 * The tag and the distance are two forms of the same evidence, and
 * requiring both meant requiring the one that is absent exactly when it
 * matters. ≥95% of the planned distance ON the race date is the stronger
 * of the two, so it now stands alone. The tag still carries the
 * zero-planned branch, where there is no distance to reason from.
 *
 * This is the server counterpart of the client fix in
 * `src/lib/scheduledRunCompletion.ts`; the two remain a deliberate
 * non-mirror (95% here vs 70% there — the server writes a recovery block
 * off this answer, the client only draws a tick).
 *
 * UNIFICATION NOTE: the two inline copies this replaces disagreed on
 * exactly one input — race-templated run with a NON-numeric `distance`
 * and a zero planned distance. The sweep's copy required a numeric
 * distance (rejected); the recovery-entry copy skipped the type check
 * when planned was 0 (accepted). This module takes the sweep's stricter
 * reading. The divergence is unreachable in production: `plannedDistanceFor`
 * returns 0 only for a distance key outside {5k,10k,half,marathon}, and
 * `raceGoal.distance` is a closed enum, so planned is always > 0 on a
 * real doc. Recorded rather than silently resolved.
 */
function isStrictRaceRun(savedRun, plannedDistanceMeters) {
  if (!savedRun) return false;
  if (savedRun.isInvalid === true || savedRun.savedAnyway === true) {
    return false;
  }
  if (typeof savedRun.distance !== "number") return false;
  if (!plannedDistanceMeters || plannedDistanceMeters <= 0) {
    // No planned distance to measure against, so the template tag is the
    // only evidence this was a race at all. By TYPE, via the pinned id
    // mirror — NOT `=== "race"`, which no doc ever satisfies (real ids
    // are `5k_race` … `marathon_race`). That comparison made this
    // predicate always false, so every completed race read as a no-show
    // and the recovery entry never fired.
    return isRaceTemplateId(savedRun.actualTemplateId);
  }
  return savedRun.distance / plannedDistanceMeters >= RACE_STRICT_DISTANCE_RATIO;
}

/**
 * Did ANY run in a date-scoped, bounded list count as running this race?
 * `savedRunsForDate` is filtered to the race date by the caller.
 */
function hasStrictRaceMatch(savedRunsForDate, plannedDistanceMeters) {
  if (!Array.isArray(savedRunsForDate) || savedRunsForDate.length === 0) {
    return false;
  }
  for (const run of savedRunsForDate) {
    if (isStrictRaceRun(run, plannedDistanceMeters)) return true;
  }
  return false;
}

module.exports = {
  RACE_STRICT_DISTANCE_RATIO,
  PLANNED_RACE_DISTANCE_METERS,
  RECOVERY_WEEKS_BY_DISTANCE,
  plannedDistanceFor,
  recoveryWeeksFor,
  isStrictRaceRun,
  hasStrictRaceMatch,
};
