/**
 * A plan's sessions and the time the person has (Lift4 (5), Lift21).
 *
 * Session length is asked on the days step (30, 45, 60 or 75+ minutes) and
 * each session is priced with the app's own estimator
 * (`estimateSessionMinutes`) at the rests the plan suggests, with each
 * loaded lift's warm-up as it will be once the lift is established. With
 * proper rests 30 minutes holds about six working sets, so a plan built for
 * 30 minutes rests less (`suggestedRestSeconds`).
 *
 * A new plan is SIZED to its time (`sizeSessionsToTime`, Lift21): time sets
 * how many lifts a day holds, and every lift it holds keeps its sets. A day
 * that does not fit gives lifts up from the end of its order, and time left
 * over goes back to the lifts it keeps.
 *
 * A plan the person already has is RE-FITTED (`refitSessionsToTime`), when
 * they change the length or a day outgrows it: its lifts and their history
 * stay, and only sets move, each lift from its place's sets down to two, in
 * this order, re-priced after each cut:
 *
 *   1. isolations' sets, the largest first and then from the end of the day;
 *   2. other compounds' sets, the same way;
 *   3. main lifts' sets, the day's first main lift last.
 *
 * A day that still runs over keeps what is left; the estimate on its card
 * says so.
 */
import { estimateSessionSeconds } from "./expressSession";
import { exerciseRole } from "./exerciseRole";
import { toExperience } from "./experienceModel";
import { isLiftTimeBudget } from "./liftTimeBudget";
import { isFloorDeadlift } from "./roleTable";
import {
  startingWeightForExercise,
  type StartingLoadContext,
} from "./startingLoads";
import { MAX_SETS_PER_SESSION } from "./volumeModel";
import type { Experience, ProgramExercise, WorkoutDay } from "./programTypes";

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
 * barbell squat's ramp is four sets at 60 kg and at 160). A lift loaded past
 * the estimate gains warm-up sets the fit never priced; a day they take over
 * its length is re-fitted when the week moves on (Lift7,
 * `warmupsOutgrewFit`).
 */
const ESTABLISHED: StartingLoadContext = {
  bodyweightKg: 80,
  experience: "intermediate",
};

/** The established lifter's load for a lift (`ESTABLISHED`). */
function establishedLoad(ex: ProgramExercise): number {
  return startingWeightForExercise(
    ex.exerciseId,
    ex.movementCategory,
    ESTABLISHED,
    ex.isAccessory === true,
    undefined,
    ex.repUnit
  );
}

/** Given a loaded lift and the weight the fit prices its warm-up at, the
 *  weight to price it at instead. */
export type WarmupPricing = (ex: ProgramExercise, priced: number) => number;

let warmupPricing: WarmupPricing | null = null;

/**
 * A measurement seam, which the app never sets: the training simulator
 * prices warm-ups another way to compare it with this one (decisions.md
 * L5, F8). Returns the function that puts the fit's own pricing back.
 *
 * @oracle — test-only by design, permanently: the simulator's measuring
 * suite is its one caller. The app always prices with the fit's own.
 */
export function setWarmupPricing(pricing: WarmupPricing | null): () => void {
  const previous = warmupPricing;
  warmupPricing = pricing;
  return () => {
    warmupPricing = previous;
  };
}

/** The weight the fit prices a loaded lift's warm-up at: the heavier of its
 *  load and the established lifter's, or what a measurement's pricing makes
 *  of that (`setWarmupPricing`). */
function pricedWarmupLoad(ex: ProgramExercise): number {
  const priced = Math.max(ex.weight, establishedLoad(ex));
  return warmupPricing ? warmupPricing(ex, priced) : priced;
}

/** A session's seconds as the plan prices it: each loaded lift's warm-up at
 *  `pricedWarmupLoad`, or at the load `warmupLoad` gives. */
function plannedSeconds(
  exercises: readonly ProgramExercise[],
  minutes: number,
  warmupLoad: (ex: ProgramExercise) => number = pricedWarmupLoad
): number {
  return estimateSessionSeconds(
    exercises.map((ex) =>
      ex.weight > 0 ? { ...ex, weight: warmupLoad(ex) } : ex
    ),
    { sessionMinutes: minutes }
  );
}

/**
 * How far past its length a session may price and still fit (Lift21). The
 * estimator's constants have not been checked against saved sessions, and
 * held to the second a 45-minute day could not take a fourth lift.
 */
export const FIT_TOLERANCE = 0.05;

/** The most sets a session holds: 18, past which the last lifts are done
 *  tired rather than well, and 21 from 75 minutes. */
export function maxSessionSets(minutes: number): number {
  return minutes >= 75 ? MAX_SETS_PER_SESSION + 3 : MAX_SETS_PER_SESSION;
}

/** Whether a session fits its time so priced, within the tolerance, and
 *  the set ceiling. */
function fitsPriced(
  exercises: readonly ProgramExercise[],
  minutes: number,
  warmupLoad?: (ex: ProgramExercise) => number
): boolean {
  const sets = exercises.reduce((n, e) => n + (e.sets ?? 0), 0);
  return (
    sets <= maxSessionSets(minutes) &&
    plannedSeconds(exercises, minutes, warmupLoad) <=
      minutes * 60 * (1 + FIT_TOLERANCE)
  );
}

/** Whether a session fits its time, and the 18-set ceiling past which the
 *  last lifts are done tired rather than well. */
export function sessionFits(
  exercises: readonly ProgramExercise[],
  minutes: number
): boolean {
  return fitsPriced(exercises, minutes);
}

/**
 * Whether a session has come to run over its length because its lifts'
 * warm-ups grew with their weights (Lift7): it no longer fits, and it would
 * with each loaded lift's warm-up priced as the plan prices a new lift's, at
 * the established lifter's load. A session over for any other reason, lifts
 * the person added or a short one the fit could not bring inside its length,
 * is over at that price too.
 */
export function warmupsOutgrewFit(
  exercises: readonly ProgramExercise[],
  minutes: number
): boolean {
  return (
    !sessionFits(exercises, minutes) &&
    fitsPriced(exercises, minutes, establishedLoad)
  );
}

type Kind = "main" | "compound" | "isolation";

/** A slot's place in the cut order. A main slot holding an isolation (a
 *  beginner's swap) is still the day's main lift, and is cut last. */
function kindOf(ex: ProgramExercise): Kind {
  if (ex.isAccessory !== true) return "main";
  return exerciseRole(ex) === "isolation" ? "isolation" : "compound";
}

/**
 * Cut one day's sets to its time, in the header's order. No lift goes: the
 * plan is the person's, and their lifts and history stay.
 */
function fitDay(day: WorkoutDay, minutes: number): WorkoutDay {
  const exercises = day.exercises.map((e) => ({ ...e }));
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

  for (const kind of ["isolation", "compound", "main"] as const) {
    while (!fits() && cutSet(kind)) {
      /* cut until it fits or this kind has nothing left */
    }
    if (fits()) break;
  }
  return { ...day, exercises };
}

/** The fewest lifts a sized day keeps, and a 30-minute day's. */
const MIN_SIZED_LIFTS = 3;
const MIN_SHORT_LIFTS = 2;

/** A 30-minute day: its supporting lifts take two sets, and it may hold two
 *  lifts. */
const SHORT_SESSION_MINUTES = 30;

/** The ranks of the pieces a day must hold (a builder slot's `rank`): its
 *  main lift and the three after it. */
const MUST_HOLD_RANKS = 4;

/** The share of its length under which a day counts as short, and takes
 *  back any lift that fits. */
const FILLED_SHARE = 0.85;

const PUSH_PATTERNS: ReadonlySet<string> = new Set([
  "horizontal_push",
  "vertical_push",
]);
const PULL_PATTERNS: ReadonlySet<string> = new Set([
  "horizontal_pull",
  "vertical_pull",
]);

/**
 * The sets a day's lifts take by their place in it, for a session length
 * and a level (Lift21), and the sets time left over gives back:
 *
 *   - the day's first main lift takes 4 sets from 60 minutes and 3 under; a
 *     second main lift (a full-body day's press, a beginner's second
 *     deadlift) 3; every other lift 3. A beginner's other lifts take 2, and
 *     so do a 30-minute day's, the one place a lift past beginner sits
 *     under 3;
 *   - a day's first pull takes its first press's sets, so a day that
 *     presses and pulls does as much of one as the other;
 *   - time left goes to the lifts the day has, first to last, a set at a
 *     time, to 4 (3 for a beginner and in a 30-minute day) and no deeper
 *     than the day's main lift, inside the day's length and its set
 *     ceiling.
 *
 * A floor deadlift keeps its row's 3 sets at most. Timed holds keep their
 * sets.
 */
function setsByPlace(minutes: number, experience: Experience | undefined) {
  const beginner = toExperience(experience) === "beginner";
  const short = minutes <= SHORT_SESSION_MINUTES;
  const mainSets = beginner || short ? 3 : minutes >= 60 ? 4 : 3;
  const otherSets = beginner || short ? 2 : 3;
  const deepest = beginner || short ? 3 : 4;
  const timed = (ex: ProgramExercise) => ex.repUnit === "seconds";
  const capFor = (ex: ProgramExercise) =>
    isFloorDeadlift(ex.exerciseId) ? Math.min(3, deepest) : deepest;
  return {
    /** The day's lifts, each a copy at its place's sets. */
    place(exercises: readonly ProgramExercise[]): ProgramExercise[] {
      const mainIndex = exercises.findIndex((ex) => ex.isAccessory !== true);
      const placed = exercises.map((ex, i) => {
        if (timed(ex)) return { ...ex };
        const sets =
          i === mainIndex ? mainSets : ex.isAccessory !== true ? 3 : otherSets;
        return { ...ex, sets: Math.min(sets, capFor(ex)) };
      });
      // A day's first pull takes its first press's sets (D-LIFT-3: pulling
      // keeps up with pressing, for the shoulders). Nothing adds a pulling
      // set to a week afterwards.
      const press = placed.find((ex) => PUSH_PATTERNS.has(ex.movementCategory));
      const pull = placed.find((ex) => PULL_PATTERNS.has(ex.movementCategory));
      if (press && pull && !timed(pull))
        pull.sets = Math.min(Math.max(pull.sets, press.sets), capFor(pull));
      return placed;
    },
    /** Gives time left back as sets, in place. */
    deepen(exercises: ProgramExercise[]): void {
      if (!Number.isFinite(minutes)) return;
      const total = () => exercises.reduce((n, e) => n + e.sets, 0);
      // No lift goes deeper than the day's main lift, so a day never reads
      // three sets of its bench and four of the press after it. A deadlift
      // from the floor stops at three and holds nothing else back.
      const main = exercises.find((ex) => ex.isAccessory !== true);
      const most = (ex: ProgramExercise) =>
        ex === main || !main || isFloorDeadlift(main.exerciseId)
          ? capFor(ex)
          : Math.min(capFor(ex), Math.max(main.sets, ex.sets));
      const add = (ex: ProgramExercise): boolean => {
        if (timed(ex) || ex.sets >= most(ex)) return false;
        if (total() >= maxSessionSets(minutes)) return false;
        ex.sets += 1;
        if (plannedSeconds(exercises, minutes) <= minutes * 60) return true;
        ex.sets -= 1;
        return false;
      };
      for (let pass = 0; pass < 2; pass++) for (const ex of exercises) add(ex);
    },
  };
}

/**
 * Size a new plan's sessions to `minutes` (Lift21). Time sets the number of
 * lifts, not the sets on each:
 *
 *   - every lift starts at its place's sets (`setsByPlace`);
 *   - while the day does not fit, the lift with the highest `keepRank` goes
 *     (the builders rank each day's lifts; one a later pass added goes
 *     before any of theirs), down to three lifts, two in a 30-minute day.
 *     One of the day's first four that then fits comes back, and any lift
 *     that fits while the day is under 85% of its length;
 *   - time the next lift would not fit goes back to the lifts the day has.
 *
 * With no length to fit, every lift stays, at its place's sets.
 */
export function sizeSessionsToTime(
  workouts: WorkoutDay[],
  minutes: number,
  experience: Experience | undefined
): WorkoutDay[] {
  const sets = setsByPlace(minutes, experience);
  const short = minutes <= SHORT_SESSION_MINUTES;

  return workouts.map((day) => {
    const mainIndex = day.exercises.findIndex((ex) => ex.isAccessory !== true);
    const placed = sets.place(day.exercises);
    if (!Number.isFinite(minutes)) return { ...day, exercises: placed };
    // The order lifts are given up in: the highest rank first, and among
    // lifts with none (added after the builders) the last first.
    const rank = (ex: ProgramExercise, i: number) =>
      i === mainIndex ? -1 : (ex.keepRank ?? 1000 + i);
    const order = placed
      .map((ex, i) => ({ i, rank: rank(ex, i) }))
      .sort((a, b) => b.rank - a.rank)
      .map(({ i }) => i);
    const fewest = Math.min(
      placed.length,
      short ? MIN_SHORT_LIFTS : MIN_SIZED_LIFTS
    );
    const gone = new Set<number>();
    const kept = () => placed.filter((_, i) => !gone.has(i));
    for (const i of order) {
      if (sessionFits(kept(), minutes)) break;
      if (placed.length - gone.size <= fewest) break;
      gone.add(i);
    }
    // A lift comes back when it fits now that a dearer one after it has
    // gone, the lowest rank first: one of the pieces the day must hold
    // always, any other while the day is short of its length.
    for (const i of [...order].reverse()) {
      if (!gone.has(i)) continue;
      const short =
        plannedSeconds(kept(), minutes) < minutes * 60 * FILLED_SHARE;
      if (rank(placed[i], i) > MUST_HOLD_RANKS && !short) continue;
      gone.delete(i);
      if (!sessionFits(kept(), minutes)) gone.add(i);
    }
    const exercises = kept();
    sets.deepen(exercises);
    return { ...day, exercises };
  });
}

/**
 * Re-fit a plan the person has to a session length: each lift goes back to
 * its place's sets (`setsByPlace`; timed holds keep theirs) and, where the
 * day runs over, sets are cut to the time, never a lift; time left over
 * goes back as sets, as a new plan's does. The person's lifts, reps,
 * weights and history all stay. The plan's volume anchor (`baseSets`) moves
 * with the sets, so the weeks after start from the fitted number.
 */
export function refitSessionsToTime(
  workouts: WorkoutDay[],
  experience: Experience | undefined,
  minutes: number
): WorkoutDay[] {
  const sets = setsByPlace(minutes, experience);
  return workouts.map((day) => {
    const fitted = fitDay(
      { ...day, exercises: sets.place(day.exercises) },
      minutes
    );
    sets.deepen(fitted.exercises);
    return {
      ...fitted,
      exercises: fitted.exercises.map((ex) => ({ ...ex, baseSets: ex.sets })),
    };
  });
}
