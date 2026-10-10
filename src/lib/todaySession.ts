import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";
import type { DayType } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import {
  resolveTrainingDayForDate,
  type LiftSlotStatus,
  type ResolvedLift,
} from "@/lib/trainingResolver";
import { nextLiftAfter, resolveHomeLift } from "@/lib/homeLift";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import type { RestContext } from "@/features/program/restTime";
import { getActivationFraming } from "@/lib/activationFraming";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { runDoseLine } from "@/lib/runDose";
import { planningEasyPaceSPerKm } from "@/lib/runPaces";
import { getExerciseById } from "@/lib/exercises";
import { liftDayLine } from "@/lib/liftDayLabel";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

/**
 * Today's session on Home: which card shows, and what it says.
 *
 * Home worked this out in its own body, about 180 lines across the page,
 * and read "today" five ways while it did: the shared day key, the
 * training-day resolver's own clock, `localDateString()` for a session
 * explainer no card drew, the moment the page mounted, and the week strip's
 * `new Date()`. After midnight they could disagree, and the rules could only
 * be tested by rendering the page. This takes one day and the data, and
 * decides:
 *
 *  - what kind of day the week's schedule makes it;
 *  - on a lifting day, the workout (the programme's next, `homeLift.ts`),
 *    where it opens and its muscle groups;
 *  - on a run day, the planned run, whether it is done, and whether it is a
 *    new person's first;
 *  - on a rest day, what the card offers instead: a new lifter's first
 *    workout, a run for someone who runs freely, a new person's first meal,
 *    or tomorrow's session.
 */
export interface TodaySessionInput {
  /** The day, "yyyy-MM-dd". Every rule here reads this one day. */
  today: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** Which planned runs are done (`useClaimMapForProgram`). */
  claimMap: Map<string, ClaimState>;
  /** The saved lift sessions: each one's id and day. */
  workouts: readonly { id: string; date: string }[];
  /** When the account began, or null until the server has written it. */
  createdAtMs: number | null;
  /** The moment `today` was read: a new account's window ends against it. */
  nowMs: number;
  /** Runs saved over the account's life; null while they are counted. */
  lifetimeRuns: number | null;
  /** Meals logged over the account's life. */
  lifetimeMeals: number;
}

export interface TodayLift {
  /** The workout the card offers, or null when the schedule names a lifting
   *  day the programme has no workout for. */
  workout: WorkoutDay | null;
  /** Its place in the programme, for `?day=N`. */
  index: number | null;
  isStartable: boolean;
  status: LiftSlotStatus;
  /** Up to three muscle groups, "Chest · Shoulders · Triceps". */
  muscleGroups: string;
}

export interface TodayRun {
  /** The planned run, or null on a run day with nothing written yet. */
  runDay: ScheduledRunDay | null;
  completed: boolean;
  /** A new person's first run. */
  isFirst: boolean;
  /** Its dose, as the card states it (`runDoseLine`): "40 min", "15 km",
   *  or "15 km · about 100 min" at a confirmed easy pace. Null with no
   *  planned run. */
  dose: string | null;
}

/** Tomorrow's session, as the rest-day card names it. */
export interface TomorrowSession {
  label: string;
  /** Where it opens in Train. */
  target: string;
}

export type RestDayOffer =
  /** A new lifter's first workout: lifts follow the rotation, not the
   *  weekday (ADR-0002), so it is ready any day. */
  | { kind: "first-workout"; workout: WorkoutDay; index: number }
  /** Free running plans no days, so a free runner's rest day offers a run. */
  | { kind: "free-run" }
  /** A new person with no meal logged yet. */
  | { kind: "first-meal" }
  | { kind: "rest"; tomorrow: TomorrowSession | null };

export interface TodaySession {
  type: DayType;
  /** How a lift session's timer will rest, so its card's minutes price
   *  it: the person's fixed rest, and the length the plan is built for. */
  restContext: RestContext;
  /** Set on a lifting day ("lift" or "both"). */
  lift: TodayLift | null;
  /** Set on a run day ("run" or "both"). */
  run: TodayRun | null;
  /** Set on a rest day. */
  rest: RestDayOffer | null;
}

export function todaySession(input: TodaySessionInput): TodaySession {
  const { today, profile, programState, claimMap, workouts } = input;
  // The resolver is asked with today's week key, as it asks of every caller,
  // so a legacy run day cannot borrow this week's status for next week.
  const currentWeekKey = localWeekKey(parseLocalDate(today));
  const resolved = resolveTrainingDayForDate({
    dateKey: today,
    profile,
    programState,
    currentWeekKey,
    claimMap,
    todayKey: today,
  });
  const type = resolved.scheduleType;
  const lifting = type === "lift" || type === "both";
  const running = type === "run" || type === "both";

  // The workout today's card offers: the programme's next, the one Train
  // starts, on a day the week schedules a lift (homeLift.ts, ADR-0002).
  const homeLift = resolveHomeLift({
    scheduled: resolved.lift,
    programme: programState,
    sessionsToday: new Set(
      workouts.filter((w) => w.date === today).map((w) => w.id)
    ),
  });

  const framingInput = {
    createdAtMs: input.createdAtMs,
    nowMs: input.nowMs,
    todayType: type,
    workoutCount: workouts.length,
    // While the runs are counted, read as having some, so the run card
    // never flashes "Your first run" before the count lands.
    runCount: input.lifetimeRuns ?? 1,
    mealCount: input.lifetimeMeals,
  };
  const framing = getActivationFraming(framingInput);

  return {
    type,
    restContext: {
      fixedRest: profile?.defaultRestSeconds,
      sessionMinutes: programState?.sessionMinutes,
    },
    lift: lifting
      ? {
          workout: homeLift.workout,
          index: homeLift.index,
          isStartable: homeLift.isStartable,
          status: homeLift.status,
          muscleGroups: muscleGroupsOf(homeLift.workout),
        }
      : null,
    run: running
      ? {
          runDay: resolved.run.runDay,
          completed: resolved.run.isCompleted,
          isFirst: framing.firstRun,
          dose: runDose(resolved.run.runDay, profile),
        }
      : null,
    rest:
      type === "rest"
        ? restDayOffer(input, {
            currentWeekKey,
            homeLift,
            // A new person's first workout is ready any day, so a rest day
            // asks the lifting day's question.
            firstWorkout: getActivationFraming({
              ...framingInput,
              todayType: "lift",
            }).firstWorkout,
            firstMeal: framing.firstMeal,
          })
        : null,
  };
}

function restDayOffer(
  input: TodaySessionInput,
  day: {
    currentWeekKey: string;
    homeLift: ResolvedLift;
    firstWorkout: boolean;
    firstMeal: boolean;
  }
): RestDayOffer {
  const { profile, programState } = input;
  // The first workout still leads for someone who also lifts; after it, a
  // free runner's day offers a run. Free running has no planned days, so
  // "Rest day" was wrong for anyone who runs freely, a lifter included.
  if (day.firstWorkout) {
    const index = nextUpIndex(programState);
    const workout = index >= 0 ? programState?.workouts?.[index] : undefined;
    if (workout) return { kind: "first-workout", workout, index };
  }
  if (
    profile?.runMode === "freeform" &&
    (profile.athleteType === "Runner" || profile.athleteType === "Hybrid")
  ) {
    return { kind: "free-run" };
  }
  // A new person has no workout to frame on a rest day, so the card asks
  // for their first meal instead (#972).
  if (day.firstMeal) return { kind: "first-meal" };
  return {
    kind: "rest",
    tomorrow: tomorrowSession(input, day.currentWeekKey, day.homeLift),
  };
}

/**
 * Tomorrow's session, named on the rest-day card, or null when tomorrow is
 * a rest day too. Resolved with TODAY's week key, so a legacy run day
 * cannot borrow this week's status for next week.
 */
function tomorrowSession(
  input: TodaySessionInput,
  currentWeekKey: string,
  homeLift: ResolvedLift
): TomorrowSession | null {
  const { today, profile, programState, claimMap } = input;
  const date = addLocalDays(parseLocalDate(today), 1);
  const dateKey = localDateString(date);
  const next = resolveTrainingDayForDate({
    dateKey,
    profile,
    programState,
    currentWeekKey,
    claimMap,
    todayKey: today,
  });
  // A lift day names the workout that will be next by then, in the
  // programme's order, as today's card does.
  const tomorrowLift = next.lift.workout
    ? (nextLiftAfter(homeLift, programState) ?? {
        index: next.lift.index,
        workout: next.lift.workout,
      })
    : null;
  // Named as the workout and finish screens say it: "Pull · Lat focus".
  const liftName = tomorrowLift
    ? liftDayLine(tomorrowLift.workout.dayName)
    : null;
  const runDay = next.run.runDay;
  /* A run day whose week has no runs written yet is named by its type.
     The plan holds the current week's runs, so on a Sunday, Monday's
     run is written only when the week rolls over. Once a week's runs
     are written, a run day with none on it has had its run moved to
     another date (runs are pinned to dates, ADR-0002), and it names
     nothing. A run with neither date nor week key belongs to the
     current week, as the resolver reads it. */
  const nextWeekKey = localWeekKey(date);
  const nextWeekWritten = (programState?.runDays ?? []).some(
    (rd) =>
      (rd.date
        ? localWeekKey(parseLocalDate(rd.date))
        : (rd.weekKey ?? currentWeekKey)) === nextWeekKey
  );
  const runName = runDay
    ? (RUN_TEMPLATES.find(
        (t) => t.id === (runDay.userOverride ?? runDay.templateId)
      )?.name ?? "Run")
    : (next.scheduleType === "run" || next.scheduleType === "both") &&
        !nextWeekWritten
      ? "Run"
      : null;
  const label =
    liftName && runName ? `${liftName} and ${runName}` : (liftName ?? runName);
  if (!label) return null;
  const target =
    liftName && typeof tomorrowLift?.index === "number"
      ? `/program?day=${tomorrowLift.index}`
      : `/program?tab=run&rday=${dateKey}`;
  return { label, target };
}

/** A planned run's dose at the person's confirmed easy pace (Run21 (5)). */
function runDose(
  runDay: ScheduledRunDay | null,
  profile: UserProfile | null
): string | null {
  const template = runDay
    ? RUN_TEMPLATES.find(
        (t) => t.id === (runDay.userOverride || runDay.templateId)
      )
    : null;
  return template
    ? runDoseLine(template, planningEasyPaceSPerKm(profile?.runFitness))
    : null;
}

/** Up to three of a workout's muscle groups, then "+ more". */
function muscleGroupsOf(workout: WorkoutDay | null): string {
  if (!workout) return "";
  const groups = workout.exercises
    .map((ex) => getExerciseById(ex.exerciseId ?? "")?.category)
    .filter(Boolean);
  const unique = [...new Set(groups)] as string[];
  if (unique.length === 0) return "";
  if (unique.length <= 3) return unique.join(" · ");
  return unique.slice(0, 3).join(" · ") + " + more";
}
