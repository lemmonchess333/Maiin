/**
 * PR-J — soft-link reframe helper (TypeScript port).
 *
 * TS-side counterpart to `functions/lib/scheduledRunCompletion.js`
 * (the CommonJS source of truth for the server). Q3 P32 intended a
 * single CommonJS source with TS re-exports via this path, but
 * `tsconfig.app.json:include = ["src"]` makes a cross-module import
 * + `.d.ts` bridge awkward. The port keeps the surface symmetric;
 * the cross-consistency test in
 * `src/lib/__tests__/scheduledRunCompletion.cross.test.ts` pins the
 * JS + TS to produce identical claim maps for shared fixtures so
 * drift is caught at CI time.
 *
 * See `functions/lib/scheduledRunCompletion.js` for the contract
 * doc (Q1–Q3 pins, walk discipline, DI shape). This file is the
 * direct port; comments referencing the locks live in the JS file
 * to avoid maintaining the same doc twice.
 */

import type {
  ScheduledRunDay,
  ManualCompletion,
} from "@/features/program/programTypes";

const RACE_STRICT_DISTANCE_RATIO = 0.95;
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
    // Q1 P4 short-circuit: race-day explicit templateId match
    if (runDay.templateId === "race" && saved.templateId === "race") {
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
 * manual completions. See `functions/lib/scheduledRunCompletion.js`
 * for the full contract — this file is the direct port.
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

export function isRaceDayCompletedStrictly(
  runDayId: string,
  claimMap: Map<string, ClaimState>,
  savedRuns: SavedRunLike[],
  runDay?: ScheduledRunDay,
  deps?: CompletionDeps
): boolean {
  const entry = claimMap.get(runDayId);
  if (!entry || !entry.claimedSavedRunId) return false;
  const saved = savedRuns.find((s) => s.id === entry.claimedSavedRunId);
  if (!saved) return false;
  if (saved.templateId !== "race") return false;

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
