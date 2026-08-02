/* ─────────────────────────────────────────────
   Run Day Scheduler
   Auto-distributes run types across the week,
   or generates a periodized race-prep plan.
   ───────────────────────────────────────────── */

import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay, RunPlan } from "./programTypes";
import { HARD_RUN_TYPES } from "./programTypes";
import {
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";

// Re-export so existing imports of these types from runScheduler keep
// working. The single source of truth lives in programTypes (P0-A spec v7).
export type { ScheduledRunDay, RunPlan };

/* ─────────────────────────────────────────────
   Race Prep Plan Generator
   ───────────────────────────────────────────── */

interface RaceConfig {
  peakLongKm: number;
  baseLongKm: number;
  minWeeks: number;
}

const RACE_CONFIGS: Record<string, RaceConfig> = {
  "5k": { peakLongKm: 8, baseLongKm: 4, minWeeks: 4 },
  "10k": { peakLongKm: 12, baseLongKm: 6, minWeeks: 6 },
  half: { peakLongKm: 20, baseLongKm: 10, minWeeks: 8 },
  marathon: { peakLongKm: 32, baseLongKm: 14, minWeeks: 12 },
};

/**
 * PR-K Q9b — distance-aware hard cap on taper duration.
 *
 * Replaces the prior 25%-of-plan rule which mis-scaled at the short
 * end (a full-length 5K plan landed on 2 weeks of taper — too much
 * for a 5K). Each entry counts taper weeks IMMEDIATELY BEFORE the
 * final race week (which keeps its own "race" phase classification).
 *
 *   5K       → 1 taper week
 *   10K      → 1 taper week
 *   half     → 2 taper weeks
 *   marathon → 3 taper weeks
 *
 * Hard cap: taper phase begins at `totalWeeks - taperWeeks - 1`
 * (the -1 leaves room for the trailing race week). For plans whose
 * `totalWeeks` is shorter than `taperWeeks + base + build` (eg. a
 * compressed 4-week marathon plan), taper still respects the cap
 * but the build phase collapses first. Base phase is then whatever
 * remains, never negative.
 */
export const TAPER_WEEKS_BY_DISTANCE: Record<
  "5k" | "10k" | "half" | "marathon",
  number
> = {
  "5k": 1,
  "10k": 1,
  half: 2,
  marathon: 3,
};

function getPhaseForWeek(
  weekIndex: number,
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon"
): "base" | "build" | "taper" | "race" {
  if (weekIndex >= totalWeeks - 1) return "race";
  const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
  /* Taper occupies the `taperWeeks` immediately before the final
     race week. For a 12-week marathon (taperWeeks=3): race=11,
     taper=8/9/10, build/base split the remainder. */
  if (weekIndex >= totalWeeks - 1 - taperWeeks) return "taper";
  /* Base/build split on the remaining weeks. 0.4 of the remaining
     pre-taper window goes to base, the rest is build. Keeps the
     historical "longer plans get a proper base block" behaviour
     without leaking into the now-distance-aware taper. */
  const preTaperWeeks = Math.max(1, totalWeeks - 1 - taperWeeks);
  if (weekIndex < preTaperWeeks * 0.4) return "base";
  return "build";
}

/** Run9 phase-3 (Slice B) — the taper-safe FLOOR, in weeks, per distance.
 *
 *  Floor = taperWeeks + 1 (locked 2026-05-29). Below this there isn't even
 *  room for the distance's taper plus the race week, so compressing toward
 *  the date is no longer the safe default — the plan flips to "finish-safely".
 *  5k=2, 10k=2, half=3, marathon=4. */
export function getRaceFloorWeeks(
  distance: "5k" | "10k" | "half" | "marathon"
): number {
  return TAPER_WEEKS_BY_DISTANCE[distance] + 1;
}

/** Ideal-build length per distance (5k=4, 10k=6, half=8, marathon=12). */
export function getRaceMinWeeks(
  distance: "5k" | "10k" | "half" | "marathon"
): number {
  return RACE_CONFIGS[distance].minWeeks;
}

export type RaceTiming = "healthy" | "compressible" | "below-floor";

/** Three-state timing classification for the Realign decision (Run9 phase-3):
 *
 *   weeksRemaining >= minWeeks          → "healthy"      (full ideal build)
 *   floor <= weeksRemaining < minWeeks  → "compressible" (compress-to-keep-date
 *                                          is the safe default — `compressed`)
 *   weeksRemaining < floor              → "below-floor"  (finish-safely is the
 *                                          honest default; compress no longer
 *                                          offered as safe)
 *
 * Pure; the Realign UI branches on this to pick the primary action + copy. */
export function classifyRaceTiming(input: {
  distance: "5k" | "10k" | "half" | "marathon";
  weeksRemaining: number;
}): RaceTiming {
  const minWeeks = RACE_CONFIGS[input.distance].minWeeks;
  const floor = getRaceFloorWeeks(input.distance);
  if (input.weeksRemaining >= minWeeks) return "healthy";
  if (input.weeksRemaining >= floor) return "compressible";
  return "below-floor";
}

/**
 * Clamp a carried 0-based `currentWeek` into a freshly (re)generated plan's
 * bounds. `currentWeek` is 0-based and the race cockpit renders
 * `currentWeek + 1`, so the last valid index is `totalWeeks - 1` — clamping to
 * `totalWeeks` (the previous behaviour) would still display "Week N+1 of N".
 * Returns a value in `[0, totalWeeks - 1]`, or 0 for a degenerate plan.
 */
export function clampPlanWeek(currentWeek: number, totalWeeks: number): number {
  if (!Number.isFinite(totalWeeks) || totalWeeks <= 0) return 0;
  return Math.min(Math.max(0, currentWeek), totalWeeks - 1);
}

export function getRacePhaseLabel(
  weekIndex: number,
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon"
): string {
  const phase = getPhaseForWeek(weekIndex, totalWeeks, distance);
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

/**
 * Convenience predicate for surfacing UI affordances (PR-K Q9d):
 * is the current week IN the taper phase for this race plan? Returns
 * false for non-race-prep modes (no totalWeeks / distance available).
 */
export function isCurrentWeekInTaper(
  currentWeek: number | undefined,
  totalWeeks: number | undefined,
  distance: "5k" | "10k" | "half" | "marathon" | undefined
): boolean {
  if (currentWeek == null || totalWeeks == null || !distance) return false;
  return getPhaseForWeek(currentWeek, totalWeeks, distance) === "taper";
}

/* ═══════════════════════════════════════════════════════════════
   P0-3 · v2 SCHEDULER API · spec v7
   ═══════════════════════════════════════════════════════════════

   The V2 functions below take `weekSchedule` directly (instead of
   deriving lift days from a count + cap) and emit ScheduledRunDay
   in v2 shape (id / date / weekKey / status native — no
   post-processing bridge in planBuilder).

   Key changes from V1:
   - Accept the weekSchedule the caller already has (single source
     of truth — same array Home/Programme render against).
   - Run-eligible slots = days with type "run" or "both". No more
     `7 - liftDayCount` cap that previously prevented hybrid users
     from having scheduled runs on lift days.
   - Stress-aware long-run placement: prefer non-Both slots so the
     hardest run isn't accidentally paired with a lift day. If only
     Both slots are available, accept the pairing (UI can flag it).
   - Native v2 ScheduledRunDay output: id / date / weekKey / status
     populated at construction time, not bolted on after.
   - Compressed-plan rules in race-prep mode: cap hard runs / softer
     long-run progression / skip intervals when below race-distance
     minimum weeks. Honest "compressed" labelling.

   V1 functions stay for back-compat with useProgram.ts callers.
   Migration to V2 happens in P0-5 (onboarding) + Configure Plan. */

/** Pick a long-run slot from available run-eligible day indices.
 *  Stress-aware: prefer single-modality "run" slots over "both"
 *  slots so the hardest session isn't paired with a lift day by
 *  default. Falls back to any available slot (with the same
 *  weekend bias as V1) when no run-only slots exist. */
function pickLongRunSlot(
  runEligibleSlots: number[],
  weekSchedule: ScheduleDay[]
): number {
  // Categorise: run-only (no lift on that day) vs both (lift+run)
  const runOnlySlots = runEligibleSlots.filter(
    (d) => weekSchedule[d]?.type === "run"
  );
  const bothSlots = runEligibleSlots.filter(
    (d) => weekSchedule[d]?.type === "both"
  );

  // Preference: weekend run-only > any run-only > weekend both > any both
  const weekendRunOnly = runOnlySlots.find((d) => d === 0 || d === 6);
  if (weekendRunOnly !== undefined) return weekendRunOnly;
  if (runOnlySlots.length > 0) return runOnlySlots[0];
  const weekendBoth = bothSlots.find((d) => d === 0 || d === 6);
  if (weekendBoth !== undefined) return weekendBoth;
  return bothSlots[0] ?? runEligibleSlots[0];
}

/** Build a runDay in v2 shape directly. */
function buildRunDayV2(args: {
  dayIndex: number;
  templateId: string;
  type: string;
  weekStart: Date;
}): ScheduledRunDay {
  const weekKey = localWeekKey(args.weekStart);
  const date = localDateString(addLocalDays(args.weekStart, args.dayIndex));
  return {
    id: generateScheduledRunId(
      { dayIndex: args.dayIndex, templateId: args.templateId },
      weekKey
    ),
    weekKey,
    date,
    dayIndex: args.dayIndex,
    templateId: args.templateId,
    type: args.type,
    completed: false,
    status: "planned",
  };
}

/* ─────────────────────────────────────────────
   Pgm6 · Run-plan tuning knobs (locked 2026-07-04)
   ───────────────────────────────────────────── */

/** Long-run size preset — the "volume" knob. Deliberately NOT weekly
 *  frequency (that's already the user's weekSchedule; duplicating it
 *  here would create a second source of truth). */
export type RunVolumePreset = "lighter" | "standard" | "bigger";

/** Quality-work preset — the "difficulty" knob. Controls how much
 *  tempo/interval work a week carries, never the pace targets (paces
 *  stay VDOT-derived in runPaces). */
export type RunDifficultyPreset = "gentler" | "standard" | "harder";

export interface RunTuning {
  volume: RunVolumePreset;
  difficulty: RunDifficultyPreset;
}

/** `standard`/`standard` is pinned by tests to be byte-identical to
 *  the pre-Pgm6 scheduler output — absent knobs change nothing. */
export const DEFAULT_RUN_TUNING: RunTuning = {
  volume: "standard",
  difficulty: "standard",
};

/** Resolve the profile's persisted knobs (missing/foreign → standard —
 *  lazy default, no migration). Single place every regen site derives
 *  tuning from, so the read can't drift across the eight call sites. */
export function runTuningFromProfile(profile: {
  runVolume?: string;
  runDifficulty?: string;
}): RunTuning {
  const volume: RunVolumePreset =
    profile.runVolume === "lighter" || profile.runVolume === "bigger"
      ? profile.runVolume
      : "standard";
  const difficulty: RunDifficultyPreset =
    profile.runDifficulty === "gentler" || profile.runDifficulty === "harder"
      ? profile.runDifficulty
      : "standard";
  return { volume, difficulty };
}

/**
 * The long-run tiers available to the scheduler, ascending.
 *
 * Kept as a local ladder rather than derived from RUN_TEMPLATES so the
 * scheduler's choice is explicit and ordered; pinned set-equal to the
 * `type: "long"` templates by `longRunProgression.test.ts`.
 */
const LONG_RUN_TIERS: ReadonlyArray<{ id: string; km: number }> = [
  { id: "long_10k", km: 10 },
  { id: "long_15k", km: 15 },
  { id: "long_20k", km: 20 },
  { id: "long_25k", km: 25 },
  { id: "long_30k", km: 30 },
];

/** Every 4th week is a cutback — the long run steps back rather than up. */
const CUTBACK_EVERY = 4;
/** How much a cutback week takes off the ramped distance. */
const CUTBACK_FRACTION = 0.75;

/**
 * Pgm6 volume knob, expressed as a scale on the distance's OWN peak.
 *
 * The pre-existing knob was absolute — `lighter` clamped every distance to
 * the 10K tier and `bigger` unlocked the 15K tier from a 10km peak — which
 * reproduced the same defect this module exists to fix, one level down: a
 * marathon and a half on `lighter` got byte-identical long runs. Scaling the
 * distance's own peak keeps the knob's meaning (a lighter or bigger version
 * of THIS race's plan) while preserving the race-relative shape.
 *
 * `bigger` is additionally clamped to the top tier: 25% over a marathon's
 * 32km peak would prescribe 40km long runs, past every mainstream ceiling
 * (Pfitzinger tops out ~32-35km, Hansons ~26km). The knob tunes the plan; it
 * does not get to invent a training load no methodology endorses.
 */
const LIGHTER_PEAK_FACTOR = 0.75;
const BIGGER_PEAK_FACTOR = 1.25;

function effectivePeakKm(peakLongKm: number, volume: RunVolumePreset): number {
  if (volume === "lighter") return peakLongKm * LIGHTER_PEAK_FACTOR;
  if (volume === "bigger") {
    const ceiling = LONG_RUN_TIERS[LONG_RUN_TIERS.length - 1].km;
    return Math.min(peakLongKm * BIGGER_PEAK_FACTOR, ceiling);
  }
  return peakLongKm;
}

/**
 * Target long-run distance for a given week of a race plan.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * It replaces a picker that returned one of two fixed templates for the
 * WHOLE plan. The consequences were not subtle: a 27-week marathon plan
 * prescribed `long_15k` every single week and then a 42.2 km race — a 2.8x
 * jump from the longest training run. `peakLongKm: 32` was declared in
 * RACE_CONFIGS and never reached, because it only ever fed a `>= 15`
 * comparison, so marathon and half generated identical long runs.
 *
 * ── What the literature actually supports ────────────────────────────────
 *
 * That the long run must PROGRESS toward the race demand is not seriously
 * disputed by any mainstream methodology — Daniels, Pfitzinger & Douglas,
 * Hansons and Noakes disagree about the ceiling, not about the ramp. Their
 * marathon ceilings bracket this implementation: Hansons is deliberately the
 * most conservative at ~26 km (justified by high weekly volume and cumulative
 * fatigue), Pfitzinger goes to 32-35 km. A 30 km peak sits inside that range.
 *
 * The SHAPE here is convention rather than trial-proven, and it is worth
 * being honest about which is which:
 *   - ramp toward the race demand — universal, uncontested;
 *   - periodic cutback weeks — universal practice, thin direct evidence;
 *   - the "10% per week" rule — deliberately NOT used. It is folk wisdom, and
 *     the one RCT to test it directly (Buist et al., 2008) found a 10%-graded
 *     programme did not reduce injury rate versus a standard one. Capping the
 *     ramp by tier and inserting cutbacks is what the actual programmes do.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 *
 * Linear ramp from the distance's `baseLongKm` to the volume-adjusted peak
 * across the pre-taper weeks, with the peak landing on the LAST pre-taper
 * week, a cutback every 4th week, and taper/race weeks handled by the caller.
 */
export function longRunKmForWeek(input: {
  weekIndex: number;
  totalWeeks: number;
  baseLongKm: number;
  peakLongKm: number;
  taperWeeks: number;
  volume: RunVolumePreset;
}): number {
  const { weekIndex, totalWeeks, baseLongKm, taperWeeks, volume } = input;
  // No headroom in the PLAN — checked before the knob, so "bigger" cannot
  // manufacture headroom the caller deliberately withheld. This is what makes
  // the below-floor caller's safety precedence structural rather than a
  // coercion: it passes peak === base, and neither knob can act on that.
  if (input.peakLongKm <= baseLongKm) return baseLongKm;
  // ...and none left after the knob: "lighter" is allowed to flatten it.
  const peak = effectivePeakKm(input.peakLongKm, volume);
  if (peak <= baseLongKm) return baseLongKm;

  // Pre-taper window: [0, lastRampWeek]. The final race week and the taper
  // weeks before it are the caller's business.
  const lastRampWeek = Math.max(0, totalWeeks - 1 - taperWeeks - 1);
  if (lastRampWeek === 0) return baseLongKm;

  const clamped = Math.min(Math.max(0, weekIndex), lastRampWeek);
  const progress = clamped / lastRampWeek;
  const ramped = baseLongKm + (peak - baseLongKm) * progress;

  // Cutback every 4th week — but never on the final ramp week, which is the
  // peak the whole block builds toward.
  const isCutback =
    (weekIndex + 1) % CUTBACK_EVERY === 0 && weekIndex !== lastRampWeek;
  return isCutback ? Math.max(baseLongKm, ramped * CUTBACK_FRACTION) : ramped;
}

/** Snap a target distance to the nearest tier at or below it, with the
 *  shortest tier as the floor. Never prescribes MORE than asked for. */
export function longTierForKm(km: number): string {
  let chosen = LONG_RUN_TIERS[0];
  for (const tier of LONG_RUN_TIERS) {
    if (tier.km <= km) chosen = tier;
  }
  return chosen.id;
}

/** Resolve the long-run template for a week of a race plan. Taper and race
 *  weeks drop to an easy run — the taper's volume cut, unchanged from the
 *  original behaviour. */
function pickLongTemplateId(input: {
  weekIndex: number;
  totalWeeks: number;
  phase: "base" | "build" | "taper" | "race";
  baseLongKm: number;
  peakLongKm: number;
  taperWeeks: number;
  volume: RunVolumePreset;
}): string {
  if (input.phase === "taper" || input.phase === "race") return "easy_30";
  return longTierForKm(longRunKmForWeek(input));
}

export interface StructuredWeekV2Input {
  /** The user's weekly type structure. Must be 7 entries. */
  weekSchedule: ScheduleDay[];
  /** 1-indexed week number (drives even/odd quality alternation). */
  weekNumber: number;
  /** Local-date "YYYY-MM-DD" representing the Sunday of the target
   *  week. Used to populate `date` + `weekKey` on every runDay. */
  weekStart: string;
}

/** V2 structured-week scheduler. Drives from `weekSchedule`, emits
 *  v2-shaped runDays. */
export function scheduleStructuredWeekV2(
  input: StructuredWeekV2Input
): ScheduledRunDay[] {
  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) return [];

  const weekStart = parseLocalDate(input.weekStart);
  const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
  const remaining = runEligibleSlots.filter((d) => d !== longSlot);
  const result: ScheduledRunDay[] = [];

  // Long run (single — even at 4+ runs/week structured users get one
  // long, one quality, rest easy).
  result.push(
    buildRunDayV2({
      dayIndex: longSlot,
      templateId: "long_10k",
      type: "long",
      weekStart,
    })
  );

  if (remaining.length > 0) {
    // Quality session — tempo on even weeks, intervals on odd.
    const isTempoWeek = input.weekNumber % 2 === 0;
    const qualityType = isTempoWeek ? "tempo" : "intervals";
    const qualityTemplateId = isTempoWeek
      ? "tempo_20"
      : input.weekNumber % 4 < 2
        ? "5x1k"
        : "8x400";
    result.push(
      buildRunDayV2({
        dayIndex: remaining[0],
        templateId: qualityTemplateId,
        type: qualityType,
        weekStart,
      })
    );

    // Remaining → easy
    for (let i = 1; i < remaining.length; i++) {
      result.push(
        buildRunDayV2({
          dayIndex: remaining[i],
          templateId: "easy_30",
          type: "easy",
          weekStart,
        })
      );
    }
  }

  return result.sort((a, b) => a.dayIndex - b.dayIndex);
}

/**
 * PR-E: Recovery-phase week generator. All scheduled run/both
 * slots emit `easy_30` regardless of weekly position — no long
 * run, no tempo, no intervals. Frequency unchanged from the
 * user's weekSchedule.
 *
 * Used by `refreshRunSchedule` when `runPlan.phase === "recovery"`.
 * Auto-entered by `completeRunDay` (PR-D) when the race-day
 * runDay transitions to completed_*; exits via the post-race
 * card's "Skip recovery early" affordance (PR-C) or by the
 * one-week grace beyond `recoveryEndDate` (load-effect logic in
 * useProgram).
 */
export function scheduleRecoveryWeekV2(input: {
  weekSchedule: ScheduleDay[];
  weekStart: string;
}): ScheduledRunDay[] {
  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) return [];

  const weekStart = parseLocalDate(input.weekStart);
  return runEligibleSlots
    .map((dayIndex) =>
      buildRunDayV2({
        dayIndex,
        templateId: "easy_30",
        type: "easy",
        weekStart,
      })
    )
    .sort((a, b) => a.dayIndex - b.dayIndex);
}

export interface RacePlanV2Input {
  weekSchedule: ScheduleDay[];
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
  /** Total runs target per week. Used in v1 as the slot cap; in v2
   *  the weekSchedule is authoritative — this only seeds the structure
   *  for the race-prep generator's internal planning. */
  weeklyRunDays: number;
  /** Local "YYYY-MM-DD". REQUIRED — race-prep totalWeeks calc must
   *  be deterministic. */
  currentDate: string;
  /** Local "YYYY-MM-DD" Sunday of week 0. */
  weekStart: string;
  /** Pgm6 knobs. Optional and defaulting to `standard`/`standard`
   *  (byte-identical to pre-Pgm6 output) so legacy callers and
   *  profiles without the fields change nothing — but EVERY live
   *  regen path must thread the profile's tuning or the weekly
   *  refresh will silently regress a tuned plan back to standard
   *  (the tested-copy-vs-running-copy drift class). Derive via
   *  `runTuningFromProfile(profile)`. */
  tuning?: RunTuning;
}

export interface RacePlanV2Output {
  totalWeeks: number;
  /** True when totalWeeks < race-config minWeeks. UI flags this as
   *  "compressed" so user knows the plan was shortened from the
   *  ideal. */
  compressed: boolean;
  /** Run9 phase-3 (Slice B): true when totalWeeks fell below the taper-safe
   *  floor (= taperWeeks + 1). The week content is then the "finish-safely"
   *  shape — all easy, no quality, the long run capped at baseLongKm.
   *  `belowFloor` implies `compressed`. */
  belowFloor: boolean;
  /** Week-by-week scheduled runs. weeks[0] is the current week. */
  weeks: ScheduledRunDay[][];
}

/** V2 race-prep generator. Drives from weekSchedule, applies
 *  compressed-plan safety rules, emits v2-shaped runDays. */
export function generateRacePlanV2(input: RacePlanV2Input): RacePlanV2Output {
  const config = RACE_CONFIGS[input.raceGoal.distance];
  const tuning = input.tuning ?? DEFAULT_RUN_TUNING;
  const now = parseLocalDate(input.currentDate);
  const target = parseLocalDate(input.raceGoal.targetDate);
  const weekStartDate = parseLocalDate(input.weekStart);
  const diffMs = target.getTime() - now.getTime();
  const naturalWeeks = Math.max(1, Math.ceil(diffMs / (7 * 86400000)));
  // R2: whole weeks from the CURRENT week's start to the race's calendar week.
  // When the race is in the CURRENT week (offset <= 0) the plan is a single week
  // ending on race day — a same-week race has no room for two forward weeks, and
  // the old `Math.max(naturalWeeks, 2)` floor pushed it into a phantom FUTURE
  // week (finalWeekStart a week past the race → a negative raceDayIndex → the
  // race vanished from the rail). For every other race the formula is unchanged
  // (currentDate-derived weeks, 2-week floor), so normal plans are untouched.
  const raceWeekOffset = Math.floor(
    (target.getTime() - weekStartDate.getTime()) / (7 * 86400000)
  );
  const totalWeeks = raceWeekOffset <= 0 ? 1 : Math.max(naturalWeeks, 2);
  const compressed = totalWeeks < config.minWeeks;
  // Run9 phase-3 (Slice B): below the taper-safe floor (= taperWeeks + 1),
  // compressing is no longer safe — the week content flips to "finish-safely"
  // (all easy, no quality, the long run capped at baseLongKm so there are no
  // week-over-week jumps). belowFloor implies compressed by construction
  // (floor <= minWeeks for every distance).
  const belowFloor = totalWeeks < getRaceFloorWeeks(input.raceGoal.distance);

  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) {
    // Shouldn't happen — race_prep requires at least 2 runs per week
    // and the UI enforces it. Defensive fallback: empty plan.
    return { totalWeeks, compressed, belowFloor, weeks: [] };
  }

  const weeks: ScheduledRunDay[][] = [];

  // RUN-M2: the race must land ON `targetDate` — the server reconciliation
  // (_needsRaceNoShowEvaluation / _decideRecoveryEntry) finds the race runDay
  // by `rd.date === raceGoal.targetDate`. Placing it on the long-run slot (as
  // before) left the race dated on the wrong day-of-week, so that equality
  // never held and the no-show / recovery deciders silently bailed. Compute the
  // race day's index within the FINAL week from the target date itself.
  const finalWeekStart = addLocalDays(weekStartDate, (totalWeeks - 1) * 7);
  const raceDayIndex = Math.round(
    (target.getTime() - finalWeekStart.getTime()) / 86400000
  );

  for (let w = 0; w < totalWeeks; w++) {
    const phase = getPhaseForWeek(w, totalWeeks, input.raceGoal.distance);
    // Each week's start advances by 7 days from week 0
    const weekStart = addLocalDays(weekStartDate, w * 7);
    const week: ScheduledRunDay[] = [];

    const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
    const remaining = runEligibleSlots.filter((d) => d !== longSlot);

    // RUN-M2: race week is identical whether or not the plan is belowFloor —
    // the race on `targetDate` (so `date === raceGoal.targetDate`) plus easy
    // shakeouts on the user's OTHER run-eligible days. The race day is placed
    // by date, not by the long-run slot, and is excluded from the easy set so
    // it isn't double-booked (it need not be a scheduled run day at all — you
    // race on race day regardless of the weekly template).
    if (phase === "race") {
      week.push(
        buildRunDayV2({
          dayIndex: raceDayIndex,
          templateId: pickRaceTemplateId(input.raceGoal.distance),
          type: "race",
          weekStart,
        })
      );
      runEligibleSlots
        .filter((d) => d !== raceDayIndex)
        .forEach((d) =>
          week.push(
            buildRunDayV2({
              dayIndex: d,
              templateId: "easy_30",
              type: "easy",
              weekStart,
            })
          )
        );
      weeks.push(week.sort((a, b) => a.dayIndex - b.dayIndex));
      continue;
    }

    // Run9 phase-3 (Slice B) — finish-safely shape. Below the taper-safe
    // floor we DON'T silently compress quality into a doomed plan; we keep the
    // race date and emit an honest risk-managed week: the race day stays the
    // race; every other week is one capped long run (baseLongKm — no jumps
    // toward peak) + all easy, never tempo/intervals. The UI names the risk
    // via runPlan.belowFloor.
    if (belowFloor) {
      // Race week already handled above; here phase is base/build/taper.
      week.push(
        buildRunDayV2({
          dayIndex: longSlot,
          // Cap at baseLongKm (not peak) so the long run never jumps, and
          // with it the Pgm6 safety precedence: peak === base leaves no
          // headroom, so "bigger" has nothing to inflate into.
          //
          // Be clear about its status: with the CURRENT floor definition
          // this cap is belt-and-braces, not load-bearing. belowFloor means
          // totalWeeks < taperWeeks + 1, which forces longRunKmForWeek's
          // pre-taper window to zero, so the ramp is already flat here
          // whatever peak it is handed. Mutating this argument to
          // config.peakLongKm changes no output today — a fact pinned by
          // `longRunProgression.test.ts` ("a below-floor plan has no room to
          // ramp"), so that lowering getRaceFloorWeeks surfaces the
          // dependency instead of silently making this the only guard.
          templateId: pickLongTemplateId({
            weekIndex: w,
            totalWeeks,
            phase,
            baseLongKm: config.baseLongKm,
            peakLongKm: config.baseLongKm,
            taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
            volume: tuning.volume,
          }),
          type: phase === "taper" ? "easy" : "long",
          weekStart,
        })
      );
      remaining.forEach((d) =>
        week.push(
          buildRunDayV2({
            dayIndex: d,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })
        )
      );
      weeks.push(week.sort((a, b) => a.dayIndex - b.dayIndex));
      continue;
    }

    // Long run (race week already handled above; phase is base/build/taper).
    week.push(
      buildRunDayV2({
        dayIndex: longSlot,
        templateId: pickLongTemplateId({
          weekIndex: w,
          totalWeeks,
          phase,
          baseLongKm: config.baseLongKm,
          peakLongKm: config.peakLongKm,
          taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
          volume: tuning.volume,
        }),
        type: phase === "taper" ? "easy" : "long",
        weekStart,
      })
    );

    if (remaining.length > 0) {
      // Compressed-plan rule: cap hard sessions at 1/week (vs 1
      // long + 1 quality in standard plans during build). Also
      // skip intervals if heavily compressed (totalWeeks < minWeeks/2).
      //
      // Pgm6 difficulty knob composes with the safety rules, never
      // against them — caps only ever tighten:
      //   gentler → quality every OTHER build week, tempo only (no
      //             intervals), taper quality dropped.
      //   harder  → a second quality session in uncompressed build
      //             weeks with spare slots. Compressed/below-floor
      //             plans IGNORE "harder" (safety caps win).
      const gentler = tuning.difficulty === "gentler";
      // Heavy compression zeroes out ALL build quality — that safety
      // rule stays keyed on compression alone.
      const skipQualityEntirely =
        compressed && totalWeeks < config.minWeeks / 2;
      const hardCapApplies = compressed || gentler;
      const allowSecondQuality = tuning.difficulty === "harder" && !compressed;

      if (phase === "base") {
        // Base: all easy (compressed plans extend base proportionally
        // since there's no time for a real build phase)
        remaining.forEach((d) =>
          week.push(
            buildRunDayV2({
              dayIndex: d,
              templateId: "easy_30",
              type: "easy",
              weekStart,
            })
          )
        );
      } else if (phase === "build") {
        const allowQuality = !hardCapApplies || w % 2 === 0;
        if (allowQuality && !skipQualityEntirely) {
          // 1 quality + rest easy (or all easy if compressed and
          // the long run already consumed the week's quality budget).
          // Gentler forces the quality to tempo — no intervals.
          const qualityType = gentler
            ? "tempo"
            : w % 2 === 0
              ? "tempo"
              : "intervals";
          const qualityId = qualityType === "tempo" ? "tempo_20" : "5x1k";
          week.push(
            buildRunDayV2({
              dayIndex: remaining[0],
              templateId: qualityId,
              type: qualityType,
              weekStart,
            })
          );
          // Harder: a SECOND quality session (the other flavour) when
          // the week has a spare slot and no safety cap applies.
          const secondQualityHere = allowSecondQuality && remaining.length >= 2;
          if (secondQualityHere) {
            const secondType = qualityType === "tempo" ? "intervals" : "tempo";
            week.push(
              buildRunDayV2({
                dayIndex: remaining[1],
                templateId: secondType === "tempo" ? "tempo_20" : "5x1k",
                type: secondType,
                weekStart,
              })
            );
          }
          remaining.slice(secondQualityHere ? 2 : 1).forEach((d) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: "easy_30",
                type: "easy",
                weekStart,
              })
            )
          );
        } else {
          // Skip quality this week — all easy
          remaining.forEach((d) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: "easy_30",
                type: "easy",
                weekStart,
              })
            )
          );
        }
      } else if (phase === "taper") {
        // Taper: 1 short quality + easy. Compressed plans skip the
        // taper quality entirely (already low volume); gentler drops
        // it too (freshness over sharpening). Harder does NOT add
        // taper work — taper is about arriving fresh.
        if (!compressed && !gentler) {
          week.push(
            buildRunDayV2({
              dayIndex: remaining[0],
              templateId: "8x400",
              type: "intervals",
              weekStart,
            })
          );
          remaining.slice(1).forEach((d) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: "easy_30",
                type: "easy",
                weekStart,
              })
            )
          );
        } else {
          remaining.forEach((d) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: "easy_30",
                type: "easy",
                weekStart,
              })
            )
          );
        }
      } else {
        // Race week: 1 shakeout (the long slot already has the race),
        // rest easy
        remaining.forEach((d) =>
          week.push(
            buildRunDayV2({
              dayIndex: d,
              templateId: "easy_30",
              type: "easy",
              weekStart,
            })
          )
        );
      }
    }

    weeks.push(week.sort((a, b) => a.dayIndex - b.dayIndex));
  }

  // Run9 phase-3 (Slice C) — clash flag. pickLongRunSlot prefers run-only
  // slots and only falls back to a "both" day when none exist, so a HARD run
  // landing on a both-day is the forced lift+run clash (the 6-day-lifter case
  // R3-placement flagged). Flag it so the UI can surface "shares a day with
  // lifting" — the run is still placed, never dropped. Easy runs on both-days
  // stay unflagged (low stress).
  const bothDays = new Set(
    input.weekSchedule.filter((d) => d.type === "both").map((d) => d.day)
  );
  const flaggedWeeks = weeks.map((week) =>
    week.map((rd) =>
      HARD_RUN_TYPES.has(rd.type) && bothDays.has(rd.dayIndex)
        ? { ...rd, clashesWithLift: true }
        : rd
    )
  );

  return { totalWeeks, compressed, belowFloor, weeks: flaggedWeeks };
}

/** Race template IDs by distance. Centralised to avoid scattering
 *  string literals through the scheduler. Each distance maps to
 *  its own race template in RUN_TEMPLATES — pre-PR-0a this
 *  fallback returned "5k_race" for every distance, which
 *  collapsed 10K / half / marathon race days to a 5K prefill. */
function pickRaceTemplateId(
  distance: "5k" | "10k" | "half" | "marathon"
): string {
  switch (distance) {
    case "5k":
      return "5k_race";
    case "10k":
      return "10k_race";
    case "half":
      return "half_race";
    case "marathon":
      return "marathon_race";
  }
}

/**
 * PR-D / PR-E: recovery duration by race distance, in whole weeks.
 * Used by `completeRunDay` to set `runPlan.recoveryEndDate` when a
 * race-day runDay transitions to completed_*. Standard coach
 * periodisation: bigger races → longer recovery.
 */
export function recoveryWeeksForDistance(
  distance: "5k" | "10k" | "half" | "marathon"
): number {
  switch (distance) {
    case "5k":
      return 1;
    case "10k":
      return 2;
    case "half":
      return 3;
    case "marathon":
      return 4;
  }
}
