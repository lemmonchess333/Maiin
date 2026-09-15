import type { RunningBaseline } from "@/features/program/runningBaseline";
import {
  plannedRunMinutes,
  type RunTimeLimits,
} from "@/features/program/runTimeLimits";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  continuingRacePlan,
  continuedBlockWeeks,
  preserveEditedRunDays,
} from "@/features/program/racePlanContinuation";
import type { ProgramState } from "@/features/program/programTypes";
/**
 * Race Goal Planner — pure derivation of the pre-save preview shown in the
 * Programme Settings race-prep editor (see RaceGoalPlanner.tsx).
 *
 * The editor used to take a distance + target date and save with only a
 * future-date check. This helper answers, BEFORE save, what that date means
 * for the plan: how many weeks out, whether that's healthy / compressed /
 * too-tight for the distance, the first-week phase, the weekly structure the
 * engine will build, and post-race recovery.
 *
 * SINGLE SOURCE OF TRUTH — every number here is read from the SAME engine the
 * save commits. `planBuilder.buildRunPlan` calls `generateRacePlanV2` with
 * `weekStart = localWeekKey(parseLocalDate(currentDate))` and the same
 * `currentDate`; this helper mirrors that derivation exactly, so the preview's
 * weeks / compressed / belowFloor match the saved plan. The status is taken
 * straight from the engine's own `compressed` / `belowFloor` booleans rather
 * than a parallel re-classification.
 *
 * No medical warnings, no performance promises (Run9 / design system).
 */
import { planWeekSchedule, type ScheduleDay } from "./scheduleUtils";
import { localWeekKey, parseLocalDate } from "./dateHelpers";
import {
  getRaceMinWeeks,
  getRaceFloorWeeks,
  getRacePhaseLabel,
} from "@/features/program/runPlanTiming";
import {
  generateRacePlanV2,
  recoveryWeeksForDistance,
  type RunTuning,
} from "@/features/program/runScheduler";
import { raceDistanceLabel } from "./runProgrammeViewModel";
import {
  paceTableFromFitness,
  raceTargetBand,
  vdotFromRace,
  type RaceTargetBand,
  type RunFitnessInput,
} from "./runPaces";
import { paceMinSec } from "./runLabels";
import { paceUnitLabel, type DistanceUnit } from "./distanceUnits";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

/**
 * Five states, not four. `below-floor` (finish-safely) is DISTINCT from
 * `compressed`: below the taper-safe floor, compress-to-keep-date stops being
 * the safe default and the plan becomes mostly-easy "finish safely". `empty`
 * and `invalid` are UI-only states the engine never sees.
 */
export type RacePlannerStatus =
  | "empty"
  | "invalid"
  | "healthy"
  | "compressed"
  | "below-floor";

export interface RaceGoalPlannerInput {
  distance: RaceDistance;
  /** Local "YYYY-MM-DD"; "" when no date chosen yet. */
  targetDate: string;
  /** Local "YYYY-MM-DD" — injected for determinism, never read from wall clock here. */
  currentDate: string;
  liftDays: number;
  weeklyRunDays: number;
  /** Pgm6 knobs — the preview must run the SAME tuning the save will
   *  commit, or the previewed week structure drifts from the plan.
   *  Optional (absent → standard) for non-editor callers. */
  tuning?: RunTuning;
  runningBaseline?: RunningBaseline | null;
  runTimeLimits?: RunTimeLimits | null;
  easyPaceSPerKm?: number | null;
  existingState?: ProgramState | null;
  recentLayoff?: import("@/features/program/layoffDetection").LayoffClass;
  weekSchedule?: ScheduleDay[];
}

export interface RaceGoalPlannerState {
  status: RacePlannerStatus;
  /** Natural (unclamped) weeks until the race, for display. 0 on race day. */
  weeksOut: number;
  /** Calendar days until the race, for display. 0 on race day. */
  daysOut: number;
  /** Ideal build length for this distance (5k=4, 10k=6, half=8, marathon=12). */
  idealWeeks: number;
  /** Taper-safe floor for this distance (5k=2, 10k=2, half=3, marathon=4). */
  floorWeeks: number;
  /** "5K" | "10K" | "Half Marathon" | "Marathon". */
  distanceLabel: string;
  /** Phase of week 0 ("Base" for healthy plans). "" for empty/invalid. */
  firstWeekPhase: string;
  /** Run days the plan will build (= the engine's first-week run count). */
  recommendedRunDays: number;
  /** Lift+run days that share a calendar day (liftDays + runDays - 7). */
  doubleDays: number;
  /** Hard runs (long/tempo/intervals/race) the engine flags as clashing with a lift day, in week 0. */
  hardClashDays: number;
  timeLimitedRuns: number;
  firstWeekMinutes: number;
  /** Post-race easy weeks (5k=1, 10k=2, half=3, marathon=4). */
  recoveryWeeks: number;
  compressed: boolean;
  belowFloor: boolean;
  statusTitle: string;
  statusDescription: string;
  /** Status-aware save CTA; "" for empty/invalid (editor keeps "Fix race date"). */
  ctaLabel: string;
}

/**
 * Compute the planner preview for the current draft inputs. Pure — safe to call
 * from a useMemo on every keystroke.
 */
export function getRaceGoalPlannerState(
  input: RaceGoalPlannerInput
): RaceGoalPlannerState {
  const { distance, targetDate, currentDate, liftDays, weeklyRunDays } = input;

  // Distance-only fields are valid in every state (no date needed).
  const distanceLabel = raceDistanceLabel(distance);
  const idealWeeks = getRaceMinWeeks(distance);
  const floorWeeks = getRaceFloorWeeks(distance);
  const recoveryWeeks = recoveryWeeksForDistance(distance);
  const doubleDays = Math.max(0, liftDays + weeklyRunDays - 7);

  const emptyBase: RaceGoalPlannerState = {
    status: "empty",
    weeksOut: 0,
    daysOut: 0,
    idealWeeks,
    floorWeeks,
    distanceLabel,
    firstWeekPhase: "",
    recommendedRunDays: weeklyRunDays,
    doubleDays,
    hardClashDays: 0,
    timeLimitedRuns: 0,
    firstWeekMinutes: 0,
    recoveryWeeks,
    compressed: false,
    belowFloor: false,
    statusTitle: "",
    statusDescription: "Choose your race date to preview the plan.",
    ctaLabel: "",
  };

  // ── State A — no date chosen.
  if (!targetDate) return emptyBase;

  // ── State B — past date (mirrors ProgrammeSettings `raceDateInvalid`:
  // past-or-empty only, so a date == currentDate is VALID and falls through).
  if (targetDate < currentDate) {
    return {
      ...emptyBase,
      status: "invalid",
      statusDescription: "Pick a future race date.",
    };
  }

  // Truthful display values (natural, unclamped). The engine clamps totalWeeks
  // to a floor of 2, so we never surface that as the headline.
  const now = parseLocalDate(currentDate);
  const target = parseLocalDate(targetDate);
  const daysOut = Math.max(
    0,
    Math.round((target.getTime() - now.getTime()) / 86400000)
  );
  const weeksOut = Math.ceil(daysOut / 7);

  // Build the plan through the SAME engine + derivation the save path uses.
  const weekSchedule = planWeekSchedule(
    liftDays,
    weeklyRunDays,
    input.weekSchedule
  );
  const weekStart = localWeekKey(now);
  const continued = continuingRacePlan(input.existingState?.runPlan, {
    distance,
    targetDate,
  });
  const plan = generateRacePlanV2({
    // Settings preview the same returning-runner guard used by the save.
    // Calendar-only callers deliberately retain the no-history fallback.
    recentLayoff: input.recentLayoff ?? "none",
    weekSchedule,
    raceGoal: { distance, targetDate },
    weeklyRunDays,
    currentDate,
    weekStart,
    tuning: input.tuning,
    runningBaseline: input.runningBaseline,
    runTimeLimits: input.runTimeLimits,
    easyPaceSPerKm: input.easyPaceSPerKm,
    planTotalWeeks: continued?.totalWeeks,
  });
  if (continued && plan.weeks[0]) {
    plan.weeks[0] = preserveEditedRunDays(
      input.existingState?.runDays ?? [],
      plan.weeks[0],
      input.existingState?.manualCompletions,
      currentDate
    );
  }

  // Status straight from the engine's own booleans (belowFloor ⊂ compressed).
  const status: RacePlannerStatus = plan.belowFloor
    ? "below-floor"
    : plan.compressed
      ? "compressed"
      : "healthy";

  const week0 = (plan.weeks[0] ?? []).filter((run) =>
    run.date
      ? localWeekKey(parseLocalDate(run.date)) === weekStart
      : !run.weekKey || run.weekKey === weekStart
  );
  const recommendedRunDays = week0.length || weeklyRunDays;
  const hardClashDays = week0.filter((rd) => rd.clashesWithLift).length;
  const blockWeeks = continuedBlockWeeks(plan.totalWeeks, continued);
  const firstWeekPhase = getRacePhaseLabel(
    blockWeeks - plan.totalWeeks,
    blockWeeks,
    distance
  );

  const lower = distanceLabel.toLowerCase();
  let statusTitle: string;
  let statusDescription: string;
  let ctaLabel: string;
  if (status === "healthy") {
    statusTitle = "Good runway";
    statusDescription = `Full Base → Build → Taper → Race progression for your ${lower}.`;
    ctaLabel = "Save race plan";
  } else if (status === "compressed") {
    statusTitle = "Short runway";
    statusDescription =
      "Tropos will compress the plan — fewer hard sessions, a shorter long-run progression.";
    ctaLabel = "Save compressed plan";
  } else {
    statusTitle = "Very tight";
    /* RUN-EV-05 (owner decision 2026-08-09): the below-floor label is
       "mostly-easy plan" — it names what the plan contains. The old
       "finish-safely" label implied a safety promise the product cannot
       make (the internal `finish_safely` state keys are unchanged;
       renaming persisted vocabulary buys no user value). */
    statusDescription = `Too soon for a full ${lower} build. Tropos can create a mostly-easy plan — easy running only, no hard sessions.`;
    ctaLabel = "Save mostly-easy plan";
  }

  return {
    status,
    weeksOut,
    daysOut,
    idealWeeks,
    floorWeeks,
    distanceLabel,
    firstWeekPhase,
    recommendedRunDays,
    doubleDays,
    hardClashDays,
    timeLimitedRuns: plan.weeks.flat().filter((run) => run.timeLimit).length,
    firstWeekMinutes: week0.reduce((total, run) => {
      const template = RUN_TEMPLATES.find(
        (candidate) => candidate.id === run.templateId
      );
      return (
        total +
        (template ? plannedRunMinutes(template, input.easyPaceSPerKm) : 0)
      );
    }, 0),
    recoveryWeeks,
    compressed: plan.compressed,
    belowFloor: plan.belowFloor,
    statusTitle: continued ? "Continue your plan" : statusTitle,
    statusDescription: continued
      ? `Your current ${firstWeekPhase.toLowerCase()} phase continues. Completed runs and one-off changes are kept.`
      : statusDescription,
    ctaLabel,
  };
}

/**
 * A2 — the goal-time feasibility verdict. Pure, display-register only.
 *
 * Compares the VDOT the TARGET implies against the VDOT the runner's
 * benchmark implies. Measurement surface → reads the full fitness (the
 * RUN-EV-08 consent gate applies to prescriptions, not to telling the
 * user where they stand). No promises, no physiology claims: the bands
 * are labelled Tropos heuristics, and no verdict is a guarantee either
 * way. Null when there is no target time or no usable benchmark — the
 * planner then simply says nothing.
 */
export interface RaceTargetVerdict {
  /** Banded on the shared scale in runPaces (`raceTargetBand`). */
  band: RaceTargetBand;
  /** Goal pace, s/km — the target time spread over the distance. */
  goalPaceS: number;
  targetVdot: number;
  currentVdot: number;
  /** One honest sentence for the planner preview. */
  line: string;
}

const DISTANCE_METERS: Record<RaceDistance, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
};

export function raceTargetVerdict(input: {
  distance: RaceDistance;
  targetTimeS: number | undefined;
  runFitness: RunFitnessInput | null | undefined;
  /** Display unit for the goal pace quoted in `line`. The feasibility BAND
   *  is computed from VDOT and is unit-free — a goal does not become more
   *  achievable because it is read in miles. */
  unit: DistanceUnit;
}): RaceTargetVerdict | null {
  const { distance, targetTimeS, runFitness, unit } = input;
  if (!targetTimeS || targetTimeS <= 0) return null;
  const meters = DISTANCE_METERS[distance];
  const targetVdot = vdotFromRace(meters, targetTimeS);
  if (targetVdot <= 0) return null;
  const table = paceTableFromFitness(runFitness ?? null);
  if (!table) return null;
  const currentVdot = table.vdot;
  const goalPaceS = targetTimeS / (meters / 1000);
  const gap = targetVdot - currentVdot;
  const band = raceTargetBand(gap);
  const phrase: Record<RaceTargetBand, string> = {
    on_track: "your recent running already implies this shape",
    within_reach: "within reach of your recent running",
    stretch: "a stretch beyond your recent running",
    long_shot: "well beyond what your recent running implies",
  };
  // A2 feasibility gate: on long_shot the prefill declines to prescribe
  // the goal pace (resolveRaceEnrichment gates on the SAME band scale),
  // so the verdict says so — the one honest line explaining why sessions
  // keep their fitness-derived paces.
  const holdNote =
    band === "long_shot"
      ? " Training paces stay on your current fitness until the gap closes."
      : "";
  const line = `Goal pace ${paceMinSec(Math.round(goalPaceS), unit)}${paceUnitLabel(unit)} · ${phrase[band]} (target fitness ${targetVdot.toFixed(1)} vs current ${currentVdot.toFixed(1)} — a Tropos estimate, not a promise).${holdNote}`;
  return {
    band,
    goalPaceS,
    targetVdot: Math.round(targetVdot * 10) / 10,
    currentVdot,
    line,
  };
}
