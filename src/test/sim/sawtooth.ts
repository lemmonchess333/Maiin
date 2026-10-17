/**
 * The session-to-session sawtooth's options (decisions.md L4, Pgm8), laid
 * over Lift4 as built at Finish (`ProgressionVariant`). Each takes a lift
 * from where the app's own rules left it and changes only what the option
 * changes:
 *
 * - weekly step: an intermediate's or advanced lifter's slot steps at most
 *   once in 7 days; a step the app takes sooner is held back, weight and
 *   reps as before it. Every step counts, a lowered lift's way back
 *   included. A beginner keeps Lift4 (6). A slot comes round once a week,
 *   later when the week's order carries over and never sooner, so per
 *   slot it never bites; per lift, a step in one slot holds back the
 *   lift's others for the week.
 * - drop scaled by level: where the app lowers a lift after two misses,
 *   an intermediate's or advanced lifter's comes down 5% on its grid (at
 *   least a step) instead of 10%, and climbs back as built; a beginner's
 *   10% stands.
 * - e1RM trend: a main lift's load after a miss comes from the trend of
 *   the app's own e1RM estimates (`TREND`), in place of Lift4 (7)'s hold
 *   and 10% drop. The step stays as built: a set stopped at its target
 *   can't show the reps it had left, so with the app's Epley both ways an
 *   e1RM read off it gives back the weight it was lifted at, and only a
 *   step can raise a load.
 *
 * Each variant counts what it changed (`counts`, one entry per season in
 * the order the seasons run), so the report can say how often it bit.
 */
import { epley1RMExact } from "@/lib/analytics";
import { parseLocalDate } from "@/lib/dateHelpers";
import { getExerciseById, isBodyweightExerciseId } from "@/lib/exercises";
import { lighterBy, loadGridFor } from "@/features/program/loadSteps";
import {
  loweringOf,
  type Experience,
  type ProgramExercise,
  type ProgramState,
} from "@/features/program/programTypes";
import { BAR_KG } from "@/features/program/warmupRamp";
import type { LiftAtFinish, ProgressionVariant } from "./liftSeason";

/** What a variant changed in one season. */
export interface Interventions {
  /** Steps held back (weekly step), drops made 5% (scaled drop), loads
   *  the trend took down after a miss (e1RM trend). */
  changed: number;
  /** e1RM trend: a second miss the trend kept at its weight, where the
   *  app would have lowered it. */
  kept: number;
}

export interface CountedVariant extends ProgressionVariant {
  /** One entry per season, in the order `start` was called. */
  counts: Interventions[];
}

const E = 1e-6;
const DAY_MS = 86_400_000;

const isLoaded = (ex: ProgramExercise) =>
  !isBodyweightExerciseId(ex.exerciseId) &&
  ex.repUnit !== "seconds" &&
  ex.weight > 0;
const atPlan = (lift: LiftAtFinish) =>
  Math.abs(lift.lifted - lift.before.weight) < 0.01;
const slotOf = (ex: ProgramExercise) => ex.instanceId ?? ex.exerciseId;
const daysBetween = (from: string, to: string) =>
  Math.round(
    (parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / DAY_MS
  );

/** The app lowered the lift at this session (Lift4 (7)'s second miss): a
 *  new record, not yet shown, from the weight it asked for. */
function loweredNow(before: ProgramExercise, after: ProgramExercise): boolean {
  const lowering = loweringOf(after);
  return (
    lowering?.unit === "kg" &&
    !lowering.shown &&
    Math.abs(lowering.from - before.weight) < E &&
    after.weight < before.weight - E
  );
}

function counted(
  name: string,
  make: (count: Interventions) => (lift: LiftAtFinish) => ProgramExercise
): CountedVariant {
  const counts: Interventions[] = [];
  return {
    name,
    counts,
    start: () => {
      const count = { changed: 0, kept: 0 };
      counts.push(count);
      return make(count);
    },
  };
}

/** The days a slot waits between steps under the weekly step. */
export const WEEKLY_STEP_DAYS = 7;

/**
 * Weekly step, for an intermediate or advanced lifter; null for a
 * beginner, who keeps Lift4 (6). Per slot, as the brief has it, or per
 * lift: a step in any of the lift's slots starts the week for all of them.
 */
export function weeklyStep(
  level: Experience,
  per: "slot" | "lift" = "slot"
): CountedVariant | null {
  if (level === "beginner") return null;
  return counted(`weekly step, per ${per}`, (count) => {
    const lastStep = new Map<string, string>();
    return (lift) => {
      const { before, after, date } = lift;
      if (
        lift.lighter ||
        !isLoaded(before) ||
        !(after.weight > before.weight + E)
      )
        return after;
      const slot = per === "slot" ? slotOf(before) : before.exerciseId;
      const last = lastStep.get(slot);
      if (
        atPlan(lift) &&
        last !== undefined &&
        daysBetween(last, date) < WEEKLY_STEP_DAYS
      ) {
        count.changed++;
        // Held back: the weight and reps it had, and a lowered lift's way
        // back as it was, its line now said.
        const { lowered: _step, ...rest } = after;
        const lowering = loweringOf(before);
        return {
          ...rest,
          weight: before.weight,
          reps: before.reps,
          ...(lowering?.unit === "kg" && before.weight < lowering.from - E
            ? { lowered: { ...lowering, shown: true as const } }
            : {}),
        };
      }
      lastStep.set(slot, date);
      return after;
    };
  });
}

/** How far a drop takes an intermediate's or advanced lifter's lift. */
export const SCALED_DROP_SHARE = 0.05;

/** Drop scaled by level, for an intermediate or advanced lifter; null for
 *  a beginner, whose 10% stands. */
export function dropScaledByLevel(level: Experience): CountedVariant | null {
  if (level === "beginner") return null;
  return counted("drop scaled by level", (count) => (lift) => {
    const { before, after } = lift;
    if (lift.lighter || !isLoaded(before) || !atPlan(lift)) return after;
    if (!loweredNow(before, after)) return after;
    const weight = lighterBy(
      loadGridFor(before.exerciseId, lift.smallPlates),
      before.weight,
      SCALED_DROP_SHARE
    );
    if (!(weight > 0) || Math.abs(weight - after.weight) < E) return after;
    count.changed++;
    // The record stays: the lift climbs back to `from` a step a session.
    return { ...after, weight };
  });
}

/**
 * The e1RM trend: the lift's sessions from every slot it fills, each the
 * app's own record of it (`performanceHistory`: the weight followed and
 * the average set there) through the app's Epley (`epley1RMExact`), at most
 * 10 reps (Reynolds 2006); the last 4 (the prompt's 3–6 exposures); a
 * least-squares line through them against the day, read at the latest. The
 * load for the target is the app's own rep-to-load scaling, Epley's
 * 1 / (1 + reps / 30) (`represcribe.ts`, `startingLoads.ts`; within 1.5%
 * of Nuzzo 2024 from 3 to 12 reps, lifting-evidence §2.15), on the lift's
 * grid, no lighter than the bar for a barbell lift planned above it.
 */
export const TREND = { exposures: 4, maxReps: 10, minExposures: 2 } as const;

/** The trend's e1RM for a lift, or null with too few sessions. */
export function e1rmTrend(
  plan: ProgramState,
  exerciseId: string
): number | null {
  const records = plan.workouts
    .flatMap((d) => d.exercises)
    .filter((ex) => ex.exerciseId === exerciseId)
    .flatMap((ex) => ex.performanceHistory ?? [])
    .filter(
      (r) =>
        r.weight > 0 && r.repsCompleted >= 1 && r.repsCompleted <= TREND.maxReps
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-TREND.exposures);
  if (records.length < TREND.minExposures) return null;
  const first = records[0].date;
  const xs = records.map((r) => daysBetween(first, r.date));
  const ys = records.map((r) => epley1RMExact(r.weight, r.repsCompleted));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope =
    sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
  return my + slope * (xs[n - 1] - mx);
}

/** The load the trend gives a lift's target reps, on its grid. */
export function trendLoad(
  plan: ProgramState,
  ex: ProgramExercise,
  smallPlates: boolean
): number | null {
  const trend = e1rmTrend(plan, ex.exerciseId);
  if (trend === null) return null;
  const grid = loadGridFor(ex.exerciseId, smallPlates);
  let load = grid.nearest(trend / (1 + ex.reps / 30));
  if (
    getExerciseById(ex.exerciseId)?.equipment === "Barbell" &&
    ex.weight >= BAR_KG
  )
    load = Math.max(BAR_KG, load);
  return load > 0 ? load : null;
}

/** The e1RM trend, for every level's main lifts. */
export function e1rmTrendLoads(): CountedVariant {
  return counted("e1RM trend", (count) => (lift) => {
    const { before, after } = lift;
    if (
      lift.lighter ||
      before.isAccessory === true ||
      !isLoaded(before) ||
      !atPlan(lift)
    )
      return after;
    const lowered = loweredNow(before, after);
    const missed =
      lowered ||
      (after.consecutiveFailures ?? 0) > (before.consecutiveFailures ?? 0);
    if (!missed) return after;
    const load = trendLoad(lift.plan, before, lift.smallPlates);
    // Too few sessions for a trend: Lift4 (7) as built.
    if (load === null) return after;
    if (load < before.weight - E) {
      count.changed++;
      // The trend's load is the load: no way back to climb, and the miss
      // count starts again from it.
      const { lowered: _record, ...rest } = after;
      return { ...rest, weight: load, consecutiveFailures: 0 };
    }
    if (!lowered) return after;
    // The app lowered on a second miss; the trend keeps the weight, and the
    // miss is counted.
    count.kept++;
    const { lowered: _record, ...rest } = after;
    const lowering = loweringOf(before);
    return {
      ...rest,
      weight: before.weight,
      consecutiveFailures: (before.consecutiveFailures ?? 0) + 1,
      ...(lowering ? { lowered: lowering } : {}),
    };
  });
}
