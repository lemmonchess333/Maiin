import type { ActivityType } from '@/types/run';
import { isOutdoorGpsRun } from './runGuards';

/**
 * Stat eligibility predicates for run records. Two layered checks:
 *
 *  - {@link isVolumeEligible} — does this run count toward total runs,
 *    total distance, weekly km, lifetime totals, streak days, crew
 *    leaderboards? Includes treadmill + manual.
 *  - {@link isPaceEligible} — does this run count toward Best Pace,
 *    Fastest 1K, Fastest 5K, Longest Run, outdoor-style PRs?
 *    Outdoor GPS only.
 *
 * Both helpers are pure and read directly off Firestore data
 * payloads, so they work for both new docs (PR #480 metadata
 * present) and legacy docs (no `isInvalid` / `savedAnyway`
 * fields — defaults treat them as not-flagged so historic data
 * stays counted).
 *
 * Why the matrix split: a treadmill 2km / 5:17 record is real
 * activity volume but it can't produce a believable outdoor
 * Best Pace 2:38/km — the user typed the distance, GPS didn't
 * verify it. Counting it for volume but not for pace is the
 * honest middle ground (the alternative — hiding the run
 * entirely from totals — penalises legitimate indoor work).
 */

export interface RunRecord {
  isInvalid?: boolean;
  savedAnyway?: boolean;
  distance?: number;     // metres
  duration?: number;     // seconds
  avgPace?: number;      // sec/km
  activityType?: ActivityType | string;
}

/** Base eligibility floor — also the building block for pace
 *  eligibility. Mirrors the validity contract in
 *  `getInvalidRunReason()` (runGuards.ts) but reads off the
 *  persisted document rather than live values. */
export function isVolumeEligible(run: RunRecord): boolean {
  if (run.isInvalid === true) return false;
  if (run.savedAnyway === true) return false;
  const distance = run.distance ?? 0;
  const duration = run.duration ?? 0;
  return distance >= 50 && duration >= 30;
}

/** Pace / outdoor-PR eligibility. Layered on top of volume and
 *  further constrained to outdoor GPS sources with a positive,
 *  finite avgPace. Treadmill and manual flow through volume but
 *  not here. Unknown / missing activityType is treated
 *  conservatively as ineligible — a legacy doc that doesn't
 *  declare its source shouldn't get to set a Best Pace. */
export function isPaceEligible(run: RunRecord): boolean {
  if (!isVolumeEligible(run)) return false;
  if (!run.activityType) return false;
  if (!isOutdoorGpsRun(run.activityType as ActivityType)) return false;
  const pace = run.avgPace ?? 0;
  return Number.isFinite(pace) && pace > 0;
}
