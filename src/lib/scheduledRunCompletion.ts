/**
 * PR-J — soft-link reframe helper. THE source, not a port.
 *
 * This header used to point at `functions/lib/scheduledRunCompletion.js`
 * as "the CommonJS source of truth" and at a cross-test pinning the two
 * equal. Both were DELETED in #1733: the JS "source" was required by
 * nothing (ADR-0008's motivating case — two suites, a parity pin, zero
 * protection on running code), and the server deliberately answers a
 * DIFFERENT question via `functions/lib/raceDayCompletion.js` (a
 * date-scoped ANY over raw docs, vs this file's claim-map over
 * normalised rows — see that file's non-mirror rationale). This TS file
 * is the only implementation of the client rule and carries its own
 * contract now; there is no second copy to keep in step.
 */

import type {
  ScheduledRunDay,
  ManualCompletion,
} from "@/features/program/programTypes";

const GENERAL_DISTANCE_RATIO = 0.7;

const LEGACY_COMPLETED_STATUSES = new Set([
  "completed_exact",
  "completed_modified",
  "completed_late",
]);

export interface ClaimState {
  claimedSavedRunId?: string;
  manualCompleted: boolean;
  legacyCompleted: boolean;
}

export interface SavedRunLike {
  id: string;
  date?: string;
  distance?: number;
  avgPace?: number;
  templateId?: string;
  createdAt?: { seconds?: number } | Date | number;
}

export interface CompletionDeps {
  paceBucketFor: (saved: SavedRunLike) => "quality" | "easy" | string;
  templateQualityBucket: Record<string, "quality" | "easy">;
  plannedDistanceFor?: (runDay: ScheduledRunDay) => number;
  /**
   * Is this template id a RACE? Supplied rather than derived so this
   * module stays template-agnostic (the Q3 P41 reason `templateQualityBucket`
   * is injected too).
   *
   * Race ids are `5k_race` … `marathon_race`, never the literal "race" —
   * comparing against that literal is the trap CLAUDE.md locks and that
   * `raceRunDaysReconcile`, `runHeroState` and `workoutTemplates` each warn
   * about. It is also the bug this predicate replaces.
   */
  isRaceTemplate?: (templateId: string | undefined) => boolean;
}

function dateKey(dateStr: string | undefined): number | null {
  if (typeof dateStr !== "string" || dateStr.length !== 10) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(5, 7), 10);
  const d = parseInt(dateStr.slice(8, 10), 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return y * 10000 + m * 100 + d;
}

function shiftDateString(dateStr: string, delta: number): string | null {
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

function defaultPlannedDistanceFor(): number {
  return 0;
}

function isLegacyStatus(status: string | undefined): boolean {
  return typeof status === "string" && LEGACY_COMPLETED_STATUSES.has(status);
}

function templateBucket(
  templateId: string | undefined,
  deps: CompletionDeps
): "quality" | "easy" {
  if (!templateId) return "easy";
  const lookup = deps && deps.templateQualityBucket;
  if (!lookup) return "easy";
  return lookup[templateId] === "quality" ? "quality" : "easy";
}

function distanceAndBucketOk(
  runDay: ScheduledRunDay,
  saved: SavedRunLike,
  deps: CompletionDeps
): boolean {
  const plannedDistanceFor =
    (deps && deps.plannedDistanceFor) || defaultPlannedDistanceFor;
  const plannedDistance = plannedDistanceFor(runDay);
  const bucket = templateBucket(runDay.templateId, deps);

  if (plannedDistance > 0) {
    const ratio =
      typeof saved.distance === "number" ? saved.distance / plannedDistance : 0;
    if (ratio < GENERAL_DISTANCE_RATIO) return false;
  }

  if (bucket === "quality") {
    /* Q1 P4 short-circuit: race day completes on a race-templated run
       regardless of pace bucket. You can run your race as a pacer, on a
       bad day, or as a fun run — it is still the race, and gating it on
       pace is how a genuine race day gets left incomplete.

       Was UNREACHABLE until 2026-07-26: it compared BOTH operands to the
       literal "race". `runDay.templateId` is a RUN_TEMPLATES id (`5k_race`
       … `marathon_race`) and `saved.templateId` was undefined for every
       real run, because the useClaimMap adapter read a plain `templateId`
       that saved-run docs do not carry. Detection is by template TYPE via
       the injected predicate now, on both sides. */
    const isRaceTemplate = deps && deps.isRaceTemplate;
    if (
      isRaceTemplate &&
      isRaceTemplate(runDay.userOverride || runDay.templateId) &&
      isRaceTemplate(saved.templateId)
    ) {
      return true;
    }
    const paceBucketFor = deps && deps.paceBucketFor;
    if (!paceBucketFor) return false;
    if (paceBucketFor(saved) !== "quality") return false;
  }

  return true;
}

function compareRunDays(a: ScheduledRunDay, b: ScheduledRunDay): number {
  const di = (a.dayIndex ?? 0) - (b.dayIndex ?? 0);
  if (di !== 0) return di;
  const aId = a.id || "";
  const bId = b.id || "";
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

function createdAtSeconds(c: SavedRunLike["createdAt"]): number | null {
  if (!c) return null;
  if (
    typeof c === "object" &&
    "seconds" in c &&
    typeof c.seconds === "number"
  ) {
    return c.seconds;
  }
  if (c instanceof Date) return Math.floor(c.getTime() / 1000);
  if (typeof c === "number") return c;
  return null;
}

function compareSavedRuns(a: SavedRunLike, b: SavedRunLike): number {
  const aSec = createdAtSeconds(a.createdAt);
  const bSec = createdAtSeconds(b.createdAt);
  if (aSec !== null && bSec !== null && aSec !== bSec) {
    return aSec - bSec;
  }
  const aDate = a.date || "";
  const bDate = b.date || "";
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  const aId = a.id || "";
  const bId = b.id || "";
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

/**
 * Compute the claim map for a set of runDays against saved runs +
 * manual completions. This is the full contract — the JS "source" this
 * doc used to defer to was deleted in #1733 (see the module header).
 */
export function computeClaims(
  runDays: ScheduledRunDay[],
  savedRuns: SavedRunLike[],
  manualCompletions: Record<string, ManualCompletion>,
  _today: string,
  deps: CompletionDeps
): Map<string, ClaimState> {
  const claimMap = new Map<string, ClaimState>();
  const manual = manualCompletions || {};

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

  const eligible = runDays.filter(
    (rd) => !!rd.id && !isLegacyStatus(rd.status)
  );

  const sortedRunDays = eligible.slice().sort(compareRunDays);
  const sortedSavedRuns = savedRuns.slice().sort(compareSavedRuns);

  const claimedSavedRunIds = new Set<string>();

  function tryClaimPhase(
    matchPredicate: (rd: ScheduledRunDay, saved: SavedRunLike) => boolean
  ): void {
    for (const rd of sortedRunDays) {
      const entry = claimMap.get(rd.id!);
      if (!entry || entry.claimedSavedRunId) continue;
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
    return saved.date === shiftDateString(rd.date, 1);
  });

  return claimMap;
}

export function isRunDayComplete(
  runDayId: string,
  claimMap: Map<string, ClaimState>
): boolean {
  const entry = claimMap.get(runDayId);
  if (!entry) return false;
  return (
    !!entry.claimedSavedRunId || entry.manualCompleted || entry.legacyCompleted
  );
}

/**
 * PR-J Q2 P24 — Dominant completion source for a runDay's ✅.
 *
 * Q2 P24 calls for a "visually distinct manual ✅ vs real ✅"
 * across RunWeekStrip + DayPeekCard + DayActionSheet — the user
 * needs to know whether the slot is checked because a real GPS run
 * matched it, or because they tapped Mark complete (manual). Legacy
 * docs (pre-soft-link-reframe completed_*) read as "real" — they
 * represent actual user activity recorded under the old writer.
 *
 * Order of precedence when multiple sources are set on the same
 * entry:
 *   1. `claimedSavedRunId` → "real" (organic saved-run match — the
 *      strongest signal, since it means an actual run landed in
 *      the date window + passed the distance + bucket gates).
 *   2. `legacyCompleted` → "real" — pre-reframe docs are also
 *      actual activity; bucketed alongside organic for UI purposes.
 *   3. `manualCompleted` → "manual" — explicit user-intent without
 *      a matching saved run.
 *   4. None set → null (slot is not completed).
 *
 * Returns null for an entry that isn't in the map at all. Pure
 * lookup; safe to call from render.
 */
export type CompletionKind = "real" | "manual" | null;

export function getCompletionKind(
  runDayId: string,
  claimMap: Map<string, ClaimState>
): CompletionKind {
  const entry = claimMap.get(runDayId);
  if (!entry) return null;
  if (entry.claimedSavedRunId || entry.legacyCompleted) return "real";
  if (entry.manualCompleted) return "manual";
  return null;
}
