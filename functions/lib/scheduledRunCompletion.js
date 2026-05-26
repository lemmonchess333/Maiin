/**
 * PR-J — soft-link reframe core helper.
 *
 * Source of truth for "did this planned runDay slot get completed?"
 * Used by:
 *   - Client UI (RunWeekStrip, DayPeekCard, ProgrammeRunSection,
 *     DayActionSheet) via TS re-exports in src/lib/scheduledRunStatus.ts.
 *   - Server (PR-L, future) via direct `require("./lib/scheduledRunCompletion")`.
 *
 * Three primitives per Q3 P33:
 *   - computeClaims(runDays, savedRuns, manualCompletions, today, deps)
 *       → Map<runDayId, ClaimState>
 *   - isRunDayComplete(runDayId, claimMap) → boolean
 *   - isRaceDayCompletedStrictly(runDayId, claimMap, savedRuns) → boolean
 *
 * ClaimState shape (Q3 P45, locked):
 *   { claimedSavedRunId?: string, manualCompleted: boolean, legacyCompleted: boolean }
 *
 * Walk discipline (Q3 P44):
 *   1. Legacy-completed runDays are marked BUT do NOT enter the
 *      claim walk (Q3 P35 — their ✅ comes from status, not from
 *      a saved run; otherwise current runDays could lose claims
 *      to legacy duplicates).
 *   2. Manual completions are recorded as flags but do NOT consume
 *      saved runs (they're a separate intent record).
 *   3. Saved-run claim walk runs in two phases:
 *      a. Same-date matches first, by `dayIndex` ASC; ties by
 *         `runDay.id` lex ASC.
 *      b. Date+1 matches second, same ordering.
 *      Single-claim enforced via a `claimedSavedRunIds` Set.
 *
 * Distance / template (Q1 P2 + P3 + P29):
 *   - planned.distance ≤ 0 (unconfigured slot): date + template-bucket
 *     match, distance branch skipped (P29).
 *   - planned.distance > 0: saved.distance ≥ 0.7 × planned.distance.
 *   - Quality templates (tempo, intervals, race): pace-bucket guard
 *     via injected `paceBucketFor(savedRun) → bucket` — must match
 *     the template's quality bucket.
 *   - Non-quality (easy, long, recovery, shake-out): distance-only.
 *
 * Race-day strict (Q1 P4):
 *   - The general predicate `isRunDayComplete` says "✅" via any of
 *     the three branches.
 *   - Recovery-entry effect needs the STRICT predicate:
 *     templateId === "race" on the saved run AND distance ≥ 95% of
 *     planned. Manual completions do NOT count toward recovery
 *     (Q2 P12).
 *
 * Dependency injection (Q3 P41):
 *   deps = {
 *     paceBucketFor: (saved) => "quality" | "easy" | ...,
 *     templateQualityBucket: Record<templateId, "quality" | "easy">,
 *     plannedDistanceFor?: (runDay) => number, // optional; defaults to a built-in lookup
 *   }
 *
 * Dates (Q3 P40):
 *   All date arguments are pre-stringified "YYYY-MM-DD". Helper
 *   does string compare; no date-utility deps.
 */

const RACE_STRICT_DISTANCE_RATIO = 0.95;
const GENERAL_DISTANCE_RATIO = 0.7;

/**
 * Convert YYYY-MM-DD to a comparable integer date-key for ±1 day
 * arithmetic without external date utilities. Splits on "-" and
 * computes a single number (year * 10000 + month * 100 + day).
 * Cross-month + cross-year arithmetic still works because we never
 * actually add to this number — we only compare equality at known
 * shifts produced by `shiftDateString`.
 */
function dateKey(dateStr) {
  if (typeof dateStr !== "string" || dateStr.length !== 10) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = parseInt(dateStr.slice(8, 10), 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return y * 10000 + m * 100 + d;
}

/**
 * Shift a YYYY-MM-DD string by ±N days. Handles month + year
 * boundaries via the Date constructor (UTC interpretation; the
 * shifted result is still a local YYYY-MM-DD because we use
 * UTC year/month/day getters consistently).
 */
function shiftDateString(dateStr, delta) {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Default planned-distance lookup. Used when `deps.plannedDistanceFor`
 * isn't supplied. Returns 0 to trigger the P29 date+bucket fallback —
 * production deps should inject a real lookup keyed on templateId.
 */
function defaultPlannedDistanceFor() {
  return 0;
}

const LEGACY_COMPLETED_STATUSES = new Set([
  "completed_exact",
  "completed_modified",
  "completed_late",
]);

function isLegacyStatus(status) {
  return LEGACY_COMPLETED_STATUSES.has(status);
}

/**
 * Quality bucket inference for a template, with a defensive
 * default to "easy" when the deps lookup misses (unknown
 * templateId).
 */
function templateBucket(templateId, deps) {
  if (!templateId) return "easy";
  const lookup = deps && deps.templateQualityBucket;
  if (!lookup) return "easy";
  return lookup[templateId] === "quality" ? "quality" : "easy";
}

/**
 * Distance + bucket-guard check for a candidate saved run against
 * a runDay. Returns true if the run satisfies the rule set:
 *   - distance >= 70% of planned (unless planned <= 0, then any)
 *   - non-quality template: pass on distance alone
 *   - quality template: ALSO require pace-bucket match
 */
function distanceAndBucketOk(runDay, saved, deps) {
  const plannedDistanceFor =
    (deps && deps.plannedDistanceFor) || defaultPlannedDistanceFor;
  const plannedDistance = plannedDistanceFor(runDay);
  const bucket = templateBucket(runDay.templateId, deps);

  // Distance branch
  if (plannedDistance > 0) {
    const ratio =
      typeof saved.distance === "number"
        ? saved.distance / plannedDistance
        : 0;
    if (ratio < GENERAL_DISTANCE_RATIO) return false;
  }

  // Quality-bucket guard
  if (bucket === "quality") {
    // Q1 P4 short-circuit: when both sides carry templateId === "race",
    // the explicit template match supersedes the pace heuristic.
    // Race finishes vary widely in pace (a 2-hour half marathon pace
    // sits in the "easy" bucket of the standard pace classifier);
    // the templateId is a stronger signal than the pace bucket.
    if (runDay.templateId === "race" && saved.templateId === "race") {
      return true;
    }
    const paceBucketFor = deps && deps.paceBucketFor;
    if (!paceBucketFor) return false;
    if (paceBucketFor(saved) !== "quality") return false;
  }

  return true;
}

/**
 * Sort runDays for the deterministic claim walk:
 *   - by dayIndex ASC (primary, Q3 P44)
 *   - by id lex ASC (tiebreaker, Q3 P34/P81)
 */
function compareRunDays(a, b) {
  const di = (a.dayIndex ?? 0) - (b.dayIndex ?? 0);
  if (di !== 0) return di;
  const aId = a.id || "";
  const bId = b.id || "";
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

/**
 * Sort saved runs for the deterministic single-claim tiebreaker
 * (Q5 P73 + P81 + P82):
 *   - by createdAt ASC (primary; treats Firestore Timestamp objects
 *     via the .seconds field, with fallback to date string)
 *   - by saved-run id lex ASC (secondary)
 */
function compareSavedRuns(a, b) {
  const aSec =
    a.createdAt && typeof a.createdAt === "object" && a.createdAt.seconds;
  const bSec =
    b.createdAt && typeof b.createdAt === "object" && b.createdAt.seconds;
  if (typeof aSec === "number" && typeof bSec === "number" && aSec !== bSec) {
    return aSec - bSec;
  }
  // Fallback to date string ASC for legacy docs without createdAt
  const aDate = a.date || "";
  const bDate = b.date || "";
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  // Final tiebreaker — id lex
  const aId = a.id || "";
  const bId = b.id || "";
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

/**
 * compute the claim map for a set of runDays against saved runs +
 * manual completions. See file header for full contract.
 */
function computeClaims(runDays, savedRuns, manualCompletions, today, deps) {
  void today; // currently unused at this level (per-runDay date math
  // happens via runDay.date + ±1 shifts); kept in signature for
  // future use + per Q3 P38's "today is always explicit" rule.

  const claimMap = new Map();
  const manual = manualCompletions || {};

  // Phase 0: initialize map with manual + legacy flags. Legacy
  // runDays don't enter the claim walk (Q3 P35).
  for (const rd of runDays) {
    const id = rd.id || "";
    if (!id) continue;
    const legacyCompleted = isLegacyStatus(rd.status);
    const manualCompleted = !!manual[id];
    claimMap.set(id, {
      claimedSavedRunId: undefined,
      manualCompleted,
      legacyCompleted,
    });
  }

  // Eligible runDays for the claim walk: skip legacy-completed
  // (Q3 P35) and missing-id runDays.
  const eligible = runDays.filter(
    (rd) => !!rd.id && !isLegacyStatus(rd.status),
  );

  // Sort once — deterministic walk.
  const sortedRunDays = eligible.slice().sort(compareRunDays);
  const sortedSavedRuns = savedRuns.slice().sort(compareSavedRuns);

  // Two-phase walk: same-date matches first, then date+1.
  // Each saved run can claim at most one slot (Q1 P5).
  const claimedSavedRunIds = new Set();

  function tryClaimPhase(matchPredicate) {
    for (const rd of sortedRunDays) {
      const entry = claimMap.get(rd.id);
      // Already claimed in an earlier phase
      if (entry.claimedSavedRunId) continue;
      for (const saved of sortedSavedRuns) {
        if (claimedSavedRunIds.has(saved.id)) continue;
        if (!matchPredicate(rd, saved)) continue;
        if (!distanceAndBucketOk(rd, saved, deps)) continue;
        entry.claimedSavedRunId = saved.id;
        claimedSavedRunIds.add(saved.id);
        break;
      }
    }
  }

  // Phase 1: same-date matches
  tryClaimPhase((rd, saved) => {
    if (!rd.date || !saved.date) return false;
    return rd.date === saved.date;
  });

  // Phase 2: date+1 matches (day-late)
  tryClaimPhase((rd, saved) => {
    if (!rd.date || !saved.date) return false;
    const plannedKey = dateKey(rd.date);
    const savedKey = dateKey(saved.date);
    if (plannedKey === null || savedKey === null) return false;
    // saved.date should be planned.date + 1 (in days)
    return saved.date === shiftDateString(rd.date, 1);
  });

  return claimMap;
}

/**
 * General completion predicate. OR over the three branches per Q2 P27.
 */
function isRunDayComplete(runDayId, claimMap) {
  const entry = claimMap.get(runDayId);
  if (!entry) return false;
  return (
    !!entry.claimedSavedRunId ||
    entry.manualCompleted ||
    entry.legacyCompleted
  );
}

/**
 * Strict race-day completion predicate per Q1 P4 + Q2 P12.
 * Used by the recovery-entry effect — manual completions do NOT
 * count. Requires:
 *   - claimMap entry has `claimedSavedRunId` set (a real saved run
 *     claimed the slot via `computeClaims`).
 *   - The saved run has `templateId === "race"`.
 *   - Optional: when `runDay` + `deps.plannedDistanceFor` are
 *     supplied, the saved-run distance must be ≥95% of planned.
 *     Pass-through with no distance check when those args are
 *     absent (used by tests / callers that already verified
 *     distance elsewhere).
 *
 * Callers from the recovery-entry effect should always pass the
 * runDay + deps to get the full Q1 P4 strict check.
 */
function isRaceDayCompletedStrictly(
  runDayId,
  claimMap,
  savedRuns,
  runDay,
  deps,
) {
  const entry = claimMap.get(runDayId);
  if (!entry || !entry.claimedSavedRunId) return false;
  const saved = savedRuns.find((s) => s.id === entry.claimedSavedRunId);
  if (!saved) return false;
  if (saved.templateId !== "race") return false;

  // Optional distance check — when caller supplies runDay + deps,
  // enforce the 95% ratio. When omitted, templateId check alone
  // is sufficient (test callers may already know the distance
  // matched via the claim walk's general 70% check).
  if (runDay && deps) {
    const plannedDistanceFor =
      deps.plannedDistanceFor || defaultPlannedDistanceFor;
    const planned = plannedDistanceFor(runDay);
    if (planned > 0) {
      const ratio =
        typeof saved.distance === "number" ? saved.distance / planned : 0;
      if (ratio < RACE_STRICT_DISTANCE_RATIO) return false;
    }
  }

  return true;
}

module.exports = {
  computeClaims,
  isRunDayComplete,
  isRaceDayCompletedStrictly,
};
