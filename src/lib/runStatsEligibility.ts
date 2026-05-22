import type { ActivityType } from '@/types/run';
import { isOutdoorGpsRun } from './runGuards';

/**
 * Stat eligibility predicates for run records. Three sibling policies
 * — the matrix lives here so the differences are visible side-by-side.
 *
 *  - {@link isVolumeEligible} — does this run count toward total runs,
 *    total distance, weekly km, lifetime totals, streak days, crew
 *    leaderboards? Includes treadmill + manual.
 *  - {@link isPaceEligible} — does this run count toward Best Pace,
 *    Fastest 1K, Fastest 5K, Longest Run, outdoor-style PRs?
 *    Outdoor GPS only. Strict policy.
 *  - {@link isPaceTrendEligible} — does this run count toward the pace
 *    trend badge ("PR" / "Faster" / "Steady") on RunSummary? Outdoor
 *    GPS only, but lenient on legacy docs missing `activityType`.
 *
 * Policy divergence (intentional, do not unify):
 *
 *   ┌────────────────────────┬───────────────────┬────────────────────────┐
 *   │ dimension              │ isPaceEligible    │ isPaceTrendEligible    │
 *   ├────────────────────────┼───────────────────┼────────────────────────┤
 *   │ distance floor         │ ≥ 50m             │ > 0m                   │
 *   │ duration floor         │ ≥ 30s             │ none (no input field)  │
 *   │ undefined activityType │ INELIGIBLE        │ ELIGIBLE (legacy)      │
 *   │ avgPace                │ Number.isFinite>0 │ > 0                    │
 *   └────────────────────────┴───────────────────┴────────────────────────┘
 *
 * The strict policy guards records that ENTER the user's outdoor PR
 * leaderboard — a treadmill 2km / 5:17 record can't masquerade as a
 * Fastest 1K. The lenient policy guards the trend BADGE, where
 * pre-Sprint-1 docs (missing `activityType`) must remain visible or
 * historical trend data evaporates.
 *
 * All helpers are pure and read off Firestore data payloads; defaults
 * treat missing `isInvalid` / `savedAnyway` fields as not-flagged so
 * legacy docs stay counted on their respective policies.
 */

export interface RunRecord {
  isInvalid?: boolean;
  savedAnyway?: boolean;
  distance?: number;     // metres
  duration?: number;     // seconds
  avgPace?: number;      // sec/km
  activityType?: ActivityType | string;
}

/** Narrower input for {@link isPaceTrendEligible} — caller-side shapes
 *  (e.g. `RunForTrend` in paceTrends.ts) carry `distance` and
 *  `avgPace` as required fields because the surrounding logic can't
 *  meaningfully run without them. Kept distinct from `RunRecord`
 *  rather than coercing one shape into the other. */
export interface RunPaceTrendInput {
  isInvalid?: boolean;
  savedAnyway?: boolean;
  distance: number;      // metres
  avgPace: number;       // sec/km
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

/** Pace / outdoor-PR eligibility (STRICT). Layered on top of volume
 *  and further constrained to outdoor GPS sources with a positive,
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

/** Pace trend badge eligibility (LENIENT). Used by the RunSummary
 *  pace-trend chip ("PR" / "Faster" / "Steady"). Distinct from
 *  {@link isPaceEligible} along three dimensions documented in the
 *  policy table at the top of this file.
 *
 *  Missing `activityType` is treated as outdoor for legacy compat —
 *  pre-Sprint-1 docs don't carry the field and excluding them
 *  blanketly would erase historical trend data. */
export function isPaceTrendEligible(run: RunPaceTrendInput): boolean {
  if (run.isInvalid === true) return false;
  if (run.savedAnyway === true) return false;
  if (run.avgPace <= 0 || run.distance <= 0) return false;
  if (run.activityType !== undefined && !isOutdoorGpsRun(run.activityType as ActivityType)) {
    return false;
  }
  return true;
}
