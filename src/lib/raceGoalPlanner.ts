import type { RunningBaseline } from "@/features/program/runningBaseline";
import {
  plannedRunMinutes,
  type RunTimeLimits,
} from "@/features/program/runTimeLimits";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  newRunnerLongestRunMinutes,
  runWalkTemplateIdForWeek,
} from "@/features/program/newRunner";
import {
  continuingRacePlan,
  continuedBlockWeeks,
  raceWeekFromToday,
} from "@/features/program/racePlanContinuation";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";
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
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "./dateHelpers";
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
import { formatDuration } from "@/utils/formatters";
import {
  distanceIn,
  distanceUnitLabel,
  paceUnitLabel,
  type DistanceUnit,
} from "./distanceUnits";

export type RaceDistance = "5k" | "10k" | "half" | "marathon";

const DISTANCE_METERS: Record<RaceDistance, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
};

/** Pgm7 A7: a race plan needs at least two run days a week. A plan that
 *  already has fewer keeps them (Pgm5: no silent rebuild); a new one starts
 *  at two. */
export const MIN_RACE_RUN_DAYS = 2;
/** Pgm7 A7: a marathon's setup recommends three. */
export const MARATHON_RUN_DAYS = 3;

/**
 * The line under a race plan's run-days control, or null when the count
 * suits the race. Fewer days are offered more days, a shorter race or a
 * later date (A7).
 */
export function raceRunDaysNote(
  distance: RaceDistance,
  runDays: number
): string | null {
  if (runDays < MIN_RACE_RUN_DAYS)
    return "A race plan needs at least two runs a week. Add a day when you can.";
  if (distance === "marathon" && runDays < MARATHON_RUN_DAYS)
    return "A marathon plan works best on three runs a week. Add a day, or choose a half marathon or a later date.";
  return null;
}

/**
 * Pgm8 (R14c): the pace a new runner's race is timed at, seconds per km.
 * 7:00 /km is the middle of the 30 to 40 minutes a first 5K usually takes
 * (running-evidence §6.5 A). A Tropos heuristic. The templates' own minutes
 * assume about 5:36 /km, a pace for runners in general (`runDose.ts` says
 * why a slower runner can't be told them), so a new runner's race isn't
 * timed from them. One pace for every distance times the longer races a
 * little short, so the note below errs towards saying nothing.
 */
const NEW_RUNNER_RACE_PACE_S_PER_KM = 420;

/** A race's name inside a sentence, as the Realign toast has them. */
const RACE_IN_A_SENTENCE: Record<RaceDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "half marathon",
  marathon: "marathon",
};

/** A span of minutes to the nearest five: "35 min", "2 h", "2 h 30 min". */
function aboutTime(minutes: number): string {
  return formatDuration(Math.round(minutes / 5) * 5 * 60);
}

/**
 * Pgm8 (R14c): the line under a race date when someone new to running has
 * picked a race their plan can't build to, or null. Can't build to is a
 * Tropos heuristic: the race would take them more than twice the longest
 * run the plan reaches before race week. That run is the build's, the most
 * a new runner's run can be (`newRunnerLongestRunMinutes`): it only rises,
 * so the week before race week holds it, or this week when the race is
 * this week and no week comes before it. Each of the plan's runs is the
 * longest of its kind within it, and a taper week's sit below it. The race
 * is timed at `NEW_RUNNER_RACE_PACE_S_PER_KM`. The line suggests
 * run-walking the race or a later date. It never holds up the plan.
 *
 * Null for anyone who isn't new to running (`newRunnerUntil` null), and
 * without a race date of today or later.
 */
export function newRunnerRaceNote(input: {
  distance: RaceDistance;
  /** Local "YYYY-MM-DD"; "" when no date chosen yet. */
  targetDate: string;
  /** Local "YYYY-MM-DD", today. */
  currentDate: string;
  /** The day a new runner's first weeks end (`newRunnerUntil`). */
  newRunnerUntil?: string | null;
}): string | null {
  const { distance, targetDate, currentDate } = input;
  const until = input.newRunnerUntil;
  if (!until || !targetDate || targetDate < currentDate) return null;
  const raceWeek = localWeekKey(parseLocalDate(targetDate));
  const weekBefore = localDateString(
    addLocalDays(parseLocalDate(raceWeek), -7)
  );
  const thisWeek = localWeekKey(parseLocalDate(currentDate));
  const week = weekBefore > thisWeek ? weekBefore : thisWeek;
  const longestRun = newRunnerLongestRunMinutes(week, until) ?? 0;
  const raceMinutes =
    (DISTANCE_METERS[distance] / 1000) * (NEW_RUNNER_RACE_PACE_S_PER_KM / 60);
  if (raceMinutes <= 2 * longestRun) return null;
  const plan = runWalkTemplateIdForWeek(week, until)
    ? "Your plan is still run-walk by then"
    : `Your plan builds to about ${aboutTime(longestRun)} of running by then`;
  return `${plan}, and a ${RACE_IN_A_SENTENCE[distance]} takes about ${aboutTime(raceMinutes)}. You can run-walk it, or choose a later date.`;
}

/** A run's minutes at the pace the plan plans with. */
function runMinutesOf(run: ScheduledRunDay, easyPaceSPerKm?: number | null) {
  const template = RUN_TEMPLATES.find((t) => t.id === run.templateId);
  return template ? plannedRunMinutes(template, easyPaceSPerKm) : 0;
}

/** The longest run a plan's weeks build to before race week, and how it
 *  reads: a long run by its distance, an easy run by its minutes. */
function longestBeforeRace(
  weeks: readonly ScheduledRunDay[][],
  easyPaceSPerKm: number | null | undefined,
  unit: DistanceUnit
): { minutes: number; reads: string } | null {
  let longest: ScheduledRunDay | null = null;
  for (const week of weeks.slice(0, -1))
    for (const run of week)
      if (
        run.type !== "race" &&
        (!longest ||
          runMinutesOf(run, easyPaceSPerKm) >
            runMinutesOf(longest, easyPaceSPerKm))
      )
        longest = run;
  if (!longest) return null;
  const template = RUN_TEMPLATES.find((t) => t.id === longest.templateId);
  const km = template?.type === "long" ? template.config?.targetDistanceKm : 0;
  const minutes = runMinutesOf(longest, easyPaceSPerKm);
  return {
    minutes,
    reads: km
      ? `${Math.round(distanceIn(km * 1000, unit))} ${distanceUnitLabel(unit)}`
      : `${Math.round(minutes)} min`,
  };
}

/**
 * C: whether a plan built from the person's running starting point can climb
 * to the long run the race's own plan reaches in the weeks left. The plan
 * from the starting point (`weeks`) against the same plan without one
 * (`raceWeeks`): each one's longest run before race week. The starting point
 * climbs a rung a week (`runningClimb`), so from a short longest run a race
 * not far off arrives before the long run has climbed to the race's. Null
 * when it gets there, or there is no starting point to climb from.
 */
export function runwayFromStart(
  weeks: readonly ScheduledRunDay[][],
  raceWeeks: () => readonly ScheduledRunDay[][],
  easyPaceSPerKm: number | null | undefined,
  unit: DistanceUnit
): { reaches: string; raceNeeds: string } | null {
  const reaches = longestBeforeRace(weeks, easyPaceSPerKm, unit);
  if (!reaches) return null;
  const needs = longestBeforeRace(raceWeeks(), easyPaceSPerKm, unit);
  if (!needs || reaches.minutes >= needs.minutes) return null;
  return { reaches: reaches.reads, raceNeeds: needs.reads };
}

/**
 * Five states, not four. `below-floor` (finish-safely) is DISTINCT from
 * `compressed`: below the taper-safe floor, compress-to-keep-date stops being
 * the safe default and the plan becomes mostly-easy "finish safely". `empty`
 * and `invalid` are UI-only states the engine never sees.
 */
export type RacePlannerStatus =
  "empty" | "invalid" | "healthy" | "compressed" | "below-floor";

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
  /** Run20 (5): as the save passes it (`PlanBuilderInput.newRunnerUntil`),
   *  so the preview shows the weeks the save writes. */
  newRunnerUntil?: string | null;
  weekSchedule?: ScheduleDay[];
  /** The unit the runway line gives distances in; km when omitted. */
  distanceUnit?: DistanceUnit;
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
  /** The first week runs as run-walk: a new runner's first weeks (Run20
   *  (5)), which no fit shortens. */
  runWalkWeeks: boolean;
  /** Pgm8 (R14c): for a new runner whose plan can't build to the race, the
   *  line that says so (`newRunnerRaceNote`); null otherwise. */
  newRunnerNote: string | null;
  /** The plan can't build from the running starting point to the long run
   *  the race's plan reaches in the weeks left (`runwayFromStart`): the
   *  longest run each builds to before race week. Null when it can. */
  shortOfRace: { reaches: string; raceNeeds: string } | null;
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
    runWalkWeeks: false,
    newRunnerNote: null,
    shortOfRace: null,
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
  const continued = continuingRacePlan(input.existingState?.runPlan, {
    distance,
    targetDate,
  });
  const generateFrom = (
    from: { currentDate: string; weekStart: string },
    runningBaseline: RunningBaseline | null | undefined
  ) =>
    generateRacePlanV2({
      // Settings preview the same returning-runner guard used by the save.
      // Calendar-only callers deliberately retain the no-history fallback.
      recentLayoff: input.recentLayoff ?? "none",
      weekSchedule,
      raceGoal: { distance, targetDate },
      weeklyRunDays,
      currentDate: from.currentDate,
      weekStart: from.weekStart,
      tuning: input.tuning,
      runningBaseline,
      runTimeLimits: input.runTimeLimits,
      easyPaceSPerKm: input.easyPaceSPerKm,
      newRunnerUntil: input.newRunnerUntil,
      planTotalWeeks: continued?.totalWeeks,
      leadInWeek: continued?.leadInWeek,
    });
  // The week the save plans (Run19): from today, over a continuing plan's
  // kept days, or next week's runs when none of this week's run days is
  // left (`raceWeekFromToday`).
  const {
    plan,
    runDays: firstWeek,
    weekStart,
  } = raceWeekFromToday(
    (from) => generateFrom(from, input.runningBaseline),
    { currentDate, weekStart: localWeekKey(now) },
    currentDate,
    continued
      ? {
          runDays: input.existingState?.runDays ?? [],
          manualCompletions: input.existingState?.manualCompletions,
        }
      : undefined
  );
  // The plan's weekly shape, before today's cut: what a week of it holds.
  // A lead-in holds the days left only, so the shape is the first week's.
  const shapeWeek = plan.weeks[plan.leadInWeek ? 1 : 0] ?? [];
  // C: whether the long run can climb from the starting point to what the
  // race's own plan reaches in the weeks left.
  const shortOfRace = runwayFromStart(
    plan.weeks,
    () =>
      generateFrom(
        {
          // As the plan was made: from today, or from next week's Monday
          // when none of this week's run days is left.
          currentDate:
            weekStart === localWeekKey(now) ? currentDate : weekStart,
          weekStart,
        },
        null
      ).weeks,
    input.easyPaceSPerKm,
    input.distanceUnit ?? "km"
  );
  if (plan.weeks[0]) plan.weeks[0] = firstWeek;

  // Status straight from the engine's own booleans (belowFloor ⊂ compressed).
  const status: RacePlannerStatus = plan.belowFloor
    ? "below-floor"
    : plan.compressed
      ? "compressed"
      : "healthy";

  const inThisWeek = (run: ScheduledRunDay) =>
    run.date
      ? localWeekKey(parseLocalDate(run.date)) === weekStart
      : !run.weekKey || run.weekKey === weekStart;
  // What is saved for the plan's first week (`raceWeekFromToday`), and a
  // week's shape: a plan made on a Thursday still runs three days a week.
  const week0 = (plan.weeks[0] ?? []).filter(inThisWeek);
  const shape = shapeWeek.filter(inThisWeek);
  const recommendedRunDays = shape.length || weeklyRunDays;
  const hardClashDays = shape.filter((rd) => rd.clashesWithLift).length;
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
  // C: the weeks are only half of the runway; the other half is where the
  // long run starts from.
  const shortLine = shortOfRace
    ? `Starting from your running now, the long run builds to about ${shortOfRace.reaches} before race week, where a ${RACE_IN_A_SENTENCE[distance]} plan with these weeks builds to ${shortOfRace.raceNeeds}. A later race or a shorter one gives it time.`
    : null;
  if (status === "healthy") {
    statusTitle = shortLine ? "Short runway for your running" : "Good runway";
    statusDescription =
      shortLine ??
      `Full Base → Build → Taper → Race progression for your ${lower}.`;
    ctaLabel = "Save race plan";
  } else if (status === "compressed") {
    statusTitle = "Short runway";
    statusDescription = `Tropos will compress the plan — fewer quality sessions, and the long runs build in fewer weeks, with bigger jumps between them.${shortLine ? ` ${shortLine}` : ""}`;
    ctaLabel = "Save compressed plan";
  } else {
    statusTitle = "Very tight";
    /* RUN-EV-05 (owner decision 2026-08-09): the below-floor label is
       "mostly-easy plan" — it names what the plan contains. The old
       "finish-safely" label implied a safety promise the product cannot
       make (the internal `finish_safely` state keys are unchanged;
       renaming persisted vocabulary buys no user value). */
    statusDescription = `Too soon for a full ${lower} build. Tropos can create a mostly-easy plan — easy running only, no quality sessions.`;
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
    // From the six weeks, not this week's runs: a week can have none left.
    runWalkWeeks:
      runWalkTemplateIdForWeek(weekStart, input.newRunnerUntil) !== null,
    newRunnerNote: newRunnerRaceNote(input),
    shortOfRace,
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
  const line = `Goal pace ${paceMinSec(Math.round(goalPaceS), unit)} ${paceUnitLabel(unit)} · ${phrase[band]} (target fitness ${targetVdot.toFixed(1)} vs current ${currentVdot.toFixed(1)} — a Tropos estimate, not a promise).${holdNote}`;
  return {
    band,
    goalPaceS,
    targetVdot: Math.round(targetVdot * 10) / 10,
    currentVdot,
    line,
  };
}
