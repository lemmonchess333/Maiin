/**
 * Fitting a plan's sessions to the time the person has (Lift4 (5)).
 *
 * Session length is asked on the days step (30, 45, 60 or 75+ minutes) and
 * each session is built to fit it, priced with the app's own estimator
 * (`estimateSessionMinutes`) at the rests the plan suggests. With proper
 * rests 30 minutes holds about six working sets, so a plan built for 30
 * minutes rests less (`suggestedRestSeconds`). Time decides the volume: the
 * role table's sets (`roleTable.ts`) are where a session starts, and what
 * doesn't fit is cut, one set or one exercise at a time, re-priced after
 * each cut, in this order:
 *
 *   1. isolations' sets, down to two each, the largest first and then from
 *      the end of the day;
 *   2. other compounds' sets, down to two, the same way;
 *   3. isolations dropped, one at a time, while the muscle each works
 *      directly (its primary muscle) still gets direct work elsewhere in
 *      the week;
 *   4. main lifts' sets, down to two, the day's first main lift last;
 *   5. other compounds dropped, on the same condition as 3;
 *   6. isolations, then other compounds, dropped, a muscle's last included.
 *
 * Time wins in the end, as the plan promised; a muscle's last direct lift is
 * only kept while something else can give way, so a plan keeps its one calf
 * slot while it can. Credit from other lifts doesn't count as direct work,
 * or a squat's credit to the calves would let every calf raise go. A drop
 * takes the latest lift in the day whose going makes the session fit, or,
 * when none would on its own, the one that frees the most time, so a short
 * session never loses a cheap lift and then the dear one as well.
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
  MAX_SETS_PER_SESSION,
  primaryJudgementForExercise,
} from "./volumeModel";
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

/** Whether a session fits its time, and the 18-set ceiling past which the
 *  last lifts are done tired rather than well. */
export function sessionFits(
  exercises: readonly ProgramExercise[],
  minutes: number
): boolean {
  const sets = exercises.reduce((n, e) => n + (e.sets ?? 0), 0);
  return (
    sets <= MAX_SETS_PER_SESSION &&
    estimateSessionSeconds(exercises, { sessionMinutes: minutes }) <=
      minutes * 60
  );
}

type Kind = "main" | "compound" | "isolation";

/** A slot's place in the cut order. A main slot holding an isolation (a
 *  beginner's swap) is still the day's main lift, and is kept. */
function kindOf(ex: ProgramExercise): Kind {
  if (ex.isAccessory !== true) return "main";
  return exerciseRole(ex) === "isolation" ? "isolation" : "compound";
}

/**
 * Cut one day to its time. `keepsCoverage` says whether the day, without a
 * lift, still gives every muscle the week works directly some direct work;
 * a re-fit of a plan the person already has passes none, so their lifts and
 * history stay and only sets move.
 */
function fitDay(
  day: WorkoutDay,
  minutes: number,
  keepsCoverage?: (without: ProgramExercise[]) => boolean
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
  const dropOne = (kind: Kind, keepLast: boolean): boolean => {
    const without = (i: number) => [
      ...exercises.slice(0, i),
      ...exercises.slice(i + 1),
    ];
    const seconds = (list: ProgramExercise[]) =>
      estimateSessionSeconds(list, { sessionMinutes: minutes });
    const candidates = exercises
      .map((_, i) => i)
      .filter(
        (i) =>
          kindOf(exercises[i]) === kind &&
          (!keepLast || keepsCoverage!(without(i)))
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

  const drops = keepsCoverage !== undefined;
  const steps: Array<() => boolean> = [
    () => cutSet("isolation"),
    () => cutSet("compound"),
    ...(drops ? [() => dropOne("isolation", true)] : []),
    () => cutSet("main"),
    ...(drops
      ? [
          () => dropOne("compound", true),
          () => dropOne("isolation", false),
          () => dropOne("compound", false),
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

/** The muscles a week works directly: each lift's primary muscle. */
function trainedMuscles(days: readonly WorkoutDay[]): Set<string> {
  return new Set(
    days
      .flatMap((d) => d.exercises)
      .map((ex) => primaryJudgementForExercise(ex))
      .filter((m): m is NonNullable<typeof m> => m !== null)
  );
}

/** Fit a new plan's sessions to `minutes`, dropping lifts where sets alone
 *  can't make the time, never a muscle's last. */
export function fitSessionsToTime(
  workouts: WorkoutDay[],
  minutes: number
): WorkoutDay[] {
  const days = [...workouts];
  days.forEach((day, i) => {
    const trained = trainedMuscles(days);
    days[i] = fitDay(day, minutes, (without) => {
      const after = trainedMuscles(
        days.map((d, j) => (j === i ? { ...d, exercises: without } : d))
      );
      return [...trained].every((m) => after.has(m));
    });
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
