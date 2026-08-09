/* ─────────────────────────────────────────────
   Run Day Scheduler
   Auto-distributes run types across the week,
   or generates a periodized race-prep plan.
   ───────────────────────────────────────────── */

import type { ScheduleDay } from "@/lib/scheduleUtils";
import type { ScheduledRunDay, RunPlan } from "./programTypes";
import type { LayoffClass } from "./layoffDetection";
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

export function getPhaseForWeek(
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
 * scheduler's choice is explicit and ordered; `minutes` mirrors each
 * template's `estimatedDuration` and both are pinned against the registry by
 * `longRunProgression.test.ts`.
 *
 * The bottom of the ladder matters as much as the top. A ladder starting at
 * 10 km made every 5K and 10K plan flat — their whole base→peak span
 * (4→8 km and 6→12 km) sat at or below the first rung, so a 10K trainee got
 * the identical week 27 times. Measured, not inferred.
 */
const LONG_RUN_TIERS: ReadonlyArray<{
  id: string;
  km: number;
  minutes: number;
}> = [
  { id: "long_6k", km: 6, minutes: 35 },
  { id: "long_8k", km: 8, minutes: 45 },
  { id: "long_10k", km: 10, minutes: 55 },
  { id: "long_12k", km: 12, minutes: 65 },
  { id: "long_15k", km: 15, minutes: 80 },
  { id: "long_20k", km: 20, minutes: 110 },
  { id: "long_25k", km: 25, minutes: 140 },
  { id: "long_30k", km: 30, minutes: 170 },
];

/**
 * Daniels' explicit ceiling: a long run is capped at the LESSER of 150
 * minutes and ~25-30% of weekly volume. The time half is the one a scheduler
 * can enforce without knowing the athlete's pace, and it is what stops the
 * marathon ramp handing a 4-day-a-week runner a 170-minute session.
 *
 * `long_30k` therefore stays in the registry — a user can pick it in the day
 * sheet — but the scheduler never prescribes it. That exclusion is asserted,
 * so raising this cap is a decision someone has to make deliberately.
 *
 * The share half of Daniels' rule is NOT enforced here, and it is worth being
 * honest about why. (The previous version of this note said "~48% of a 4-run
 * week" — measured, that was the FIVE-day figure; four days peaked at 55%.)
 * The medium-long run (RUN-EV-11, see MEDIUM_LONG_PEAK_MINUTES) now raises
 * the midweek denominator, which brings a marathon 4-day peak to ~50% and
 * 5-day to ~44% — better, still over the textbook 25-30%. The remaining gap
 * is a property of running three-to-four times a week, not of this ladder —
 * closing it fully needs more run days, which is the user's `weekSchedule`
 * to give, not the scheduler's to invent. Hansons makes exactly this
 * argument for its own ~26 km cap.
 *
 * RUN-EV-06 (owner decision 2026-08-09): this ceiling, the 6 km lowest
 * long-run tier, and the re-entry 5K behavior are RETAINED as **Tropos
 * heuristics** — sensible defaults the product chose, not source-derived
 * safety rules and not safety guarantees. The Daniels citation above
 * covers the 150-minute half only; the ladder rungs and floors are ours.
 * Any surface explaining these to users must present them as the plan's
 * defaults, never as a medical or safety claim.
 */
export const LONG_RUN_MAX_MINUTES = 150;

/**
 * Easy runs are a ladder too, ramped on the same progress as the long run.
 *
 * Before this they were a fixed `easy_30` for every week of every plan, so
 * the ENTIRE weekly progression was carried by one session. Measured on a
 * 27-week marathon plan: weekly volume went 145 → 260 min while three of the
 * four runs never changed, putting 65% of peak volume in a single day. No
 * methodology programmes that; they raise weekly volume and keep the long run
 * a bounded fraction of it.
 */
const EASY_RUN_TIERS: ReadonlyArray<{ id: string; minutes: number }> = [
  { id: "easy_30", minutes: 30 },
  { id: "easy_40", minutes: 40 },
  { id: "easy_50", minutes: 50 },
  // Medium-long rungs (RUN-EV-11) — reachable only via the designated
  // medium-long slot below; ordinary easy runs still peak at 50.
  { id: "easy_60", minutes: 60 },
  { id: "easy_75", minutes: 75 },
  { id: "easy_90", minutes: 90 },
];
const EASY_BASE_MINUTES = 30;
const EASY_PEAK_MINUTES = 50;

/**
 * RUN-EV-11 (2026-08-09) — the medium-long run: ONE easy slot per base/build
 * week ramps to a DISTANCE-AWARE peak instead of the flat 50-minute easy
 * ceiling.
 *
 * Why: measured across every distance × schedule, the flat easy axis made
 * Daniels' share rule (long run ≤ ~25-30% of weekly volume) structurally
 * unsatisfiable for half/marathon — a marathon plan's 140-minute peak long
 * run was 53-65% of a 3-4-day week in EVERY week, because the rest of the
 * week could not grow past 50-minute runs. Every source that caps the long
 * run pairs the cap with real weekly volume underneath it: Pfitzinger's
 * midweek medium-long run (the signature of Advanced Marathoning) is the
 * named mechanism, and Hansons' 16-mile cap only makes sense beside its
 * six-day midweek volume. Enforcing a share CAP instead would shorten the
 * long run — the one response none of those sources would pick.
 *
 * The peaks are deliberately modest against the sources (Pfitzinger's MLR
 * is 12-16 mi ≈ 85-115 min): this is still a recreational, lift-hybrid
 * plan. 5K needs no separate session — its peak equals the easy ceiling,
 * so the medium-long slot degenerates to a plain easy run there. Like the
 * ceiling above, these are TROPOS HEURISTICS (RUN-EV-06 register), not
 * source-derived safety rules.
 */
const MEDIUM_LONG_PEAK_MINUTES: Record<"5k" | "10k" | "half" | "marathon", number> = {
  "5k": 50,
  "10k": 60,
  half: 75,
  marathon: 90,
};

/**
 * Quality sessions progress by VOLUME, and their peak is event-specific.
 *
 * The last flat axis in the plan. Measured before this: `tempo_20` and `5x1k`
 * alternated unchanged for 15 consecutive build weeks on every distance, so a
 * marathoner and a 5K runner did the identical quality session for the whole
 * block and neither one's got harder.
 *
 * What ramps is volume, never pace. Interval and threshold paces are defined
 * by physiology — `runPaces.ts` derives them from VDOT — so a block develops
 * how MUCH of that pace you can hold, not how fast the pace is. Daniels,
 * Pfitzinger and Hansons all progress quality this way.
 *
 * Event specificity lives in the THRESHOLD ceiling: a 5K racer has no use for
 * a 40-minute tempo (their whole race is ~20 minutes), a marathoner does.
 * That axis carries the distinction on its own, so the interval ladder tops
 * out at 6 reps for everyone — Pfitzinger prescribes 5-6×1000m VO2max work in
 * marathon blocks too.
 *
 * A first pass keyed the interval peak to distance as well (marathon 5, 5K
 * 6). Measuring it showed marathon intervals then sat at 4 reps for the ENTIRE
 * block, because a base of 4 and a peak of 5 only crosses the 5-rep rung on
 * the final ramp week — which lands on a tempo. That is the flat-axis defect
 * this function exists to remove, reintroduced for one distance, so the
 * specificity moved entirely to the tempo ceiling where it is unambiguous.
 *
 * Deliberately NOT implemented: Daniels' caps expressed as a percentage of
 * weekly mileage (T ≤ 10%, I ≤ 8%). Applying them here would mean converting
 * quality MINUTES into a share of weekly MINUTES, and tempo/interval pace is
 * faster than easy pace, so the conversion needs a pace exchange rate the
 * scheduler does not have. Inventing one would be exactly the "invented
 * precision that downstream handoffs then treat as data" the v8 evaluation
 * refuses. Keying the ceiling to the race distance gets the same protection
 * — a 5K plan never sees a 40-minute tempo — without the fabricated constant.
 */
const TEMPO_TIERS: ReadonlyArray<{ id: string; workMinutes: number }> = [
  { id: "tempo_20", workMinutes: 20 },
  { id: "tempo_30", workMinutes: 30 },
  { id: "tempo_40", workMinutes: 40 },
];
const INTERVAL_TIERS: ReadonlyArray<{ id: string; reps: number }> = [
  { id: "4x1k", reps: 4 },
  { id: "5x1k", reps: 5 },
  { id: "6x1k", reps: 6 },
];
const QUALITY_BASE = { tempoWorkMinutes: 20, intervalReps: 4 };
/**
 * Fraction of the ramp after which quality volume is at peak and HELD.
 *
 * 0.7 rather than a rounder 0.8 for a measured reason: quality alternates by
 * week parity AND every 4th week is a cutback, so the weeks eligible to sit
 * at peak are roughly a quarter of the tail. At 0.8 the marathon reached its
 * top interval session exactly ONCE.
 *
 * The long run peaks on exactly one week, which is fine — it is a single
 * landmark session. Quality is not: you want several exposures at the peak
 * session before racing, and one is a test rather than a stimulus.
 *
 * It is also what makes the top rung reachable at all. Quality alternates
 * tempo/intervals by week parity, so a ramp that only touches peak on its
 * final week reaches it for whichever flavour that week happens to be, and
 * the other flavour's top tier is never emitted. Measured: `6x1k` was dead on
 * every distance until this existed.
 */
const QUALITY_PEAK_AT = 0.7;
const QUALITY_PEAK_BY_DISTANCE: Record<
  "5k" | "10k" | "half" | "marathon",
  { tempoWorkMinutes: number; intervalReps: number }
> = {
  "5k": { tempoWorkMinutes: 20, intervalReps: 6 },
  "10k": { tempoWorkMinutes: 30, intervalReps: 6 },
  half: { tempoWorkMinutes: 40, intervalReps: 6 },
  marathon: { tempoWorkMinutes: 40, intervalReps: 6 },
};

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
 * Where a week sits in the pre-taper ramp: `progress` in [0,1] and whether
 * it is a cutback. Returns null when the plan has no room to ramp at all
 * (the whole thing is taper + race), which every caller reads as "hold at
 * base".
 *
 * Shared so the long run and the easy runs move TOGETHER — a cutback week
 * that only steps the long run back isn't a cutback, it's a redistribution.
 */
function rampShape(input: {
  weekIndex: number;
  totalWeeks: number;
  taperWeeks: number;
}): { progress: number; isCutback: boolean } | null {
  const lastRampWeek = Math.max(0, input.totalWeeks - 1 - input.taperWeeks - 1);
  if (lastRampWeek === 0) return null;
  const clamped = Math.min(Math.max(0, input.weekIndex), lastRampWeek);
  return {
    progress: clamped / lastRampWeek,
    isCutback:
      (input.weekIndex + 1) % CUTBACK_EVERY === 0 &&
      input.weekIndex !== lastRampWeek,
  };
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

  // Pre-taper window: the final race week and the taper weeks before it are
  // the caller's business.
  const shape = rampShape({ weekIndex, totalWeeks, taperWeeks });
  if (!shape) return baseLongKm;

  const ramped = baseLongKm + (peak - baseLongKm) * shape.progress;
  // Cutback every 4th week — but never on the final ramp week, which is the
  // peak the whole block builds toward.
  return shape.isCutback
    ? Math.max(baseLongKm, ramped * CUTBACK_FRACTION)
    : ramped;
}

/**
 * Target easy-run duration for a given week, in minutes.
 *
 * Same ramp and the same cutbacks as the long run, so weekly volume rises as
 * a whole rather than being concentrated in one session. Taper, race and
 * below-floor weeks don't call this — they stay at the base 30, which is the
 * volume cut those weeks are for.
 */
export function easyRunMinutesForWeek(input: {
  weekIndex: number;
  totalWeeks: number;
  taperWeeks: number;
  volume: RunVolumePreset;
}): number {
  const shape = rampShape(input);
  if (!shape) return EASY_BASE_MINUTES;
  const peak =
    input.volume === "lighter"
      ? EASY_BASE_MINUTES +
        (EASY_PEAK_MINUTES - EASY_BASE_MINUTES) * LIGHTER_PEAK_FACTOR
      : EASY_PEAK_MINUTES;
  const ramped =
    EASY_BASE_MINUTES + (peak - EASY_BASE_MINUTES) * shape.progress;
  return shape.isCutback
    ? Math.max(EASY_BASE_MINUTES, ramped * CUTBACK_FRACTION)
    : ramped;
}

/**
 * The week's medium-long duration (RUN-EV-11). Same ramp shape, cutback
 * handling and `lighter` scaling as the plain easy ramp — only the peak is
 * distance-aware. Returns the plain easy duration when the distance's peak
 * IS the easy ceiling (5K), so callers can assign it unconditionally.
 */
export function mediumLongMinutesForWeek(input: {
  weekIndex: number;
  totalWeeks: number;
  taperWeeks: number;
  volume: RunVolumePreset;
  distance: "5k" | "10k" | "half" | "marathon";
}): number {
  const shape = rampShape(input);
  if (!shape) return EASY_BASE_MINUTES;
  const fullPeak = MEDIUM_LONG_PEAK_MINUTES[input.distance];
  const peak =
    input.volume === "lighter"
      ? EASY_BASE_MINUTES +
        (fullPeak - EASY_BASE_MINUTES) * LIGHTER_PEAK_FACTOR
      : fullPeak;
  const ramped =
    EASY_BASE_MINUTES + (peak - EASY_BASE_MINUTES) * shape.progress;
  return shape.isCutback
    ? Math.max(EASY_BASE_MINUTES, ramped * CUTBACK_FRACTION)
    : ramped;
}

/** Snap a target distance to the nearest tier at or below it, with the
 *  shortest tier as the floor. Never prescribes MORE than asked for, and
 *  never a session over the `LONG_RUN_MAX_MINUTES` time ceiling. */
export function longTierForKm(km: number): string {
  const eligible = LONG_RUN_TIERS.filter(
    (t) => t.minutes <= LONG_RUN_MAX_MINUTES
  );
  let chosen = eligible[0];
  for (const tier of eligible) {
    if (tier.km <= km) chosen = tier;
  }
  return chosen.id;
}

/**
 * WAVE1-STRIDES: the strides variant of a plain easy tier. Daniels
 * prescribes strides (4-6 x ~20s relaxed-fast, full recovery) 2-3x/week on
 * easy days in every plan; Tropos schedules ONE strides day per base/build
 * week — deliberately conservative, and a Tropos scheduling heuristic
 * (RUN-EV-06 register), not a source-derived dose. Strides replace a few
 * minutes of easy jogging rather than extending the session, so the
 * variant's duration equals its base tier and the week's volume math is
 * unchanged. Non-plain ids (medium-long rungs, anything else) pass through
 * untouched.
 */
export function stridesVariantOf(easyId: string): string {
  switch (easyId) {
    case "easy_30":
      return "easy_30_strides";
    case "easy_40":
      return "easy_40_strides";
    case "easy_50":
      return "easy_50_strides";
    default:
      return easyId;
  }
}

/** Snap a target duration to the nearest easy tier at or below it. */
export function easyTierForMinutes(minutes: number): string {
  let chosen = EASY_RUN_TIERS[0];
  for (const tier of EASY_RUN_TIERS) {
    if (tier.minutes <= minutes) chosen = tier;
  }
  return chosen.id;
}

/**
 * Resolve the quality session for a week: which flavour, at what volume.
 *
 * Ramps on the same `rampShape` as everything else, so a cutback week eases
 * the quality session too rather than leaving it as the one thing that never
 * backs off. `gentler` holds quality at the base rung — the knob already
 * drops interval sessions entirely and halves the frequency, and letting the
 * surviving sessions also grow would work against that.
 */
export function qualityTemplateId(input: {
  flavour: "tempo" | "intervals";
  weekIndex: number;
  totalWeeks: number;
  taperWeeks: number;
  distance: "5k" | "10k" | "half" | "marathon";
  difficulty: RunDifficultyPreset;
}): string {
  const tiers = input.flavour === "tempo" ? TEMPO_TIERS : INTERVAL_TIERS;
  const sizeOf = (t: (typeof tiers)[number]) =>
    "workMinutes" in t ? t.workMinutes : t.reps;
  const base =
    input.flavour === "tempo"
      ? QUALITY_BASE.tempoWorkMinutes
      : QUALITY_BASE.intervalReps;
  const peakCfg = QUALITY_PEAK_BY_DISTANCE[input.distance];
  const peak =
    input.flavour === "tempo" ? peakCfg.tempoWorkMinutes : peakCfg.intervalReps;

  const shape = rampShape(input);
  let target = base;
  if (shape && peak > base && input.difficulty !== "gentler") {
    const progress = Math.min(1, shape.progress / QUALITY_PEAK_AT);
    const ramped = base + (peak - base) * progress;
    target = shape.isCutback
      ? Math.max(base, ramped * CUTBACK_FRACTION)
      : ramped;
  }

  let chosen = tiers[0];
  for (const tier of tiers) if (sizeOf(tier) <= target) chosen = tier;
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
  /**
   * How long the runner has actually been away (Run15).
   *
   * REQUIRED, deliberately — not optional-with-a-default. Every other input
   * here describes the race or a static preference, so before this the
   * generator could not tell ten weeks of training from zero and handed a
   * returning runner mid-block volume (measured: a 25 km long run in week one
   * back after ten weeks off). Making it required means a new call site is a
   * COMPILE error rather than a silent regression to the mid-block plan —
   * which is the failure mode `RunTuning`'s own doc warns about, enforced by
   * tsc instead of by discipline. Sites with no run data pass "none"
   * explicitly, so the assumption is recorded where it is made.
   */
  recentLayoff: LayoffClass;
  /** Pgm6 knobs. Optional and defaulting to `standard`/`standard`
   *  (byte-identical to pre-Pgm6 output) so legacy callers and
   *  profiles without the fields change nothing — but EVERY live
   *  regen path must thread the profile's tuning or the weekly
   *  refresh will silently regress a tuned plan back to standard
   *  (the tested-copy-vs-running-copy drift class). Derive via
   *  `runTuningFromProfile(profile)`. */
  tuning?: RunTuning;
  /**
   * The block's ORIGINAL length in weeks, carried from when the plan was
   * created (`programState.runPlan.totalWeeks`).
   *
   * ── Why this exists ────────────────────────────────────────────────────
   *
   * Without it the generator has no way to know how far through a block the
   * runner is, because it derives everything from `currentDate` → race date,
   * i.e. weeks REMAINING. Every caller then persists `weeks[0]`
   * (`useProgram.ts`, `planBuilder.ts`, `raceRunDaysReconcile.ts` — grep
   * `.weeks[`, there are no others), and the plan is regenerated on each
   * weekly rollover with a shorter horizon. So the runner sat at "week 0 of
   * a fresh block" forever.
   *
   * That was not a subtle degradation. Measured on a 26-week marathon plan by
   * simulating the real rollover — regenerate weekly, take `weeks[0]`:
   *
   *     26w out … 5w out   155 min   easy_30 ×3 + long_12k   (22 identical weeks)
   *      4w out … 2w out   120 min   easy_30 ×4
   *
   * No tempo, no intervals, no long run past 12 km, then a marathon. The
   * ramp the generator produces — long_12k→long_25k, tempo_20→tempo_40,
   * 4x1k→6x1k, peaking at 281 min — lived entirely in `weeks[1..n]`, which
   * nothing read. `getPhaseForWeek(0, T, d)` is structurally always "base":
   * `preTaperWeeks = max(1, …) >= 1`, so `0 < preTaperWeeks * 0.4` holds for
   * every plan longer than `taperWeeks + 1`.
   *
   * ── What it changes ────────────────────────────────────────────────────
   *
   * Given the block length, the position is `blockWeeks - weeksRemaining` —
   * derived from the RACE DATE rather than from a counter, so a runner who
   * ignores the app for a month resyncs instead of drifting. `compressed`
   * and `belowFloor` also become properties of the BLOCK rather than of the
   * days left, which is what they were always meant to mean: a 26-week plan
   * four weeks from race day is in its taper, not "compressed".
   *
   * Omitted (or shorter than the weeks remaining, which can only mean a
   * stale or corrupt carry) → falls back to the old behaviour exactly:
   * position 0 of a block as long as the time left. That keeps every
   * existing caller and test byte-identical, which is why this is additive.
   */
  planTotalWeeks?: number;
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

  // `totalWeeks` is weeks REMAINING. The block may be longer — see
  // `planTotalWeeks`. A carry shorter than the time left is stale or corrupt,
  // so it is ignored rather than trusted.
  const blockWeeks =
    input.planTotalWeeks != null &&
    Number.isFinite(input.planTotalWeeks) &&
    input.planTotalWeeks >= totalWeeks
      ? input.planTotalWeeks
      : totalWeeks;
  /** How many weeks of the block are already behind the runner. 0 when the
   *  plan is fresh, which is what makes the fallback byte-identical. */
  const startIndex = blockWeeks - totalWeeks;

  // Both of these describe the BLOCK, not the days left. Deriving them from
  // weeks-remaining meant every plan became "compressed" in its final weeks —
  // which is why a real marathon taper had ZERO quality: the taper branch is
  // gated on `!compressed`, so the one session Bosquet et al. (2007) say must
  // survive a taper (intensity maintained, volume cut) was the one thing
  // dropped. Reading the block length fixes that as a consequence.
  const compressed = blockWeeks < config.minWeeks;
  // Run9 phase-3 (Slice B): below the taper-safe floor (= taperWeeks + 1),
  // compressing is no longer safe — the week content flips to "finish-safely"
  // (all easy, no quality, the long run capped at baseLongKm so there are no
  // week-over-week jumps). belowFloor implies compressed by construction
  // (floor <= minWeeks for every distance).
  const belowFloor = blockWeeks < getRaceFloorWeeks(input.raceGoal.distance);
  /* Run15 — see `recentLayoff` on the input. */
  const detrained = input.recentLayoff === "detrained";

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

  // `offset` walks the CALENDAR (weeks[0] is always this week, so the dates
  // and the race placement are unchanged); `w` is the runner's position in
  // the BLOCK, which is what phase and every ramp are computed from. They
  // coincide exactly when startIndex is 0, i.e. on a fresh plan.
  for (let offset = 0; offset < totalWeeks; offset++) {
    const w = startIndex + offset;
    const phase = getPhaseForWeek(w, blockWeeks, input.raceGoal.distance);
    // Each week's start advances by 7 days from the current week
    const weekStart = addLocalDays(weekStartDate, offset * 7);
    const week: ScheduledRunDay[] = [];

    const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
    const remaining = runEligibleSlots.filter((d) => d !== longSlot);

    // Easy runs ramp with the long run in base/build. Taper, race and
    // below-floor weeks deliberately stay at the base duration — cutting easy
    // volume IS what those weeks are for, and re-raising it would undo the
    // taper.
    const easyId =
      belowFloor || phase === "taper" || phase === "race"
        ? "easy_30"
        : easyTierForMinutes(
            easyRunMinutesForWeek({
              weekIndex: w,
              totalWeeks: blockWeeks,
              taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
              volume: tuning.volume,
            })
          );
    // RUN-EV-11: ONE easy slot per base/build week is the medium-long run,
    // with a distance-aware ceiling (see MEDIUM_LONG_PEAK_MINUTES). Taper,
    // race and below-floor weeks keep every run short — that cut is the
    // point of those weeks — and a detrained returner gets no medium-long
    // for the same reason they get no quality: no base to load. 5K plans
    // degenerate to the plain easy tier (peak == easy ceiling).
    const midLongId =
      belowFloor ||
      phase === "taper" ||
      phase === "race" ||
      input.recentLayoff === "detrained"
        ? easyId
        : easyTierForMinutes(
            mediumLongMinutesForWeek({
              weekIndex: w,
              totalWeeks: blockWeeks,
              taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
              volume: tuning.volume,
              distance: input.raceGoal.distance,
            })
          );

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
            totalWeeks: blockWeeks,
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
          totalWeeks: blockWeeks,
          phase,
          baseLongKm: config.baseLongKm,
          /* Run15 — a detrained runner ramps toward BASE, not peak.
             Deliberately not the `belowFloor` branch above: that one forces
             every non-race week into taper phase, where `pickLongTemplateId`
             short-circuits to a literal `easy_30` and no long run happens at
             all. Fine as a 2-3 week bridge; wrong for someone with six weeks
             of runway, who needs a long run that PROGRESSES within a safe
             ceiling. Capping peak at base keeps the existing ramp machinery
             and simply lowers what it climbs toward. */
          peakLongKm: detrained ? config.baseLongKm : config.peakLongKm,
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
      /* Run15 — a returning runner gets no hard sessions at all. Intensity is
         simultaneously the least effective way to rebuild an aerobic base and
         the most likely to injure: tempo work in the first six weeks of a
         programme is associated with HIGHER injury rates, which is exactly
         what this generator used to emit (a `tempo_40` in week one back).

         This gates BOTH the build branch and the taper branch. Taper is not an
         exception: its session exists to SHARPEN an established base, and a
         runner three weeks off the road has no base for it to sharpen. Gating
         only `build` was measurably not enough — a detrained marathoner with a
         short horizon spends every week in taper, so the build gate never
         fires and they were handed `8x400` in weeks 2-3 regardless. */
      const detrainedSkipsQuality = detrained;
      const hardCapApplies = compressed || gentler;
      const allowSecondQuality = tuning.difficulty === "harder" && !compressed;

      if (phase === "base") {
        // Base: all easy (compressed plans extend base proportionally
        // since there's no time for a real build phase). The first slot
        // carries the medium-long (RUN-EV-11); the second gains strides
        // (WAVE1-STRIDES) — a detrained returner gets neither.
        remaining.forEach((d, i) =>
          week.push(
            buildRunDayV2({
              dayIndex: d,
              templateId:
                i === 0
                  ? midLongId
                  : i === 1 && input.recentLayoff !== "detrained"
                    ? stridesVariantOf(easyId)
                    : easyId,
              type: "easy",
              weekStart,
            })
          )
        );
      } else if (phase === "build") {
        const allowQuality = !hardCapApplies || w % 2 === 0;
        if (allowQuality && !skipQualityEntirely && !detrainedSkipsQuality) {
          // 1 quality + rest easy (or all easy if compressed and
          // the long run already consumed the week's quality budget).
          // Gentler forces the quality to tempo — no intervals.
          const qualityType = gentler
            ? "tempo"
            : w % 2 === 0
              ? "tempo"
              : "intervals";
          const qualityId = qualityTemplateId({
            flavour: qualityType,
            weekIndex: w,
            totalWeeks: blockWeeks,
            taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
            distance: input.raceGoal.distance,
            difficulty: tuning.difficulty,
          });
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
                templateId: qualityTemplateId({
                  flavour: secondType,
                  weekIndex: w,
                  totalWeeks: blockWeeks,
                  taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
                  distance: input.raceGoal.distance,
                  difficulty: tuning.difficulty,
                }),
                type: secondType,
                weekStart,
              })
            );
          }
          remaining.slice(secondQualityHere ? 2 : 1).forEach((d, i) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                // RUN-EV-11: first easy slot is the medium-long;
                // WAVE1-STRIDES: the next plain easy gains strides.
                templateId:
                  i === 0
                    ? midLongId
                    : i === 1 && input.recentLayoff !== "detrained"
                      ? stridesVariantOf(easyId)
                      : easyId,
                type: "easy",
                weekStart,
              })
            )
          );
        } else {
          // Skip quality this week — all easy; first slot carries the
          // medium-long (RUN-EV-11), the second gains strides
          // (WAVE1-STRIDES).
          remaining.forEach((d, i) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId:
                  i === 0
                    ? midLongId
                    : i === 1 && input.recentLayoff !== "detrained"
                      ? stridesVariantOf(easyId)
                      : easyId,
                type: "easy",
                weekStart,
              })
            )
          );
        }
      } else if (phase === "taper") {
        // Taper: 1 short quality + easy. Compressed plans skip the
        // taper quality entirely (already low volume); gentler drops
        // it too (freshness over sharpening); a detrained runner drops
        // it because there is no base to sharpen. Harder does NOT add
        // taper work — taper is about arriving fresh.
        if (!compressed && !gentler && !detrainedSkipsQuality) {
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
                templateId: easyId,
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
                templateId: easyId,
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
              templateId: easyId,
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
