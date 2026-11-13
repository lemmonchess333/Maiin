import {
  fitWeekToRunningBaseline,
  isRunningBaseline,
  runningClimb,
  type RunningBaseline,
} from "@/features/program/runningBaseline";
/* ─────────────────────────────────────────────
   Run Day Scheduler
   Auto-distributes run types across the week,
   or generates a periodized race-prep plan.
   ───────────────────────────────────────────── */

import {
  addLocalDays,
  dateForDayOfWeek,
  generateScheduledRunId,
  localDateString,
  localWeekKey,
  parseLocalDate,
  startOfLocalWeek,
  weekPosition,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  recentPace,
  recentRunning,
  returnWeekKey,
  type DatedRun,
  type LayoffClass,
} from "./layoffDetection";
import type { RunPlan, ScheduledRunDay } from "./programTypes";
import { HARD_RUN_TYPES } from "./programTypes";
import { beginnerQualityWeek, newRunnerTemplate } from "./newRunner";
import { starterRunSlots, starterTemplateId } from "./starterPlan";
import {
  chooseQualityRunSlots,
  clearOf,
  easyDaysInFillOrder,
  pickLongRunSlot,
} from "./runPlacement";
import {
  fitRunToTimeLimit,
  plannedRunMinutes,
  type RunTimeLimits,
} from "./runTimeLimits";

// Re-export so existing imports of these types from runScheduler keep
// working. The single source of truth lives in programTypes (P0-A spec v7).
export type { RunPlan, ScheduledRunDay };

/* ─────────────────────────────────────────────
   Race Prep Plan Generator
   ───────────────────────────────────────────── */

import {
  getPhaseForWeek,
  getRaceFloorWeeks,
  isRampStepBack,
  isRunStepBackWeek,
  lastRampWeekOf,
  RACE_CONFIGS,
  raceCalendarWeeks,
  startsPartway,
  TAPER_WEEKS_BY_DISTANCE,
  trainingWeeksOf,
} from "./runPlanTiming";
export {
  clampPlanWeek,
  classifyRaceTiming,
  getPhaseForWeek,
  getRaceFloorWeeks,
  getRaceMinWeeks,
  getRacePhaseLabel,
  isCurrentWeekInRaceWindDown,
  isCurrentWeekInTaper,
  raceTrainingWeeks,
  TAPER_WEEKS_BY_DISTANCE,
} from "./runPlanTiming";
export type { RaceTiming } from "./runPlanTiming";

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

/** Build a runDay in v2 shape directly. */
function buildRunDayV2(args: {
  dayIndex: number;
  templateId: string;
  type: string;
  weekStart: Date;
}): ScheduledRunDay {
  const weekKey = localWeekKey(args.weekStart);
  // A `dayIndex` is a getDay() weekday (0 = Sunday), NOT an offset from
  // the week's first day; the two only coincide under a Sunday anchor.
  // Adding it straight onto `weekStart` put a Wednesday run on Thursday
  // the moment the week began on Monday, and a Sunday run six days late.
  // `dateForDayOfWeek` applies the anchor offset, and derives from the
  // normalised key rather than the raw `weekStart`, so a caller handing
  // in a mid-week date still lands every run on its own weekday.
  const date = dateForDayOfWeek(weekKey, args.dayIndex);
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
  // Run24 (1): the marathon's longest, under its own ceiling.
  { id: "long_32k", km: 32, minutes: 180 },
];

/**
 * Daniels caps a long run at 30% of weekly mileage below 64 km a week, and
 * from 64 km a week at the lesser of 25% or 150 minutes. This is the time
 * half of that rule, applied at every volume: the half a scheduler can
 * enforce without knowing the athlete's weekly mileage, and what stops the
 * marathon ramp handing a 4-day-a-week runner a 170-minute session. Below
 * 64 km a week the 150 minutes is Tropos's extension of the rule, not
 * Daniels'.
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
 * Run24 (1), deep dive D1: the marathon's long run may take up to three
 * hours, to the ladder's 32 km, so a 5-hour marathoner was not held to
 * 15 km and a first-timer to 20. 5K to half keep `LONG_RUN_MAX_MINUTES`.
 * A Tropos heuristic, in RUN-EV-06's register like the 150.
 */
export const MARATHON_LONG_RUN_MAX_MINUTES = 180;

/**
 * The long run's ceiling for a plan (Run24 (1)): the minutes it may take,
 * measured at a pace, and a rung it never drops below. Absent fields read
 * as the 150 minutes at the caller's confirmed easy pace, with no floor.
 */
export interface LongRunCeiling {
  /** The pace the minutes are measured at; absent, the caller's easy pace. */
  paceSPerKm?: number | null;
  maxMinutes: number;
  /** The longest long run the runner has already run, km: a rung at or
   *  under it stays schedulable whatever the minutes say, so a benchmark
   *  accepted mid-block never lowers the plan below it. */
  floorKm?: number;
}

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
/** The easy runs a taper or race week falls back to (deep dive D13). */
const TAPER_FLOOR_IDS: ReadonlySet<string> = new Set([
  "easy_30",
  "easy_30_strides",
]);
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
/** Deep dive D16: the medium-long of a week with two quality sessions and
 *  no day clear of them, held under the hour that makes it demanding
 *  (Run20). */
const CROWDED_MEDIUM_LONG_MINUTES = 50;

const MEDIUM_LONG_PEAK_MINUTES: Record<
  "5k" | "10k" | "half" | "marathon",
  number
> = {
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

/** How much a cutback week takes off the ramped distance. Which weeks are
 *  cutbacks is `isRampStepBack`'s: every 4th, never the peak. */
const CUTBACK_FRACTION = 0.75;

/**
 * Run22 — the taper in steps (decisions.md R8). A taper week three weeks
 * before race week keeps a long run at 75% of the build's longest and easy
 * runs at 75% of the last build week's; two weeks before, 60% and 60%. The
 * week before race week keeps the taper's easy 30s, and race week is the
 * race's. A Tropos heuristic in the RUN-EV-06 register, not a source rule:
 * the running handoff's non-adoption of a source-derived or universal taper
 * percentage stands. The direction is the evidence's (Bosquet 2007, a
 * progressive cut of 41–60%, intensity and frequency kept; Pfitzinger and
 * Daniels, a reduced long run two to three weeks out); the numbers are
 * Tropos's. It replaced one cut held to race week with no long run, which
 * made a marathon the first long run in a month.
 */
const TAPER_STEP_SHARE_BY_WEEKS_OUT: Readonly<Record<number, number>> = {
  3: 0.75,
  2: 0.6,
};

/** Run22 — a taper week's share of the build, or null for a taper week
 *  that keeps the easy 30s: the week before race week (so every one-week
 *  taper), and every week of a block whose taper starts in its first week
 *  without a running starting point to take its shares of (`fromStart`;
 *  deep dive D8). That block, a plan made at or under the taper floor, has
 *  no build to take a share of. `weekIndex` is the block's, race week the
 *  last. */
function taperStepShare(input: {
  weekIndex: number;
  totalWeeks: number;
  taperWeeks: number;
  /** The block has no build and takes its taper from the person's running
   *  starting point (`taperStart`). */
  fromStart?: boolean;
}): number | null {
  const firstTaperWeek = input.totalWeeks - 1 - input.taperWeeks;
  if (firstTaperWeek < 1 && !input.fromStart) return null;
  return (
    TAPER_STEP_SHARE_BY_WEEKS_OUT[input.totalWeeks - 1 - input.weekIndex] ??
    null
  );
}

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
    // Run17: the clamp is the larger of the top tier and the distance's own
    // peak — a 32 km marathon intent already sits past the 30 km top tier
    // (the ladder snaps it), and clamping `bigger` to 30 put it BELOW
    // `standard`. `bigger` can now never sit below `standard`; the emitted
    // tier is still capped by the schedulable ladder.
    const ceiling = Math.max(
      LONG_RUN_TIERS[LONG_RUN_TIERS.length - 1].km,
      peakLongKm
    );
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
  const lastRampWeek = lastRampWeekOf(input.totalWeeks, input.taperWeeks);
  if (lastRampWeek === 0) return null;
  const clamped = Math.min(Math.max(0, input.weekIndex), lastRampWeek);
  return {
    progress: clamped / lastRampWeek,
    isCutback: isRampStepBack(input.weekIndex, lastRampWeek),
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
  /** Run17 — the runner's confirmed easy pace, or null for the nominal
   *  table. Decides the ceiling the ramp is clamped to. */
  easyPaceSPerKm?: number | null;
  /** Run24 (1): the plan's ceiling, when it is not the 150 minutes. */
  ceiling?: LongRunCeiling | null;
}): number {
  const { weekIndex, totalWeeks, baseLongKm, taperWeeks, volume } = input;
  // No headroom in the PLAN — checked before the knob, so "bigger" cannot
  // manufacture headroom the caller deliberately withheld. This is what makes
  // the below-floor caller's safety precedence structural rather than a
  // coercion: it passes peak === base, and neither knob can act on that.
  if (input.peakLongKm <= baseLongKm) return baseLongKm;
  // ...and none left after the knob: "lighter" is allowed to flatten it.
  // Run17: the peak the ramp climbs to is the peak the ceiling lets this
  // runner schedule. Before this the curve climbed to `peakLongKm` (32 for
  // the marathon) while every tier past the ceiling snapped to the same
  // `long_25k` — six identical weeks at the top of an 18-week block. Now the
  // ramp ends where the plan can actually go, and `bigger` can never sit
  // below `standard` (both clamp to the same ceiling).
  // The curve may aim up to PEAK_HOLD_FRACTION past the ceiling — never past
  // the distance's own intended peak — so the LAST few ramp weeks land on
  // the ceiling tier rather than only the final one: with a 20 → 25 km tier
  // step, a curve that ends exactly at 25 reaches the 25 km tier once. Two
  // or three peak long runs is the convention every methodology shares; six
  // identical weeks was the 32 km overshoot. Capping at the intended peak
  // keeps `lighter` below `standard` (a 24 km intent stays a 20 km tier).
  // A Tropos heuristic in the RUN-EV-06 register, not a source rule.
  const peak = Math.min(
    effectivePeakKm(input.peakLongKm, volume),
    maxSchedulableLongKm(input.easyPaceSPerKm, input.ceiling) *
      (1 + PEAK_HOLD_FRACTION)
  );
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
 * a whole rather than being concentrated in one session. Race and
 * below-floor weeks don't call this — they stay at the base 30, which is the
 * volume cut those weeks are for — and a taper week calls it only for the
 * last build week, whose runs, as that week holds them, it takes a share of
 * (Run22).
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
      ? EASY_BASE_MINUTES + (fullPeak - EASY_BASE_MINUTES) * LIGHTER_PEAK_FACTOR
      : fullPeak;
  const ramped =
    EASY_BASE_MINUTES + (peak - EASY_BASE_MINUTES) * shape.progress;
  return shape.isCutback
    ? Math.max(EASY_BASE_MINUTES, ramped * CUTBACK_FRACTION)
    : ramped;
}

/**
 * Run17 — how long a long-run tier takes THIS runner. With a confirmed
 * benchmark (the caller resolves it through `prescriptivePaceTableFromFitness`,
 * RUN-EV-08's gate) the tier's km at the runner's easy pace; without one the
 * template's nominal minutes, which assume roughly 5:36/km. The 150-minute
 * ceiling was only ever applied to the nominal figure, so a 6:00/km runner's
 * `long_25k` (150 min) sat exactly on it and a 7:00/km runner's (175 min) was
 * past it, while a 5:00/km runner was held to 25 km when 30 fit.
 */
function tierMinutesForRunner(
  tier: { km: number; minutes: number },
  easyPaceSPerKm: number | null | undefined
): number {
  return easyPaceSPerKm && easyPaceSPerKm > 0
    ? (tier.km * easyPaceSPerKm) / 60
    : tier.minutes;
}

function schedulableLongTiers(
  easyPaceSPerKm?: number | null,
  ceiling?: LongRunCeiling | null
) {
  const pace = ceiling?.paceSPerKm ?? easyPaceSPerKm;
  const maxMinutes = ceiling?.maxMinutes ?? LONG_RUN_MAX_MINUTES;
  const floorKm = ceiling?.floorKm ?? 0;
  const eligible = LONG_RUN_TIERS.filter(
    (t) => tierMinutesForRunner(t, pace) <= maxMinutes || t.km <= floorKm
  );
  // The shortest tier is always schedulable — the floor, not the ceiling.
  return eligible.length > 0 ? eligible : [LONG_RUN_TIERS[0]];
}

/** The longest long-run distance the ceiling lets THIS runner schedule —
 *  the peak every ramp is clamped to (Run17), so the curve ends where the
 *  plan can actually go instead of flat-lining at the ceiling tier. */
export function maxSchedulableLongKm(
  easyPaceSPerKm?: number | null,
  ceiling?: LongRunCeiling | null
): number {
  const tiers = schedulableLongTiers(easyPaceSPerKm, ceiling);
  return tiers[tiers.length - 1].km;
}

/** Run17 — how far past the schedulable ceiling the intended long-run
 *  curve is allowed to aim, so the ceiling TIER is reached for the last
 *  ~10% of the ramp (two to three peak long runs on the nominal ladder)
 *  instead of once. The emitted tier can never exceed the ceiling:
 *  `longTierForKm` only picks from the schedulable ladder. */
export const PEAK_HOLD_FRACTION = 0.1;

/** Snap a target distance to the nearest tier at or below it, with the
 *  shortest tier as the floor. Never prescribes MORE than asked for, and
 *  never a session over the `LONG_RUN_MAX_MINUTES` time ceiling — measured
 *  at the runner's own easy pace when one is confirmed (Run17). */
export function longTierForKm(
  km: number,
  easyPaceSPerKm?: number | null,
  ceiling?: LongRunCeiling | null
): string {
  const eligible = schedulableLongTiers(easyPaceSPerKm, ceiling);
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

/** A race plan's easy runs in the week a runner comes back after a layoff
 *  (Run15, deep dive D11): ten under the base 30. */
const RETURN_EASY_MINUTES = 20;

/** An easy tier's minutes, by its id (the base 30 for anything else). */
function tierMinutesOfEasy(id: string): number {
  return (
    EASY_RUN_TIERS.find((tier) => tier.id === id)?.minutes ?? EASY_BASE_MINUTES
  );
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
  /** The highest rung of this ladder the plan's earlier sessions reached,
   *  -1 before the first (`highestRungBefore`). The session climbs at most
   *  one rung past it (Run20), so the first is the first rung however far
   *  into the block it falls. Omitted, the block's position alone decides. */
  highestBefore?: number;
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

  let rung = 0;
  tiers.forEach((tier, i) => {
    if (sizeOf(tier) <= target) rung = i;
  });
  if (input.highestBefore != null) {
    rung = Math.min(rung, input.highestBefore + 1);
  }
  return tiers[rung].id;
}

/** Which quality sessions a build week holds, by flavour, under a plan's
 *  rules: the generator's build branch reads it, and so does the walk that
 *  finds how far up each ladder the plan's earlier weeks climbed. */
function qualityFlavoursForWeek(input: {
  weekIndex: number;
  phase: "base" | "build" | "taper" | "race";
  hardCapApplies: boolean;
  skipQuality: boolean;
  gentler: boolean;
  secondQuality: boolean;
}): Array<"tempo" | "intervals"> {
  if (input.phase !== "build" || input.skipQuality) return [];
  if (input.hardCapApplies && input.weekIndex % 2 !== 0) return [];
  const first: "tempo" | "intervals" = input.gentler
    ? "tempo"
    : input.weekIndex % 2 === 0
      ? "tempo"
      : "intervals";
  if (!input.secondQuality) return [first];
  return [first, first === "tempo" ? "intervals" : "tempo"];
}

/** Resolve the long-run template for a week of a race plan. Race weeks drop
 *  to an easy run. A taper week keeps a long run in steps (Run22): its share
 *  of the build's longest long run, in the plan's own sizes, at most that
 *  share. A taper week with no share (`taperStepShare`), or a build that
 *  held no long run to take one of, drops to an easy run, as every taper
 *  week once did. */
function pickLongTemplateId(input: {
  weekIndex: number;
  totalWeeks: number;
  phase: "base" | "build" | "taper" | "race";
  baseLongKm: number;
  peakLongKm: number;
  taperWeeks: number;
  volume: RunVolumePreset;
  easyPaceSPerKm?: number | null;
  /** Run24 (1): the plan's ceiling, when it is not the 150 minutes. */
  ceiling?: LongRunCeiling | null;
  /** The build's longest long run in km, as the plan's weeks before the
   *  taper hold it (Run22 (1)), 0 when they hold none. Asked only by a
   *  taper week with a share. */
  buildLongestKm: () => number;
  /** The plan's climb so far (Run23, `rampLongTierId`). */
  climb: LongRunClimb;
  /** No build: the taper takes its shares of the starting point
   *  (`taperStepShare`). */
  fromStart?: boolean;
}): string {
  if (input.phase === "race") return "easy_30";
  if (input.phase === "taper") {
    const share = taperStepShare(input);
    if (share === null) return "easy_30";
    const longestKm = input.buildLongestKm();
    return longestKm > 0
      ? longTierForKm(longestKm * share, input.easyPaceSPerKm, input.ceiling)
      : "easy_30";
  }
  return rampLongTierId(input, input.climb);
}

/**
 * Run23 — the ramp's long run for a base or build week, one rung at a time:
 * never more than one tier above the longest the ramp gave any week before
 * it. The ramp climbs a straight line and each week takes the tier at or
 * below it, so a short block, whose line climbs several km a week, could
 * pass a tier by: 8 to 12 km in a five-to-seven-week 10K, 20 to 30 km in a
 * nine-week marathon, half again the longest run of the month. The single
 * run far longer than the month's longest is the injury signal the evidence
 * supports best (Frandsen 2025; decisions.md R7). A short block now peaks a
 * rung lower, and the taper takes its share of that peak. Not a percentage
 * cap: the step stays a rung of the plan's own ladder.
 *
 * Each week's rung depends on every week before it, so a plan keeps the
 * climb as it goes (`climb`, one per `generateRacePlanV2` call, keyed by the
 * ramp's inputs): the weeks cost one step each, not a walk from week 0.
 */
function rampLongTierId(
  input: {
    weekIndex: number;
    totalWeeks: number;
    baseLongKm: number;
    peakLongKm: number;
    taperWeeks: number;
    volume: RunVolumePreset;
    easyPaceSPerKm?: number | null;
    ceiling?: LongRunCeiling | null;
  },
  climb: LongRunClimb
): string {
  const key = [
    input.totalWeeks,
    input.baseLongKm,
    input.peakLongKm,
    input.taperWeeks,
    input.volume,
    input.easyPaceSPerKm ?? "",
    input.ceiling
      ? `${input.ceiling.paceSPerKm ?? ""}/${input.ceiling.maxMinutes}/${input.ceiling.floorKm ?? 0}`
      : "",
  ].join("|");
  let held = climb.get(key);
  if (!held) climb.set(key, (held = { rungs: [], highest: -1 }));
  const week = Math.max(0, input.weekIndex);
  while (held.rungs.length <= week) {
    const k = held.rungs.length;
    const wanted = LONG_RUN_TIERS.findIndex(
      (t) =>
        t.id ===
        longTierForKm(
          longRunKmForWeek({ ...input, weekIndex: k }),
          input.easyPaceSPerKm,
          input.ceiling
        )
    );
    const rung = k === 0 ? wanted : Math.min(wanted, held.highest + 1);
    held.rungs.push(rung);
    held.highest = Math.max(held.highest, rung);
  }
  return LONG_RUN_TIERS[held.rungs[week]].id;
}

/** Run23's climb for one plan: each ramp's rungs, week by week. */
type LongRunClimb = Map<string, { rungs: number[]; highest: number }>;

export interface StructuredWeekV2Input {
  /** The user's weekly type structure. Must be 7 entries. */
  weekSchedule: ScheduleDay[];
  /** 1-indexed week number (drives even/odd quality alternation). */
  weekNumber: number;
  /** Local-date "YYYY-MM-DD" of the target week's first day (its Monday
   *  — the anchor is `WEEK_STARTS_ON`). Normalised on entry, so any date
   *  inside the week is accepted. Used to populate `date` + `weekKey` on
   *  every runDay. */
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

  const weekStart = startOfLocalWeek(parseLocalDate(input.weekStart));
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

  return result.sort(
    (a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex)
  );
}

/**
 * The weeks after a race, by its distance (training deep dive, D10): days
 * from the race (race day is 0) before the first run, until short runs
 * give way to 30-minute ones, and until those give way to 40-minute ones;
 * the recovery ends `recoveryWeeksForDistance` weeks after the race, so a
 * 5K's and a 10K's never reach 40 minutes. A marathon is a week off, a week of two or three 20-minute runs, a week at
 * about half the build's running and a week at about three quarters, where
 * PR-E put an easy 30 on every run day from the day after.
 */
const RECOVERY_STEPS: Record<
  "5k" | "10k" | "half" | "marathon",
  { firstRun: number; thirty: number; forty: number }
> = {
  "5k": { firstRun: 2, thirty: 4, forty: Number.POSITIVE_INFINITY },
  "10k": { firstRun: 3, thirty: 7, forty: Number.POSITIVE_INFINITY },
  half: { firstRun: 5, thirty: 11, forty: 18 },
  marathon: { firstRun: 8, thirty: 14, forty: 21 },
};

/** At most this many short runs a week while they are short, none on
 *  consecutive days. */
const RECOVERY_SHORT_RUNS = 3;

/**
 * PR-E: Recovery-phase week generator. Each scheduled run/both slot gets
 * an easy run, no long run, no tempo, no intervals, graded from the race
 * when the plan knows it (`RECOVERY_STEPS`, D10): no run in the days right
 * after it, then a few short runs, then 30 and 40 minutes on every run day.
 * A day on or before the race, or a plan with no race date or distance,
 * keeps PR-E's easy 30.
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
  /** Run20 (5): as the race plan takes it (`RacePlanV2Input`). */
  newRunnerUntil?: string | null;
  /** The race the recovery follows (`runPlan.raceGoal`). */
  race?: { distance: string; targetDate: string } | null;
}): ScheduledRunDay[] {
  const runEligibleSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (runEligibleSlots.length === 0) return [];

  const weekStart = startOfLocalWeek(parseLocalDate(input.weekStart));
  const weekKey = localDateString(weekStart);
  // A new runner's recovery week is that week's run-walk, or the runs the
  // running has built to, as the race plan's weeks are.
  const forRunner = (templateId: string) =>
    newRunnerTemplate(templateId, weekKey, input.newRunnerUntil)?.id ??
    templateId;
  const steps =
    input.race && input.race.distance in RECOVERY_STEPS
      ? RECOVERY_STEPS[input.race.distance as keyof typeof RECOVERY_STEPS]
      : null;
  const raceDay = input.race ? parseLocalDate(input.race.targetDate) : null;
  const daysFromRace = (dayIndex: number) =>
    raceDay === null || Number.isNaN(raceDay.getTime())
      ? null
      : Math.round(
          (parseLocalDate(
            dateForDayOfWeek(localWeekKey(weekStart), dayIndex)
          ).getTime() -
            raceDay.getTime()) /
            86_400_000
        );

  const slots = [...runEligibleSlots].sort(
    (a, b) => weekPosition(a) - weekPosition(b)
  );
  let shortRuns = 0;
  let lastShort: number | null = null;
  const planned: Array<{ dayIndex: number; templateId: string }> = [];
  for (const dayIndex of slots) {
    const days = daysFromRace(dayIndex);
    if (steps === null || days === null || days <= 0) {
      planned.push({ dayIndex, templateId: forRunner("easy_30") });
      continue;
    }
    if (days < steps.firstRun) continue;
    if (days < steps.thirty) {
      const position = weekPosition(dayIndex);
      if (shortRuns >= RECOVERY_SHORT_RUNS) continue;
      if (lastShort !== null && position - lastShort < 2) continue;
      shortRuns += 1;
      lastShort = position;
      planned.push({ dayIndex, templateId: forRunner("easy_20") });
      continue;
    }
    planned.push({
      dayIndex,
      templateId: forRunner(days < steps.forty ? "easy_30" : "easy_40"),
    });
  }
  return planned.map(({ dayIndex, templateId }) =>
    buildRunDayV2({ dayIndex, templateId, type: "easy", weekStart })
  );
}

/**
 * A starter week (Run9's reopening, `starterPlan.ts`): the stage's session
 * on each of the week's starter run days (`starterRunSlots`), in week
 * order. `from` is the first day the week may plan a run, for a week made
 * part gone; the days before it are left out. The schedule decides how many
 * runs there are, as a race plan's does, up to three: with fewer than two
 * run days the week can still be done, with a run outside the plan.
 */
export function scheduleStarterWeek(input: {
  weekSchedule: ScheduleDay[];
  weekStart: string;
  stage: number;
  from?: string;
}): ScheduledRunDay[] {
  const weekStart = startOfLocalWeek(parseLocalDate(input.weekStart));
  const templateId = starterTemplateId(input.stage);
  const type = RUN_TEMPLATES.find((t) => t.id === templateId)?.type ?? "easy";
  return starterRunSlots(input.weekSchedule)
    .map((dayIndex) => buildRunDayV2({ dayIndex, templateId, type, weekStart }))
    .filter((day) => !input.from || !day.date || day.date >= input.from);
}

export interface RacePlanV2Input {
  runningBaseline?: RunningBaseline | null;
  runTimeLimits?: RunTimeLimits | null;
  weekSchedule: ScheduleDay[];
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
  /** Total runs target per week. Used in v1 as the slot cap; in v2
   *  the weekSchedule is authoritative — this only seeds the structure
   *  for the race-prep generator's internal planning. */
  weeklyRunDays: number;
  /** Local "YYYY-MM-DD". Kept on the input for call-site symmetry with the
   *  other builders; the race plan is laid out from `weekStart`'s week and
   *  no longer reads this (`totalWeeks` was sized from here before, which
   *  undercounted — see the `raceWeekOffset` note in `generateRacePlanV2`). */
  currentDate: string;
  /** Local "YYYY-MM-DD" first day (Monday — `WEEK_STARTS_ON`) of week 0.
   *  Normalised on entry, so any date inside the week is accepted. */
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
  /**
   * Run17 — the runner's CONFIRMED easy pace in seconds per km, resolved by
   * the caller through `planningEasyPaceSPerKm(profile.runFitness)` (which
   * applies RUN-EV-08's prescription gate). Decides which long-run tiers the
   * 150-minute ceiling allows for THIS runner and therefore the peak the
   * ramp climbs to. Null/omitted → the nominal template minutes, which is
   * byte-identical to the pre-Run17 output. Every live regen path must thread
   * it (the tuning pattern) or a benchmarked runner's plan silently reverts
   * to the nominal ceiling on the weekly refresh.
   */
  easyPaceSPerKm?: number | null;
  /**
   * Run20 (5): the day a new runner's first weeks end (`newRunnerUntil`). A
   * week that starts before it gets no tempo or intervals, in build or
   * taper, and every run in it but the race is the week's run-walk session
   * (`runWalkTemplateIdForWeek`). Null/omitted → no new runner's weeks,
   * byte-identical to before. Every live path threads it, from the profile
   * (`profileNewRunnerUntil`) or, at setup, from the answer just given.
   */
  newRunnerUntil?: string | null;
  /**
   * The plan's lead-in week (`RunPlan.leadInWeek`), the Monday of the week a
   * plan made partway through it starts in. A plan made Thursday to Sunday
   * (`startsPartway`) starts its first week on the Monday after, and the
   * days left before it are a lead-in: easy runs only, no long run and no
   * tempo or intervals, and not one of the race's weeks. A fresh plan
   * (no `planTotalWeeks`) works this out from `currentDate`; a plan carried
   * on keeps the lead-in it was made with through this, while that week
   * lasts.
   */
  leadInWeek?: string | null;
  /**
   * The person's recent saved runs (`fetchRecentRunning`, the read the
   * layoff comes from), for a running starting point to climb from what was
   * done in this week's plan and to size its rungs at their own pace when
   * there is no confirmed one (`runningClimb`). Null or absent: not known,
   * and the climb goes by the calendar, as for the weeks ahead.
   */
  recentRuns?: readonly DatedRun[] | null;
  /**
   * The day `recentRuns` were read. The weeks after its week haven't been
   * run yet, so they climb as if followed, at the runs' pace (the weeks
   * ahead the outline shows). Absent: `currentDate`.
   */
  recentRunsAsOf?: string;
}

export interface RacePlanV2Output {
  /** The plan's weeks from the one `weekStart` names, or from its first
   *  week when that one is the lead-in: race week is the last. */
  totalWeeks: number;
  /** The lead-in week's Monday when `weeks[0]` is a lead-in, else null
   *  (`RacePlanV2Input.leadInWeek`). */
  leadInWeek: string | null;
  /** True when totalWeeks < race-config minWeeks. UI flags this as
   *  "compressed" so user knows the plan was shortened from the
   *  ideal. */
  compressed: boolean;
  /** Run9 phase-3 (Slice B): true when totalWeeks fell below the taper-safe
   *  floor (= taperWeeks + 1). The week content is then the "finish-safely"
   *  shape — all easy, no quality, the long run capped at baseLongKm.
   *  `belowFloor` implies `compressed`. */
  belowFloor: boolean;
  /** Week-by-week scheduled runs. weeks[0] is the current week: the
   *  lead-in, when there is one, then the plan's weeks. */
  weeks: ScheduledRunDay[][];
}

/** V2 race-prep generator. Drives from weekSchedule, applies
 *  compressed-plan safety rules, emits v2-shaped runDays. */
export function generateRacePlanV2(input: RacePlanV2Input): RacePlanV2Output {
  const config = RACE_CONFIGS[input.raceGoal.distance];
  const tuning = input.tuning ?? DEFAULT_RUN_TUNING;
  const target = parseLocalDate(input.raceGoal.targetDate);
  // Normalised to the anchor, the way `migrateProgramState` normalises its
  // weekStart: `buildRunDayV2` already keys every run to the week that
  // CONTAINS this date, so the week arithmetic below has to start from the
  // same day or the final week's start and the race's key disagree by up
  // to six days. Production passes an on-anchor key; a caller handing in a
  // mid-week date now gets the same plan it would from that week's Monday.
  const weekStartDate = startOfLocalWeek(parseLocalDate(input.weekStart));
  // R2: calendar weeks from the CURRENT week through the race's week,
  // measured from the week's first day — the same origin the weeks are laid
  // out from. Before this it was `ceil((target - currentDate) / 7d)`: a count
  // from TODAY, laid out from the week's FIRST day. Those agree only when
  // today is the first day and the race is not on one; a plan started on the
  // week's last day undercounted by one for every race weekday, which put
  // the race a full week past the sequential final week (#2264 re-keyed the
  // race week to the event's calendar week so the rows at least landed on
  // the right dates, and left the count itself to this change), and a race
  // exactly N weeks out on the anchor day past its own plan even from a
  // fresh Monday start.
  const calendarWeeks = raceCalendarWeeks(weekStartDate, target);
  const thisWeekKey = localWeekKey(weekStartDate);

  // `calendarWeeks` is weeks REMAINING, this one included. The block may be
  // longer — see `planTotalWeeks`. A carry shorter than the time left is
  // stale or corrupt, so it is ignored rather than trusted, unless this week
  // is the plan's lead-in, which comes before its first week.
  const carried =
    input.planTotalWeeks != null && Number.isFinite(input.planTotalWeeks)
      ? input.planTotalWeeks
      : null;
  /** The plan's own lead-in, carried on while its week lasts. */
  const carriedLeadIn =
    carried !== null &&
    input.leadInWeek === thisWeekKey &&
    carried === calendarWeeks - 1;
  const leadIn =
    calendarWeeks >= 2 &&
    (carriedLeadIn ||
      // A fresh plan, or one whose carry is ignored: made today.
      ((carried === null || carried < calendarWeeks) &&
        startsPartway(input.currentDate) &&
        localWeekKey(parseLocalDate(input.currentDate)) === thisWeekKey));
  /** The plan's weeks from its current week, or from its first when this
   *  one is the lead-in. */
  const totalWeeks = leadIn ? calendarWeeks - 1 : calendarWeeks;
  const blockWeeks =
    carried !== null && carried >= totalWeeks ? carried : totalWeeks;
  /** How many weeks of the block are already behind the runner: 0 when the
   *  plan is fresh, which is what makes the fallback byte-identical, and -1
   *  in its lead-in week. */
  const startIndex = leadIn ? -1 : blockWeeks - totalWeeks;

  // Both of these describe the BLOCK, not the days left. Deriving them from
  // weeks-remaining meant every plan became "compressed" in its final weeks —
  // which is why a real marathon taper had ZERO quality: the taper branch is
  // gated on `!compressed`, so the one session Bosquet et al. (2007) say must
  // survive a taper (intensity maintained, volume cut) was the one thing
  // dropped. Reading the block length fixes that as a consequence.
  //
  // Judged on the weeks the runner can TRAIN in (`trainingWeeksOf`), not on
  // the calendar block: for a fresh plan that is `raceTrainingWeeks`, and
  // because the race's weekday is fixed it is the same number on every
  // carried regen.
  const trainingWeeks = trainingWeeksOf(blockWeeks, target);
  const compressed = trainingWeeks < config.minWeeks;
  // Run9 phase-3 (Slice B): below the taper-safe floor (= taperWeeks + 1),
  // compressing is no longer safe — the week content flips to "finish-safely"
  // (all easy, no quality, the long run capped at baseLongKm so there are no
  // week-over-week jumps). belowFloor implies compressed by construction
  // (floor <= minWeeks for every distance).
  const belowFloor = trainingWeeks < getRaceFloorWeeks(input.raceGoal.distance);
  /* Run15 — see `recentLayoff` on the input. */
  const detrained = input.recentLayoff === "detrained";

  const availableRunSlots = input.weekSchedule
    .filter((d) => d.type === "run" || d.type === "both")
    .map((d) => d.day);
  if (availableRunSlots.length === 0) {
    // No run slot at all. Setup and the run plan editor start a race plan
    // at two run days (Pgm7 A7); a plan already on one keeps it (Pgm5), and
    // a week with none is a defensive fallback: an empty plan.
    return {
      totalWeeks,
      leadInWeek: leadIn ? thisWeekKey : null,
      compressed,
      belowFloor,
      weeks: [],
    };
  }
  // Run22: the sizes the ramp gives the last build week's easy run and
  // medium-long run. A stepped taper week takes its shares of the minutes
  // that week holds (`taperBuild`), which are these where no fit shortened
  // them, and these stand in for a run the week doesn't hold.
  const lastBuildWeek = {
    weekIndex: lastRampWeekOf(
      blockWeeks,
      TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance]
    ),
    totalWeeks: blockWeeks,
    taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
    volume: tuning.volume,
  };
  const lastBuildEasyMinutes = tierMinutesOfEasy(
    easyTierForMinutes(easyRunMinutesForWeek(lastBuildWeek))
  );
  const lastBuildMediumLongMinutes = tierMinutesOfEasy(
    easyTierForMinutes(
      mediumLongMinutesForWeek({
        ...lastBuildWeek,
        distance: input.raceGoal.distance,
      })
    )
  );

  // `offset` walks the CALENDAR (weeks[0] is always this week); `w` is the
  // runner's position in the BLOCK, which drives phase and load. They
  // coincide exactly when startIndex is 0, i.e. on a fresh plan. The block
  // is sized from the week's first day, so the final week IS the race's
  // calendar week — no re-keying of the race phase is needed.
  /* Run20 (5): whether a week of the block, by its index, starts before a
     new runner's first weeks end. The build's ladder walk asks it of the
     block's earlier weeks too, so a ladder starts at its first rung when the
     six weeks are over (Run20 (4)). */
  const isNewRunnerWeek = (blockWeek: number) =>
    !!input.newRunnerUntil &&
    localDateString(addLocalDays(weekStartDate, (blockWeek - startIndex) * 7)) <
      input.newRunnerUntil;
  // A block begun as a beginner keeps its spaced schedule throughout.
  // Lifting the cap automatically after six calendar weeks would create a
  // new 3-to-6-day frequency jump without evidence of readiness. The block
  // origin survives weekly regeneration through planTotalWeeks.
  const beginnerBlock =
    !!input.newRunnerUntil &&
    localDateString(addLocalDays(weekStartDate, -Math.max(0, startIndex) * 7)) <
      input.newRunnerUntil;
  /* Run24 (1), deep dive D1: the marathon's long run may take three
     hours, measured at the confirmed easy pace or, without one, at the
     recent runs' own, and is never held under the farthest of them, so a
     benchmark accepted mid-block cannot lower the plan below a long run
     already run. 5K to half keep the 150 minutes at the confirmed pace. */
  const runsReadOn = input.recentRunsAsOf ?? input.currentDate;
  const longCeiling: LongRunCeiling | null =
    input.raceGoal.distance === "marathon"
      ? {
          paceSPerKm:
            input.easyPaceSPerKm ??
            (input.recentRuns
              ? recentPace(input.recentRuns, runsReadOn)
              : null),
          maxMinutes: MARATHON_LONG_RUN_MAX_MINUTES,
          floorKm: input.recentRuns
            ? (recentRunning(
                input.recentRuns,
                localDateString(addLocalDays(parseLocalDate(runsReadOn), 1))
              ).longestKm ?? 0)
            : 0,
        }
      : null;
  /* Run24 (8): a block begun as a new runner holds no tempo or intervals
     until the runner has run 40 minutes in one go
     (`beginnerQualityWeek`), its first weeks or not; the build's easy weeks
     keep their strides until then. Without the runs it is not known, so the
     block holds none. Asked of the block's earlier weeks too, so a ladder
     starts at its first rung when quality begins (Run20 (4)). */
  const beginnerQualityFrom = beginnerBlock
    ? beginnerQualityWeek(input.recentRuns)
    : null;
  const holdsNoQuality = (blockWeek: number) =>
    isNewRunnerWeek(blockWeek) ||
    (beginnerBlock &&
      (beginnerQualityFrom === null ||
        localDateString(
          addLocalDays(weekStartDate, (blockWeek - startIndex) * 7)
        ) < beginnerQualityFrom));
  /** Run23: how far up the long-run ladder the block's weeks have climbed. */
  const climb: LongRunClimb = new Map();
  /* Run15 (deep dive D11): the week a runner came back in
     after a detraining-length gap, from the runs read. Its week starts a
     rung under the base long run, with 20-minute easy runs, and each week
     after climbs one rung and ten minutes, never past the ramp's own, so a
     return no longer opens on the full base week and holds it. Null when
     no such gap shows in the runs read, or none were read: then a
     detrained runner's long run ramps toward base, as before. */
  const returnWeek = input.recentRuns
    ? returnWeekKey(input.recentRuns, input.recentRunsAsOf ?? input.currentDate)
    : null;
  const baseLongRung = LONG_RUN_TIERS.findIndex(
    (t) =>
      t.id ===
      longTierForKm(
        config.baseLongKm,
        input.easyPaceSPerKm ?? null,
        longCeiling
      )
  );
  /** Week `w` of the block, before the fits below (`fittedWeek`). A week
   *  behind the runner has a negative `offset`: the taper's walk of the
   *  build builds those (`taperBuild`). */
  const blockWeekRunsAsRamped = (w: number): ScheduledRunDay[] => {
    const offset = w - startIndex;
    const weekStart = addLocalDays(weekStartDate, offset * 7);
    // Established blocks retain chosen training/taper frequency unchanged.
    const runEligibleSlots = beginnerBlock
      ? starterRunSlots(input.weekSchedule)
      : availableRunSlots;
    // The lead-in, before the plan's first week: an easy run on each of
    // the week's run days from today (Run19), so the running starting point
    // fits the runs the lead-in holds. No long run and no tempo or
    // intervals: the plan's first long run is the next weekend's (Run20
    // (2)).
    if (w < 0)
      return runEligibleSlots
        .map((dayIndex) =>
          buildRunDayV2({
            dayIndex,
            templateId: "easy_30",
            type: "easy",
            weekStart,
          })
        )
        .filter((run) => !run.date || run.date >= input.currentDate)
        .sort((a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex));
    const phase = getPhaseForWeek(w, blockWeeks, input.raceGoal.distance);
    const week: ScheduledRunDay[] = [];
    // Run20 (5): a new runner's first weeks hold no tempo or intervals.
    const newRunnerWeek = isNewRunnerWeek(w);
    /** Whole weeks since the runner came back (`returnWeek`), in a base or
     *  build week from that one on; null otherwise. */
    const weeksBack = (() => {
      if (returnWeek === null || (phase !== "base" && phase !== "build"))
        return null;
      const back = wholeWeeksBetween(returnWeek, localWeekKey(weekStart));
      return back >= 0 ? back : null;
    })();

    const longSlot = pickLongRunSlot(runEligibleSlots, input.weekSchedule);
    const remaining = runEligibleSlots.filter((d) => d !== longSlot);

    // Easy runs ramp with the long run in base/build. Race and below-floor
    // weeks stay at the base duration — cutting easy volume IS what those
    // weeks are for. A taper week steps down from the last build week's
    // runs as that week holds them (Run22), each in the plan's own sizes and
    // never under the base 30; the week before race week is at the base, as
    // every taper week once was.
    const taperShare =
      phase === "taper"
        ? taperStepShare({
            weekIndex: w,
            totalWeeks: blockWeeks,
            taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
            fromStart: taperStart !== null,
          })
        : null;
    const taperStep = (buildMinutes: number) =>
      easyTierForMinutes(
        Math.max(EASY_BASE_MINUTES, (taperShare ?? 0) * buildMinutes)
      );
    const rampEasyId =
      (belowFloor && !taperShare) ||
      phase === "race" ||
      (phase === "taper" && !taperShare)
        ? "easy_30"
        : phase === "taper"
          ? taperStep(taperBuild().easyMinutes)
          : easyTierForMinutes(
              easyRunMinutesForWeek({
                weekIndex: w,
                totalWeeks: blockWeeks,
                taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
                volume: tuning.volume,
              })
            );
    // Back from a layoff: easy runs of 20 minutes in the week back, ten
    // more each week after, never past the ramp's own (`returnWeek`).
    const backEasyMinutes =
      weeksBack === null ? null : RETURN_EASY_MINUTES + 10 * weeksBack;
    const easyId =
      backEasyMinutes === null ||
      backEasyMinutes >= tierMinutesOfEasy(rampEasyId)
        ? rampEasyId
        : backEasyMinutes >= EASY_BASE_MINUTES
          ? easyTierForMinutes(backEasyMinutes)
          : "easy_20";
    // RUN-EV-11: ONE easy slot per base/build week is the medium-long run,
    // with a distance-aware ceiling (see MEDIUM_LONG_PEAK_MINUTES). Race and
    // below-floor weeks keep every run short — that cut is the point of
    // those weeks — and a detrained returner gets no medium-long for the
    // same reason they get no quality: no base to load. A stepped taper
    // week keeps it at its share of the one the last build week held
    // (Run22). 5K plans degenerate to the plain easy tier (peak == easy
    // ceiling).
    const midLongId =
      belowFloor ||
      phase === "race" ||
      input.recentLayoff === "detrained" ||
      (phase === "taper" && !taperShare)
        ? easyId
        : phase === "taper"
          ? taperStep(taperBuild().mediumLongMinutes)
          : easyTierForMinutes(
              mediumLongMinutesForWeek({
                weekIndex: w,
                totalWeeks: blockWeeks,
                taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
                volume: tuning.volume,
                distance: input.raceGoal.distance,
              })
            );
    // Run20: a medium-long run of an hour or more is demanding, so it is
    // kept off the days beside the long run and the quality sessions.
    const midLongDemanding = tierMinutesOfEasy(midLongId) >= 60;

    // RUN-M2: race week is identical whether or not the plan is belowFloor —
    // the race on `targetDate` (so `date === raceGoal.targetDate`) plus easy
    // shakeouts on the user's OTHER run-eligible days. The race day is placed
    // by date, not by the long-run slot, and is excluded from the easy set so
    // it isn't double-booked (it need not be a scheduled run day at all — you
    // race on race day regardless of the weekly template).
    if (phase === "race") {
      week.push({
        ...buildRunDayV2({
          dayIndex: target.getDay(),
          templateId: pickRaceTemplateId(input.raceGoal.distance),
          type: "race",
          weekStart,
        }),
        // The server reconciles the race by this exact local date.
        date: input.raceGoal.targetDate,
      });
      // Only dates before the event are shakeouts. Comparing actual dates
      // works for every weekday, including a Sunday at the end of the week
      // — and excludes the race's own date, so nothing shares its slot
      // (`raceRunDayDate.run-m2`).
      runEligibleSlots
        .filter((d) => {
          const date = dateForDayOfWeek(localWeekKey(weekStart), d);
          const lastAllowed = beginnerBlock
            ? localDateString(addLocalDays(target, -1))
            : input.raceGoal.targetDate;
          return date < lastAllowed;
        })
        // The event remains visible, not a claim of beginner race readiness.
        .slice(0, beginnerBlock ? 2 : undefined)
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
      return week.sort(
        (a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex)
      );
    }

    // Run9 phase-3 (Slice B) — finish-safely shape. Below the taper-safe
    // floor we DON'T silently compress quality into a doomed plan; we keep the
    // race date and emit an honest risk-managed week: the race day stays the
    // race; every other week is one capped long run (baseLongKm — no jumps
    // toward peak) + all easy, never tempo/intervals. The UI names the risk
    // via runPlan.belowFloor.
    if (belowFloor) {
      // Race week already handled above; here phase is base/build/taper.
      // With a running starting point (`taperStart`), a taper week keeps a
      // long run at its share of the person's own longest, a share of what
      // they already run rather than a jump toward anything.
      const floorLongId = pickLongTemplateId({
        weekIndex: w,
        totalWeeks: blockWeeks,
        phase,
        baseLongKm: config.baseLongKm,
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
        peakLongKm: config.baseLongKm,
        taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
        volume: tuning.volume,
        easyPaceSPerKm: input.easyPaceSPerKm ?? null,
        ceiling: longCeiling,
        buildLongestKm,
        climb,
        fromStart: taperStart !== null,
      });
      week.push(
        buildRunDayV2({
          dayIndex: longSlot,
          templateId: floorLongId,
          type: floorLongId === "easy_30" ? "easy" : "long",
          weekStart,
        })
      );
      remaining.forEach((d) =>
        week.push(
          buildRunDayV2({
            dayIndex: d,
            // The easy 30s, or a taper share of the starting point's.
            templateId: easyId,
            type: "easy",
            weekStart,
          })
        )
      );
      return week.sort(
        (a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex)
      );
    }

    // Long run (race week already handled above; phase is base/build/taper).
    // A taper week three or two weeks before race week keeps one (Run22).
    const rampLongId = pickLongTemplateId({
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
      peakLongKm:
        detrained && returnWeek === null
          ? config.baseLongKm
          : config.peakLongKm,
      taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
      volume: tuning.volume,
      easyPaceSPerKm: input.easyPaceSPerKm ?? null,
      ceiling: longCeiling,
      buildLongestKm,
      climb,
      fromStart: taperStart !== null,
    });
    // Back from a layoff: a rung under base in the week back, a rung a week
    // after it, never past the ramp's own (`returnWeek`).
    const rampRung = LONG_RUN_TIERS.findIndex((t) => t.id === rampLongId);
    const longId =
      weeksBack !== null && rampRung >= 0 && baseLongRung >= 0
        ? LONG_RUN_TIERS[
            Math.min(rampRung, Math.max(0, baseLongRung - 1 + weeksBack))
          ].id
        : rampLongId;
    week.push(
      buildRunDayV2({
        dayIndex: longSlot,
        templateId: longId,
        type: longId === "easy_30" ? "easy" : "long",
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
        easyDaysInFillOrder({
          easyDays: remaining,
          demandingDays: [longSlot],
          mediumLongDemanding: midLongDemanding,
        }).forEach((d, i) =>
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
        // 1 quality + rest easy (or all easy if compressed and the long run
        // already consumed the week's quality budget); gentler forces the
        // quality to tempo, no intervals; harder adds the other flavour.
        const rules = {
          hardCapApplies,
          skipQuality: skipQualityEntirely || detrainedSkipsQuality,
          gentler,
          secondQuality: allowSecondQuality && remaining.length >= 3,
        };
        const ladder = {
          totalWeeks: blockWeeks,
          taperWeeks: TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance],
          distance: input.raceGoal.distance,
          difficulty: tuning.difficulty,
        };
        /* Run20: the highest rung each ladder reached in the block's
           earlier weeks, walked under the same rules, so the first session
           of each kind is its first rung and a regenerated week climbs on
           from where the plan had got to. */
        const highestRungBefore = (flavour: "tempo" | "intervals") => {
          const tiers = flavour === "tempo" ? TEMPO_TIERS : INTERVAL_TIERS;
          let highest = -1;
          for (let k = 0; k < w; k++) {
            const held = qualityFlavoursForWeek({
              weekIndex: k,
              phase: getPhaseForWeek(k, blockWeeks, input.raceGoal.distance),
              ...rules,
              // Run20 (5): a new runner's week held none.
              skipQuality: rules.skipQuality || holdsNoQuality(k),
            });
            if (!held.includes(flavour)) continue;
            const id = qualityTemplateId({
              ...ladder,
              flavour,
              weekIndex: k,
              highestBefore: highest,
            });
            highest = Math.max(
              highest,
              tiers.findIndex((tier) => tier.id === id)
            );
          }
          return highest;
        };
        const flavours = qualityFlavoursForWeek({
          weekIndex: w,
          phase,
          ...rules,
          // Run24 (8): nor a beginner's block until they can run 40
          // minutes. Its taper then holds none either: its build held none.
          skipQuality: rules.skipQuality || holdsNoQuality(w),
        });
        if (flavours.length > 0) {
          const qualityType = flavours[0];
          const qualityId = qualityTemplateId({
            ...ladder,
            flavour: qualityType,
            weekIndex: w,
            highestBefore: highestRungBefore(qualityType),
          });
          const secondQualityHere = flavours.length === 2;
          const qualitySlots = chooseQualityRunSlots({
            availableDays: remaining,
            longDay: longSlot,
            count: secondQualityHere ? 2 : 1,
            weekSchedule: input.weekSchedule,
          });
          week.push(
            buildRunDayV2({
              dayIndex: qualitySlots[0],
              templateId: qualityId,
              type: qualityType,
              weekStart,
            })
          );
          // Harder: a SECOND quality session (the other flavour) when
          // the week has a spare slot and no safety cap applies. Run18:
          // "spare" means a slot BEYOND the week's easy run — with three
          // run days the second quality session took the only easy day
          // (tempo + intervals + long, nothing easy), so it needs three
          // remaining slots, i.e. four run days or more.
          if (secondQualityHere) {
            const secondType = flavours[1];
            week.push(
              buildRunDayV2({
                dayIndex: qualitySlots[1],
                templateId: qualityTemplateId({
                  ...ladder,
                  flavour: secondType,
                  weekIndex: w,
                  highestBefore: highestRungBefore(secondType),
                }),
                type: secondType,
                weekStart,
              })
            );
          }
          const easyOrder = easyDaysInFillOrder({
            easyDays: remaining.filter((day) => !qualitySlots.includes(day)),
            demandingDays: [longSlot, ...qualitySlots],
            mediumLongDemanding: midLongDemanding,
          });
          /* Deep dive D16: a week with two quality sessions and no day clear
             of them and the long run put an hour-and-a-half run between
             intervals and a tempo (6 x 1 km, 90 minutes, 40 minutes of
             tempo on Monday to Wednesday). There the medium-long is held
             under the hour, so it is not one more demanding run beside
             them. A Tropos heuristic in the RUN-EV-06 register. */
          const weekMidLongId =
            secondQualityHere &&
            midLongDemanding &&
            easyOrder.length > 0 &&
            !clearOf(easyOrder[0], [longSlot, ...qualitySlots])
              ? easyTierForMinutes(CROWDED_MEDIUM_LONG_MINUTES)
              : midLongId;
          easyOrder.forEach((d, i) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                // RUN-EV-11: first easy slot is the medium-long;
                // WAVE1-STRIDES: the next plain easy gains strides.
                templateId:
                  i === 0
                    ? weekMidLongId
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
          easyDaysInFillOrder({
            easyDays: remaining,
            demandingDays: [longSlot],
            mediumLongDemanding: midLongDemanding,
          }).forEach((d, i) =>
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
        // taper work — taper is about arriving fresh. The easy days take
        // the medium-long first, stepped down (Run22), in the build's
        // fill order (Run20). The fitted build must have held quality:
        // lower taper volume can release a running-baseline fit, but that
        // must not introduce intensity the build never prescribed.
        if (
          !compressed &&
          !gentler &&
          !detrainedSkipsQuality &&
          !newRunnerWeek
        ) {
          // Placed like every quality session (RUN-EV-10): away from the
          // long-run slot and off a lifting day where the week allows.
          const [taperDay] = chooseQualityRunSlots({
            availableDays: remaining,
            longDay: longSlot,
            count: 1,
            weekSchedule: input.weekSchedule,
          });
          // Keep the sharpener's slot and the other easy runs' fill order.
          // The easy replacement is shorter than 8x400's 25 minutes:
          // dropping into the all-easy branch instead lengthened this run
          // to 30 minutes and could move the medium-long onto another day.
          const heldQuality = taperBuild().heldQuality;
          week.push(
            buildRunDayV2({
              dayIndex: taperDay,
              templateId: heldQuality ? "8x400" : "easy_20",
              type: heldQuality ? "intervals" : "easy",
              weekStart,
            })
          );
          easyDaysInFillOrder({
            easyDays: remaining.filter((d) => d !== taperDay),
            demandingDays: [longSlot, taperDay],
            mediumLongDemanding: midLongDemanding,
          }).forEach((d, i) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: i === 0 ? midLongId : easyId,
                type: "easy",
                weekStart,
              })
            )
          );
        } else {
          easyDaysInFillOrder({
            easyDays: remaining,
            demandingDays: [longSlot],
            mediumLongDemanding: midLongDemanding,
          }).forEach((d, i) =>
            week.push(
              buildRunDayV2({
                dayIndex: d,
                templateId: i === 0 ? midLongId : easyId,
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

    return week.sort(
      (a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex)
    );
  };

  /* Deep dive D13: the taper and race week fall back to 30-minute easy runs,
     and a runner whose build held its easy runs to 20 minutes (a running
     starting point still climbing, a time limit) ran more on the weekdays
     of the taper than in the build: five 30s after five 20s. Their easy
     runs at that floor now stay at what the build held. */
  const blockWeekRuns = (w: number): ScheduledRunDay[] => {
    const week = blockWeekRunsAsRamped(w);
    if (w < 0) return week;
    const phase = getPhaseForWeek(w, blockWeeks, input.raceGoal.distance);
    if (phase !== "taper" && phase !== "race") return week;
    const held = taperBuild().easyMinutes;
    if (held >= EASY_BASE_MINUTES) return week;
    const floorId = held >= 20 ? "easy_20" : "easy_10";
    return week.map((run) =>
      run.type === "easy" && TAPER_FLOOR_IDS.has(run.templateId)
        ? {
            ...run,
            templateId: floorId,
            id: generateScheduledRunId(
              { dayIndex: run.dayIndex, templateId: floorId },
              run.weekKey!
            ),
          }
        : run
    );
  };

  // Run9 phase-3 (Slice C) — clash flag. pickLongRunSlot prefers run-only
  // slots and only falls back to a "both" day when none exist, so a HARD run
  // landing on a both-day is the forced lift+run clash (the 6-day-lifter case
  // R3-placement flagged). Flag it so the UI can surface "shares a day with
  // lifting" — the run is still placed, never dropped. Easy runs on both-days
  // stay unflagged (low stress).
  const bothDays = new Set(
    input.weekSchedule.filter((d) => d.type === "both").map((d) => d.day)
  );
  /** The Monday of the block's first week. */
  const blockWeekZero = localDateString(
    addLocalDays(weekStartDate, -startIndex * 7)
  );
  /** Whether the week starting `weekKey` is one of the block's step-back
   *  weeks, which a person's climb from their starting point eases off in
   *  too (`runningClimb`). */
  const isStepBackWeek = (weekKey: string) => {
    const index = wholeWeeksBetween(blockWeekZero, weekKey);
    return (
      index >= 0 &&
      index < blockWeeks &&
      isRunStepBackWeek(index, blockWeeks, input.raceGoal.distance)
    );
  };
  const baseline = isRunningBaseline(input.runningBaseline)
    ? input.runningBaseline
    : null;
  /* The pace the climb's rungs are sized at: the confirmed one, else the
     recent runs' own, so a long run's rung is the minutes it takes this
     runner; the template's minutes with neither. It sizes the climb alone:
     prescriptions keep the confirmed pace only (RUN-EV-08). */
  const runsAsOf = input.recentRunsAsOf ?? input.currentDate;
  const climbPace =
    input.easyPaceSPerKm ??
    (input.recentRuns && recentPace(input.recentRuns, runsAsOf));
  /* Deep dive D8: a block that opens in its taper has no build for the
     taper to take its shares of, so every week of it was easy 30s, and a
     runner who joined a race late with a 20 km long run behind them ran
     nothing over 30 minutes before a marathon. A compressed block's build
     is cut short by the calendar the same way, so its taper took its
     shares of a long run well under the runner's own. With a running
     starting point, a compressed block's taper takes its shares of the
     larger of the two: the long run the person's running has climbed to
     by the block's first week, and the rest of that week's running over
     the other run days. A share of what they already run, so never a jump.
     Not for a new runner's block, whose runs are their run-walk sessions,
     nor a detrained one, whose starting point is from before the gap. */
  const taperStart = ((): { longestKm: number; easyMinutes: number } | null => {
    if (!compressed || !baseline || detrained || beginnerBlock) return null;
    const climbed = runningClimb(baseline, blockWeekZero, {
      easyPaceSPerKm: climbPace,
    });
    let longestKm = 0;
    for (const tier of LONG_RUN_TIERS) {
      const template = RUN_TEMPLATES.find((t) => t.id === tier.id);
      if (
        template &&
        plannedRunMinutes(template, climbPace) <= climbed.longestMinutes
      )
        longestKm = Math.max(longestKm, tier.km);
    }
    const otherRuns = Math.max(
      1,
      Math.min(input.weeklyRunDays, availableRunSlots.length) - 1
    );
    return { longestKm, easyMinutes: climbed.otherMinutes / otherRuns };
  })();
  /** A week of the block as the plan holds it: every fit applied, and the
   *  clash flag. */
  const fittedWeek = (week: ScheduledRunDay[]): ScheduledRunDay[] => {
    // Run20 (5): every run but the race in a new runner's first weeks is
    // that week's run-walk session, and after them each run is held to the
    // minutes the running has built to (`newRunnerTemplate`). Applied before
    // the fits, which leave a run-walk session as it is: each fits in 30
    // minutes, the shortest time limit there is, and the running baseline
    // fits continuous runs. Both fits only ever shorten a run.
    const dayBeforeRace = localDateString(addLocalDays(target, -1));
    const eligibleWeek = beginnerBlock
      ? week.filter((row) => row.type === "race" || row.date !== dayBeforeRace)
      : week;
    const walked = eligibleWeek.map((row) => {
      const next =
        row.type === "race"
          ? null
          : newRunnerTemplate(
              row.templateId,
              row.weekKey ?? "",
              input.newRunnerUntil,
              input.easyPaceSPerKm
            );
      return next ? { ...row, templateId: next.id, type: next.type } : row;
    });
    const limited = walked.map((row) =>
      fitRunToTimeLimit(row, input.runTimeLimits, input.easyPaceSPerKm)
    );
    // The person's running, as it has climbed from their starting point by
    // this week. This week's climbs from what was done before it, from the
    // saved runs, once it has begun by the day they were read; a week behind
    // it, which only the taper's walk of the build builds, and the weeks
    // ahead go by the calendar, as if followed.
    const weekKey = week[0]?.weekKey;
    const fitted = fitWeekToRunningBaseline(
      limited,
      baseline,
      baseline && weekKey
        ? runningClimb(baseline, weekKey, {
            easyPaceSPerKm: climbPace,
            isStepBack: isStepBackWeek,
            done:
              // A week begun by the day the runs were read.
              input.recentRuns && weekKey === thisWeekKey && weekKey <= runsAsOf
                ? recentRunning(
                    input.recentRuns,
                    weekKey,
                    Math.min(input.weeklyRunDays, availableRunSlots.length)
                  )
                : null,
          })
        : null,
      climbPace,
      // A taper or race week cuts its running (deep dive D13).
      (() => {
        if (!weekKey) return false;
        const index = wholeWeeksBetween(blockWeekZero, weekKey);
        if (index < 0 || index >= blockWeeks) return false;
        const phase = getPhaseForWeek(
          index,
          blockWeeks,
          input.raceGoal.distance
        );
        return phase === "taper" || phase === "race";
      })()
    );
    return fitted.map((row, index) => {
      const rd =
        row === week[index]
          ? row
          : { ...row, id: generateScheduledRunId(row, row.weekKey!) };
      return HARD_RUN_TYPES.has(rd.type) && bothDays.has(rd.dayIndex)
        ? { ...rd, clashesWithLift: true }
        : rd;
    });
  };

  /* Run22: what the build held, which a stepped taper week takes its shares
     of, is what the block's weeks before the taper hold as the plan builds
     them, every fit applied: (1) the longest long run among them, and (2)
     the easy minutes the last of them holds, its medium-long and its easy
     run. Taken from the ramp, the shares stepped a build held short (a new
     runner's minutes, a time limit, a running baseline) down from runs it
     never held: a new runner's marathon built to 12 km and was asked for 15
     two weeks before race week, and three weeks out it kept the 60-minute
     medium-long its last build week held, beside a 45-minute long run. A
     taper week is built at its rollover with its build behind it, in none
     of the weeks this call returns, so the build is built again here, once,
     from the same inputs, and every taper week takes its shares of the same
     numbers. The fits only ever shorten a run, so none is past what the
     ramp asked for. */
  type TaperBuild = {
    longestKm: number;
    easyMinutes: number;
    mediumLongMinutes: number;
    heldQuality: boolean;
  };
  const minutesOf = (run: ScheduledRunDay) => {
    const template = RUN_TEMPLATES.find((t) => t.id === run.templateId);
    return template ? plannedRunMinutes(template, input.easyPaceSPerKm) : 0;
  };
  let heldBuild: TaperBuild | undefined;
  const taperBuild = (): TaperBuild => {
    if (heldBuild) return heldBuild;
    const firstTaperWeek =
      blockWeeks - 1 - TAPER_WEEKS_BY_DISTANCE[input.raceGoal.distance];
    // A block with no build takes its shares of the starting point alone.
    const held: TaperBuild =
      taperStart && firstTaperWeek < 1
        ? {
            longestKm: taperStart.longestKm,
            easyMinutes: taperStart.easyMinutes,
            mediumLongMinutes: taperStart.easyMinutes,
            heldQuality: false,
          }
        : {
            longestKm: 0,
            easyMinutes: lastBuildEasyMinutes,
            mediumLongMinutes: lastBuildMediumLongMinutes,
            heldQuality: false,
          };
    for (let k = 0; k < firstTaperWeek; k++) {
      const planned = blockWeekRuns(k);
      const week = fittedWeek(planned);
      held.heldQuality ||= week.some(
        (run) => run.type === "tempo" || run.type === "intervals"
      );
      for (const run of week)
        if (run.type === "long")
          held.longestKm = Math.max(
            held.longestKm,
            LONG_RUN_TIERS.find((t) => t.id === run.templateId)?.km ?? 0
          );
      if (k < firstTaperWeek - 1) continue;
      // The last build week's easy runs, each as planned and as held: the
      // one planned longest is the medium-long, the rest its easy runs.
      // Where the medium-long was the week's one easy run, its easy run is
      // the ramp's size held to no more than the medium-long was; with no
      // easy run at all, the ramp's sizes stand.
      const easy = planned
        .map((run, i) => ({
          run,
          planned: minutesOf(run),
          held: minutesOf(week[i]),
        }))
        .filter(({ run }) => run.type === "easy")
        .sort((a, b) => b.planned - a.planned);
      if (easy.length === 0) continue;
      held.mediumLongMinutes = easy[0].held;
      held.easyMinutes =
        easy.length > 1
          ? Math.max(...easy.slice(1).map((e) => e.held))
          : Math.min(lastBuildEasyMinutes, easy[0].held);
    }
    // A compressed build, cut short, under the starting point: the taper
    // takes its shares of the starting point.
    if (taperStart && firstTaperWeek >= 1) {
      held.longestKm = Math.max(held.longestKm, taperStart.longestKm);
      held.easyMinutes = Math.max(held.easyMinutes, taperStart.easyMinutes);
      held.mediumLongMinutes = Math.max(
        held.mediumLongMinutes,
        taperStart.easyMinutes
      );
    }
    return (heldBuild = held);
  };
  const buildLongestKm = () => taperBuild().longestKm;

  // One week per calendar week from this one: the lead-in first, when this
  // week is one, then the plan's.
  const weeks = Array.from({ length: calendarWeeks }, (_, offset) =>
    fittedWeek(blockWeekRuns(startIndex + offset))
  );
  return {
    totalWeeks,
    leadInWeek: leadIn ? thisWeekKey : null,
    compressed,
    belowFloor,
    weeks,
  };
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
