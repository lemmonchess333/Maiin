/**
 * Fitting a plan's sessions to the time the person has (Lift4 (5)).
 *
 * Session length is asked on the days step (30, 45, 60 or 75+ minutes) and
 * each session is built to fit it, priced with the app's own estimator
 * (`estimateSessionMinutes`) at the rests the plan suggests, and with each
 * loaded lift's warm-up as it will be once the lift is established. With
 * proper rests 30 minutes holds about six working sets, so a plan built for
 * 30 minutes rests less (`suggestedRestSeconds`). Time decides the volume: the
 * role table's sets (`roleTable.ts`) are where a session starts, and what
 * doesn't fit is cut, one set or one exercise at a time, re-priced after
 * each cut, in this order:
 *
 *   1. isolations' sets, down to two each, the largest first and then from
 *      the end of the day;
 *   2. other compounds' sets, down to two, the same way;
 *   3. isolations dropped, one at a time: first those whose muscles are
 *      still worked on two days a week (`weeklyFrequency.ts`), then the
 *      lifts added for the two days, then those whose muscles still get
 *      some direct work (their primary muscle's) in the week;
 *   4. main lifts' sets, down to two, the day's first main lift last;
 *   5. other compounds dropped, on 3's first and last conditions;
 *   6. isolations, then other compounds, dropped, a muscle's last included.
 *
 * Time wins in the end, as the plan promised; a muscle's last direct lift is
 * only kept while something else can give way, so a plan keeps its one calf
 * slot while it can. A small muscle's second day gives way before a main
 * lift's sets do, so a short session never trades its main lifts for a
 * second day of lateral raises; a lift whose muscles are worked on two other
 * days goes before one that is a muscle's second. Credit from other lifts
 * counts toward the two days, as the volume model counts it, but not as
 * direct work, or a leg curl's credit to the calves would let every calf
 * raise go. A drop takes the latest lift in the day whose going makes the
 * session fit, or, when none would on its own, the one that frees the most
 * time, so a short session never loses a cheap lift and then the dear one
 * as well.
 *
 * A main lift is never dropped and keeps at least two sets. A day that still
 * runs over keeps what is left; the estimate on its card says so. Sets are
 * cut before exercises so a short session keeps its calf, side-delt and ab
 * work while it can: a big muscle gets sets from several lifts, a small one
 * from its one. A main lift's third set goes before the day's other
 * compounds do, since those are often its only pull or hinge.
 */
import { estimateSessionSeconds } from "./expressSession";
import { exerciseRole } from "./exerciseRole";
import { isLiftTimeBudget } from "./liftTimeBudget";
import { roleRepsFor } from "./roleTable";
import {
  startingWeightForExercise,
  type StartingLoadContext,
} from "./startingLoads";
import {
  MAX_SETS_PER_SESSION,
  primaryJudgementForExercise,
} from "./volumeModel";
import { daysPerMuscle, WEEKLY_FREQUENCY } from "./weeklyFrequency";
import type {
  Experience,
  PrimaryGoal,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";

/** The lengths the days step offers; 75 reads "75+". */
export const SESSION_MINUTES_OPTIONS = [30, 45, 60, 75] as const;

/** Where the defaults centre (Lift4 (4)): an unanswered session length. */
const DEFAULT_SESSION_MINUTES = 60;

/** The fewest sets a fitted lift keeps. */
const MIN_FITTED_SETS = 2;

/** The session length a plan is built for: the person's answer
 *  (`profile.liftTimeBudgetMinutes`), or an hour. */
export function sessionMinutesFor(answer: unknown): number {
  return isLiftTimeBudget(answer) ? answer : DEFAULT_SESSION_MINUTES;
}

/** The days step's option for a stored answer: the longest offered that
 *  is no longer than it, so an older 90 or 120 reads "75+". */
export function sessionLengthOption(
  answer: unknown
): (typeof SESSION_MINUTES_OPTIONS)[number] {
  const minutes = sessionMinutesFor(answer);
  return [...SESSION_MINUTES_OPTIONS].reverse().find((n) => n <= minutes) ?? 30;
}

/**
 * Who a lift's warm-up is priced for: an 80 kg intermediate, whose starting
 * loads stand for a lift once it is established. A lift started at the bar
 * has no warm-up on day one and three or four sets of one a few weeks later,
 * and the plan has to fit those weeks too, so each loaded lift is priced at
 * the heavier of its load and that estimate (`warmupRamp` saturates: a
 * barbell squat's ramp is four sets at 60 kg and at 160).
 */
const ESTABLISHED: StartingLoadContext = {
  bodyweightKg: 80,
  experience: "intermediate",
};

/** A session's seconds as the plan prices it. */
function plannedSeconds(
  exercises: readonly ProgramExercise[],
  minutes: number
): number {
  return estimateSessionSeconds(
    exercises.map((ex) =>
      ex.weight > 0
        ? {
            ...ex,
            weight: Math.max(
              ex.weight,
              startingWeightForExercise(
                ex.exerciseId,
                ex.movementCategory,
                ESTABLISHED,
                ex.isAccessory === true,
                undefined,
                ex.repUnit
              )
            ),
          }
        : ex
    ),
    { sessionMinutes: minutes }
  );
}

/** Whether a session fits its time, and the 18-set ceiling past which the
 *  last lifts are done tired rather than well. */
export function sessionFits(
  exercises: readonly ProgramExercise[],
  minutes: number
): boolean {
  const sets = exercises.reduce((n, e) => n + (e.sets ?? 0), 0);
  return (
    sets <= MAX_SETS_PER_SESSION &&
    plannedSeconds(exercises, minutes) <= minutes * 60
  );
}

type Kind = "main" | "compound" | "isolation";

/** A slot's place in the cut order. A main slot holding an isolation (a
 *  beginner's swap) is still the day's main lift, and is kept. */
function kindOf(ex: ProgramExercise): Kind {
  if (ex.isAccessory !== true) return "main";
  return exerciseRole(ex) === "isolation" ? "isolation" : "compound";
}

/** What a drop must leave the week: each muscle's days (`weeklyFrequency`),
 *  its direct work, or nothing; or, for "extra", the lift must be one added
 *  for the two days. */
type Keeps = "frequency" | "extra" | "coverage" | "nothing";

/** Whether a drop leaves the week what `rule` asks: `dropped` is the lift,
 *  `without` the day after it. */
type WeekGuard = (
  dropped: ProgramExercise,
  without: ProgramExercise[],
  rule: Keeps
) => boolean;

/**
 * Cut one day to its time. `guard` says whether the day, without a lift,
 * still keeps what a drop at that step must; a re-fit of a plan the person
 * already has passes none, so their lifts and history stay and only sets
 * move.
 */
function fitDay(
  day: WorkoutDay,
  minutes: number,
  guard?: WeekGuard
): WorkoutDay {
  let exercises = day.exercises.map((e) => ({ ...e }));
  const fits = () => sessionFits(exercises, minutes);

  const cutSet = (kind: Kind): boolean => {
    const pick = exercises
      .map((ex, i) => ({ ex, i }))
      .filter(({ ex }) => kindOf(ex) === kind && ex.sets > MIN_FITTED_SETS)
      .sort((a, b) =>
        kind === "main" ? b.i - a.i : b.ex.sets - a.ex.sets || b.i - a.i
      )[0];
    if (!pick) return false;
    pick.ex.sets -= 1;
    return true;
  };
  const dropOne = (kind: Kind, keeps: Keeps): boolean => {
    const without = (i: number) => [
      ...exercises.slice(0, i),
      ...exercises.slice(i + 1),
    ];
    const seconds = (list: ProgramExercise[]) => plannedSeconds(list, minutes);
    const candidates = exercises
      .map((_, i) => i)
      .filter(
        (i) =>
          (keeps === "extra" || kindOf(exercises[i]) === kind) &&
          guard!(exercises[i], without(i), keeps)
      );
    if (candidates.length === 0) return false;
    const fitting = candidates.filter((i) => sessionFits(without(i), minutes));
    const pick =
      fitting.length > 0
        ? fitting[fitting.length - 1]
        : candidates.reduce((best, i) =>
            seconds(without(i)) <= seconds(without(best)) ? i : best
          );
    exercises = without(pick);
    return true;
  };

  const steps: Array<() => boolean> = [
    () => cutSet("isolation"),
    () => cutSet("compound"),
    ...(guard
      ? [
          () => dropOne("isolation", "frequency"),
          () => dropOne("isolation", "extra"),
          () => dropOne("isolation", "coverage"),
        ]
      : []),
    () => cutSet("main"),
    ...(guard
      ? [
          () => dropOne("compound", "frequency"),
          () => dropOne("compound", "coverage"),
          () => dropOne("isolation", "nothing"),
          () => dropOne("compound", "nothing"),
        ]
      : []),
  ];
  for (const step of steps) {
    while (!fits() && step()) {
      /* cut until it fits or this step has nothing left */
    }
    if (fits()) break;
  }
  return { ...day, exercises };
}

/** The muscles a week works directly: each lift's primary muscle, the
 *  lifts added for the two days a week (`extras`) aside. */
function trainedMuscles(
  days: readonly WorkoutDay[],
  extras: ReadonlySet<string>
): Set<string> {
  return new Set(
    days
      .flatMap((d) => d.exercises)
      .filter((ex) => !ex.instanceId || !extras.has(ex.instanceId))
      .map((ex) => primaryJudgementForExercise(ex))
      .filter((m): m is NonNullable<typeof m> => m !== null)
  );
}

/**
 * Fit a new plan's sessions to `minutes`, dropping lifts where sets alone
 * can't make the time: first those whose muscles keep their two days a
 * week, then the lifts added for the two days (`extras`, from
 * `weeklyFrequency.ts`), then those whose muscles keep some direct work,
 * then any. An added lift is never what keeps a muscle's direct work, so a
 * day can't drop its own ab work for one added to a day that has yet to fit.
 */
export function fitSessionsToTime(
  workouts: WorkoutDay[],
  minutes: number,
  extras: ReadonlySet<string> = new Set()
): WorkoutDay[] {
  const days = [...workouts];
  const isExtra = (ex: ProgramExercise) =>
    ex.instanceId !== undefined && extras.has(ex.instanceId);
  const fitOne = (i: number): WorkoutDay => {
    const trained = trainedMuscles(days, extras);
    const frequency = daysPerMuscle(days);
    return fitDay(days[i], minutes, (dropped, without, keeps) => {
      if (keeps === "nothing") return true;
      if (keeps === "extra") return isExtra(dropped);
      const week = days.map((d, j) =>
        j === i ? { ...d, exercises: without } : d
      );
      const after = trainedMuscles(week, extras);
      if (![...trained].every((m) => after.has(m))) return false;
      if (keeps === "coverage") return true;
      const afterDays = daysPerMuscle(week);
      return [...frequency].every(
        ([m, n]) => (afterDays.get(m) ?? 0) >= Math.min(n, WEEKLY_FREQUENCY)
      );
    });
  };
  days.forEach((_, i) => {
    // A day that loses an added lift is fitted again without it, so no set
    // stays cut to make room for a lift that went anyway.
    for (;;) {
      const fitted = fitOne(i);
      const left = new Set(fitted.exercises.map((ex) => ex.instanceId));
      const gone = days[i].exercises.filter(
        (ex) => isExtra(ex) && !left.has(ex.instanceId)
      );
      if (gone.length === 0) {
        days[i] = fitted;
        break;
      }
      days[i] = {
        ...days[i],
        exercises: days[i].exercises.filter((ex) => !gone.includes(ex)),
      };
    }
  });
  return days;
}

/**
 * Re-fit a plan the person has to a new session length: each lift's sets go
 * back to its role's (timed holds keep theirs) and are cut to the time, and
 * nothing is dropped, so a longer session later gives the sets back. Reps,
 * weights, history and progress stay.
 */
export function refitSessionsToTime(
  workouts: WorkoutDay[],
  goal: PrimaryGoal | undefined,
  experience: Experience | undefined,
  minutes: number
): WorkoutDay[] {
  return workouts.map((day) => {
    const reset = {
      ...day,
      exercises: day.exercises.map((ex) => {
        if (ex.repUnit === "seconds") return ex;
        const sets = roleRepsFor(goal, ex, experience).sets;
        return { ...ex, sets, baseSets: sets };
      }),
    };
    const fitted = fitDay(reset, minutes);
    return {
      ...fitted,
      exercises: fitted.exercises.map((ex) => ({ ...ex, baseSets: ex.sets })),
    };
  });
}
