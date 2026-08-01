/**
 * Block represcription (Blk2) — pure.
 *
 * A training block OWNS the lift prescription for its duration. This is the
 * whole mechanism: given the stored week and a training focus, re-derive
 * what each slot asks for. It never calls a builder, and that is the point
 * rather than an optimisation.
 *
 * Blk1 rejected block-owns-programme on the grounds that it "fights the
 * adaptive engine". It was right about the risk and inverted about the
 * mechanism. The shipped alternative — writing `primaryGoal` and letting
 * `buildPlan` sort it out — is measurably a no-op: the preserve branch
 * gates on `sameDayCount && !levelChanged` and never looks at the goal, so
 * a hypertrophy→strength change moves 0 of 18 slots and a strength user
 * keeps deadlifting at 10-14 reps. The only path that DOES reach a builder
 * (`regenerateProgram`, a lift-days or experience change) resets
 * `weekNumber`, `weekHistory` and `currentPhase`, and drops per-exercise
 * history wherever the positional carry misses. Cosmetic or destructive,
 * with nothing in between.
 *
 * So this maps over the stored workouts and writes six fields. Everything
 * that carries adaptive or durable state is structurally out of reach:
 * `weekNumber`, `currentPhase`, `weekHistory`, `fatigueScore`,
 * `deloadSnapshot`, `sets`/`baseSets`, `performanceHistory`,
 * `lastPerformance`, `lastSuccessfulWeight`, `preDeloadWeight`,
 * `exerciseId`, `instanceId`, `movementCategory`, `isAccessory`, the split
 * and the day count. No history-death mode is reachable from here, because
 * every one of them requires re-picking a movement.
 *
 * Inverted by applying it again with the focus the user had before the
 * block, which is why a block stores one scalar (`goalBefore`) and NOT a
 * per-slot snapshot. A snapshot would have to rewind loads that eight weeks
 * of progression legitimately earned, and would go stale the moment a slot
 * was added, removed or swapped mid-block.
 */

import {
  assignDayRoles,
  goalProfileFor,
  prescribedRepCeiling,
  repDeltaForRole,
  repFloorFor,
  repRangeMaxFor,
} from "./programEngine";
import { usesUndulation } from "./experienceModel";
import type {
  ActiveTrainingBlock,
  Experience,
  PrimaryGoal,
  ProgramExercise,
  WorkoutDay,
} from "./programTypes";

/**
 * Working load for a new rep target, via the Epley 1RM identity
 * (`1RM = w × (1 + reps/30)`): hold the implied 1RM, solve for the weight.
 *
 * This exists to close the one genuine conflict between a block and the
 * progression engine. `applyProgression` scores a session complete only
 * when `actualReps >= exercise.reps`, so raising a main from 5 to 12 at
 * unchanged load fails every session → `consecutiveFailures >= 3` →
 * `plateauCount++`. Once two lifts are plateaued, `applyAdjustment`'s
 * `reorganize` arm sits OUTSIDE its `isAccessory` guard and calls
 * `swapExerciseIdentity` on MAINS, which zeroes their history. That is
 * precisely the failure Blk1 predicted, and a represcribe plateaus every
 * main at once — the fastest possible route to it. Moving the load with
 * the target keeps the session completable on day one.
 *
 * Epley rather than a flat multiplier because the error compounds over the
 * range the five focus profiles actually span: 5→12 needs ×0.83, not the
 * ×0.92 that fits 5→8.
 *
 * Never increases a load. Climbing is `applyProgression`'s job and it has
 * per-lift resolution, RPE holds and microplate steps; a block guessing
 * upward would hand someone a weight they have not earned. So a move to
 * FEWER reps holds the current load, which is simply an easier session.
 */
export function scaleLoadForReps(
  weight: number,
  fromReps: number,
  toReps: number
): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(fromReps) || !Number.isFinite(toReps)) return weight;
  if (toReps <= fromReps) return weight;
  const ratio = (1 + fromReps / 30) / (1 + toReps / 30);
  return Math.round((weight * ratio) / 2.5) * 2.5;
}

/**
 * Re-derive a week's prescription for `goal`, preserving everything else.
 *
 * `experience` drives undulation exactly as generation does — a beginner
 * gets the flat goal base, everyone else gets the heavy/pump shift. Passing
 * the wrong one here would silently flatten the week.
 */
export function represcribeWorkouts(
  workouts: readonly WorkoutDay[],
  goal: PrimaryGoal,
  experience: Experience | undefined
): WorkoutDay[] {
  const profile = goalProfileFor(goal);
  const mainSpan = Math.max(0, profile.mainRepsMax - profile.mainReps);
  const accessorySpan = Math.max(
    0,
    profile.accessoryRepsMax - profile.accessoryReps
  );
  // Undulation is applied per DAY INDEX, so the roles have to be computed
  // over the whole week before any slot is touched.
  const roles = assignDayRoles(workouts.length);
  const undulates = usesUndulation(experience);

  return workouts.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      // A 30-45s plank is not a 12-rep set, and no goal profile authors a
      // seconds target. `prescribedRepCeiling` already returns Infinity for
      // these; the honest handling is to leave them entirely alone.
      if (ex.repUnit === "seconds") return { ...ex };

      // `undefined` falls to MAIN, matching `generateProgram`'s own
      // convention for legacy and unflagged slots. Treating it as an
      // accessory instead would make the whole transform a silent no-op on
      // any plan authored before `isAccessory` was persisted.
      const isAccessory = ex.isAccessory === true;
      const tierReps = isAccessory ? profile.accessoryReps : profile.mainReps;
      const span = isAccessory ? accessorySpan : mainSpan;
      const delta = undulates ? repDeltaForRole(roles[dayIndex]) : 0;

      const reps = Math.min(
        prescribedRepCeiling(ex),
        Math.max(repFloorFor(ex), tierReps + delta)
      );
      const rangeMax = repRangeMaxFor(ex, reps, span);

      const out: ProgramExercise = {
        ...ex,
        reps,
        // `applyProgression` resets the climbing target back to `baseReps`
        // after a load step, so leaving it on the old focus's number would
        // walk the user back to the retired prescription one step later.
        baseReps: reps,
        progressionType: isAccessory ? "double" : profile.mainProgression,
        weight: scaleLoadForReps(ex.weight, ex.baseReps ?? ex.reps, reps),
        // Failure counters accumulated against a rep target that no longer
        // exists are not evidence of anything.
        consecutiveFailures: 0,
        plateauCount: 0,
      };
      // Omitted rather than zeroed when the profile authors no span — a
      // `repRangeMax` of 0 would read as a ceiling below the target.
      if (rangeMax !== undefined) out.repRangeMax = rangeMax;
      else delete out.repRangeMax;
      return out;
    }),
  }));
}

/**
 * Whether an easing block is holding progression this week.
 *
 * Deliberately NOT implemented by flipping `programState.settings
 * .autoProgression`: that is a switch the user owns in Programme settings,
 * and a block must not silently move someone's setting. Block-scoped and
 * self-expiring — week 3 resumes normal progression with nothing to clear.
 */
export function isProgressionHeld(
  block: ActiveTrainingBlock | undefined,
  blockWeek: number | null
): boolean {
  if (!block || block.pace !== "easing") return false;
  return blockWeek !== null && blockWeek <= EASING_HOLD_WEEKS;
}

/** Weeks an "easing back in" block holds load before resuming progression. */
export const EASING_HOLD_WEEKS = 2;

/**
 * Weeks of plateau-RESPONSE amnesty a block opens with when it changes the
 * focus or eases the pace.
 *
 * Three, because `resolveAdjustment` needs two consecutive stalled weeks to
 * escalate past a volume cut, and the third covers the bodyweight residue
 * `scaleLoadForReps` cannot reach: a pull-up has no load to shed, so its
 * target walks down one rep per three misses instead.
 */
export const BLOCK_AMNESTY_WEEKS = 3;
