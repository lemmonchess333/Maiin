/**
 * F8's options (decisions.md L5): the time fit prices a lift's warm-up at
 * its starting weight, or an established lifter's, and a light barbell
 * lift gains warm-up sets as it grows. Option (a) keeps that; these are (b)
 * and (c), each through the app's own fit and estimator:
 *
 * - (b) `projectedPricing`: the fit prices each barbell lift's warm-up at
 *   the ramp it will have after a block, the weight the plan's own rule
 *   (`applyProgression`) takes it to in `BLOCK_SESSIONS` successful
 *   sessions, every set at its target, from its starting weight. Through
 *   the fit's pricing seam (`setWarmupPricing`), so the plan is built, and
 *   balanced, as the app would build it so priced.
 * - (c) `refitWhenRampsGrow`: at the first rollover of a week, any day the
 *   app's own check says no longer fits its length (`sessionFits`: with
 *   the sets unchanged, a ramp that grew) is re-fitted as the app re-fits
 *   a plan to a new length (`refitSessionsToTime`, then
 *   `balanceWeekVolume`, as planBuilder's `refitWeek`). Only the re-fit's
 *   cuts on that day are kept: the re-fit path gives a few slots a set
 *   the generator's fit doesn't, with nothing grown, and that isn't (c).
 *   A lighter week, or the first week back, waits for the next ordinary
 *   one.
 */
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { getExerciseById } from "@/lib/exercises";
import {
  applyProgression,
  balanceWeekVolume,
  repRangeMaxFor,
} from "@/features/program/programEngine";
import type {
  Experience,
  PrimaryGoal,
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import { roleRepsFor } from "@/features/program/roleTable";
import {
  refitSessionsToTime,
  sessionFits,
  sessionMinutesFor,
  type WarmupPricing,
} from "@/features/program/sessionFit";
import { EASING_BACK_WEEKS } from "@/features/program/weekPrescription";
import type { PlanVariant } from "./liftSeason";

/** A block's successful sessions for one slot: the shortest block the app
 *  offers, 4 weeks (`BLOCK_DURATIONS`), which is also the lighter-week
 *  cycle, with each slot coming round once a week. The longest, 12, is the
 *  measurement's check on that choice. */
export const BLOCK_SESSIONS = 4;
export const LONGEST_BLOCK_SESSIONS = 12;

/** The weight the plan's own rule takes a lift to in `sessions`
 *  successful sessions, from its weight: each a session of every set at
 *  its target, through `applyProgression`, with the rep range the
 *  generator stamps after the fit (`repRangeMaxFor`). */
export function weightAfterBlock(
  ex: ProgramExercise,
  goal: PrimaryGoal | undefined,
  experience: Experience,
  sessions = BLOCK_SESSIONS
): number {
  const row = roleRepsFor(goal, ex, experience);
  const span = row.top === undefined ? 0 : row.top - row.bottom;
  const rangeMax = ex.repRangeMax ?? repRangeMaxFor(ex, ex.reps, span);
  let lift: ProgramExercise = {
    ...ex,
    baseReps: ex.baseReps ?? ex.reps,
    ...(rangeMax === undefined ? {} : { repRangeMax: rangeMax }),
    performanceHistory: [],
  };
  for (let i = 0; i < sessions; i++)
    lift = applyProgression(
      lift,
      lift.reps,
      lift.weight,
      false,
      undefined,
      1,
      "2026-01-01"
    );
  return lift.weight;
}

/** (b): each barbell lift's warm-up priced at the heavier of the fit's own
 *  weight and its weight after a block. */
export function projectedPricing(
  goal: PrimaryGoal | undefined,
  experience: Experience,
  sessions = BLOCK_SESSIONS
): WarmupPricing {
  return (ex, priced) =>
    getExerciseById(ex.exerciseId)?.equipment === "Barbell"
      ? Math.max(priced, weightAfterBlock(ex, goal, experience, sessions))
      : priced;
}

/** (c), with the days it re-fitted in each season, one entry per season in
 *  the order the seasons run. */
export interface RefitVariant extends PlanVariant {
  refits: number[];
}

export function refitWhenRampsGrow(
  goal: PrimaryGoal | undefined,
  experience: Experience
): RefitVariant {
  const refits: number[] = [];
  return {
    name: "(c) re-fit at the rollover",
    refits,
    start: () => {
      const season = refits.push(0) - 1;
      let checked: string | null = null;
      return (state: ProgramState, date: string) => {
        const week = localWeekKey(parseLocalDate(date));
        if (week === checked) return state;
        const ordinary =
          state.currentPhase !== "deload" &&
          !state.raceWeek &&
          (state.easingBack?.weeksLeft ?? 0) < EASING_BACK_WEEKS;
        if (!ordinary) return state;
        checked = week;
        const minutes = sessionMinutesFor(state.sessionMinutes);
        const over = state.workouts.map(
          (d) => !sessionFits(d.exercises, minutes)
        );
        if (!over.includes(true)) return state;
        const refitted = balanceWeekVolume(
          refitSessionsToTime(state.workouts, goal, experience, minutes),
          goal,
          experience,
          minutes
        );
        refits[season] += over.filter(Boolean).length;
        return {
          ...state,
          workouts: state.workouts.map((d, i) => {
            if (!over[i]) return d;
            const sets = new Map(
              refitted[i].exercises.map((ex) => [ex.instanceId, ex.sets])
            );
            return {
              ...d,
              exercises: d.exercises.map((ex) => {
                const cut = Math.min(
                  ex.sets,
                  sets.get(ex.instanceId) ?? ex.sets
                );
                return cut === ex.sets
                  ? ex
                  : { ...ex, sets: cut, baseSets: cut };
              }),
            };
          }),
        };
      };
    },
  };
}
