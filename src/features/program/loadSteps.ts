import { getExerciseById } from "@/lib/exercises";

/**
 * How a loaded lift's weight moves (Lift4 (6)): by the equipment it is lifted
 * on, so every weight the plan names is one the person can pick up.
 *
 *   barbell     2.5 kg, a 1.25 kg plate a side; 1.25 kg with small plates
 *   dumbbells   the next pair on a gym's usual rack: kilo steps to 10 kg,
 *               then 2.5 kg
 *   machine or
 *   cable stack 2.5 kg, the finest common stack step
 *   kettlebell  the next bell: 2 kg steps to 32 kg, then 4 kg
 *
 * A lift the catalogue doesn't know steps as a stack does. A step of more
 * than about 15% of the weight is never taken on its own
 * (`automaticStepUp`): a 2.5 kg jump is 1.5% of a squat but 25% of a 10 kg
 * dumbbell, so a light lift's target climbs in reps instead
 * (`stretchedRepCeiling`), and the plan follows the heavier weight once the
 * person picks it up.
 */
export interface LoadGrid {
  /** The next weight up from this one, on or off the grid. */
  above(weight: number): number;
  /** The next weight down, or 0 below the lightest. */
  below(weight: number): number;
  /** The weight on the grid nearest this one, the lighter on a tie. */
  nearest(weight: number): number;
}

/** The largest step the plan takes on its own, as a share of the weight. */
export const AUTOMATIC_STEP_SHARE = 0.15;

/** A barbell's step, and with "I have small plates" (Lift4 (6)). */
export const BARBELL_STEP_KG = 2.5;
export const SMALL_PLATES_STEP_KG = 1.25;

/** Misses in a row that lower a lift, and how much lighter they make it
 *  (Lift4 (7)). */
export const MISSES_BEFORE_LOWERING = 2;
export const LOWERED_SHARE = 0.1;
const EPSILON = 1e-6;
const round = (value: number) => Math.round(value * 1000) / 1000;

function uniform(step: number): LoadGrid {
  return {
    above: (weight) => round((Math.floor(weight / step + EPSILON) + 1) * step),
    below: (weight) =>
      Math.max(0, round((Math.ceil(weight / step - EPSILON) - 1) * step)),
    nearest: (weight) => round(Math.ceil(weight / step - 0.5 - EPSILON) * step),
  };
}

/** A rack of set weights, extended past its heaviest by its last gap. */
function ladder(rungs: readonly number[]): LoadGrid {
  const last = rungs[rungs.length - 1];
  const gap = last - rungs[rungs.length - 2];
  const at = (i: number) =>
    i < rungs.length
      ? rungs[Math.max(0, i)]
      : round(last + (i - rungs.length + 1) * gap);
  // The index of the lightest weight heavier than this one, and of the
  // lightest at or above it.
  const firstAbove = (weight: number) =>
    weight >= last - EPSILON
      ? rungs.length + Math.floor((weight - last) / gap + EPSILON)
      : rungs.findIndex((rung) => rung > weight + EPSILON);
  const firstFrom = (weight: number) =>
    weight > last + EPSILON
      ? rungs.length - 1 + Math.ceil((weight - last) / gap - EPSILON)
      : rungs.findIndex((rung) => rung >= weight - EPSILON);
  return {
    above: (weight) => at(firstAbove(weight)),
    below: (weight) => {
      const i = firstFrom(weight) - 1;
      return i < 0 ? 0 : at(i);
    },
    nearest: (weight) => {
      const i = firstAbove(weight);
      const upper = at(i);
      const lower = i === 0 ? upper : at(i - 1);
      return weight - lower <= upper - weight + EPSILON ? lower : upper;
    },
  };
}

const range = (from: number, to: number, step: number) =>
  Array.from(
    { length: Math.round((to - from) / step) + 1 },
    (_, i) => from + i * step
  );

const DUMBBELLS = ladder([...range(1, 10, 1), ...range(12.5, 50, 2.5)]);
const KETTLEBELLS = ladder([...range(4, 32, 2), ...range(36, 48, 4)]);
const PLATES = uniform(BARBELL_STEP_KG);
const SMALL_PLATES = uniform(SMALL_PLATES_STEP_KG);
const STACK = uniform(2.5);

/** The grid of a lift whose equipment the catalogue names, or null. */
export function equipmentGridFor(
  exerciseId: string | undefined,
  smallPlates: boolean
): LoadGrid | null {
  switch (exerciseId ? getExerciseById(exerciseId)?.equipment : undefined) {
    case "Barbell":
      return smallPlates ? SMALL_PLATES : PLATES;
    case "Dumbbells":
      return DUMBBELLS;
    case "Kettlebell":
      return KETTLEBELLS;
    case "Machine":
    case "Cable Machine":
      return STACK;
    default:
      return null;
  }
}

/** The grid a lift's weight moves on. */
export function loadGridFor(
  exerciseId: string | undefined,
  smallPlates: boolean
): LoadGrid {
  return equipmentGridFor(exerciseId, smallPlates) ?? STACK;
}

/** The next weight up, when it is no more than about 15% heavier. */
export function automaticStepUp(grid: LoadGrid, weight: number): number | null {
  const next = grid.above(weight);
  return next - weight <= weight * AUTOMATIC_STEP_SHARE + EPSILON ? next : null;
}

/**
 * Mean reps to failure at a share of 1RM, heaviest first: Nuzzo et al.
 * 2024 (Sports Med 54:303–321), the main table, which covers every lift
 * but the bench press and leg press (lifting-evidence §2.15, "Verified
 * parameters"). The table stops at 95%, where its curve gives 3.3 reps, not
 * 1; the first row, 1 rep at 100%, is the bridge to a true single, and it
 * is our assumption, not the paper's.
 */
const REPS_TO_FAILURE: readonly (readonly [share: number, reps: number])[] = [
  [1, 1],
  [0.95, 3.3],
  [0.9, 4.9],
  [0.85, 7.2],
  [0.8, 9.8],
  [0.75, 12.4],
  [0.7, 14.8],
  [0.65, 17.1],
  [0.6, 19.5],
];

/** The table as points with log reps, which run straight between them. */
const EFFORT_CURVE = REPS_TO_FAILURE.map(([share, reps]) => ({
  share,
  logReps: Math.log(reps),
}));

/** The curve's segment this value falls in, by the coordinate given; the
 *  last segment, 65–60%, carries on past the lightest load. */
function effortSegment(
  fallsIn: (end: (typeof EFFORT_CURVE)[number]) => boolean
) {
  let i = 0;
  while (i < EFFORT_CURVE.length - 2 && fallsIn(EFFORT_CURVE[i + 1])) i++;
  return [EFFORT_CURVE[i], EFFORT_CURVE[i + 1]] as const;
}

/** The share of 1RM at which this many reps go to failure. */
function shareAtReps(reps: number): number {
  const logReps = Math.log(Math.max(1, reps));
  const [a, b] = effortSegment((end) => end.logReps < logReps);
  return (
    a.share +
    ((logReps - a.logReps) / (b.logReps - a.logReps)) * (b.share - a.share)
  );
}

/** The reps to failure at this share of 1RM. */
function repsAtShare(share: number): number {
  const [a, b] = effortSegment((end) => end.share > share);
  return Math.exp(
    a.logReps +
      ((share - a.share) / (b.share - a.share)) * (b.logReps - a.logReps)
  );
}

/**
 * How far a target climbs past its range when the next weight is too big a
 * step to take on its own: up to the reps at which this weight is the same
 * effort as the next weight for the range's bottom, by Nuzzo 2024's mean
 * reps to failure (`REPS_TO_FAILURE`, read between its points on log reps,
 * as lifting-evidence §2.15 does). 12.5 kg dumbbells for 12 is about 75.7%
 * of 1RM, so 10 kg is about 60.6%: 19 reps. There it waits for the person
 * to pick the heavier weight up, which the plan then follows.
 *
 * Epley's estimate, used here before (Pgm7 A3), ran up to 5 reps high in
 * this zone (22 for the same pair), past the 10 reps Reynolds 2006 found
 * such formulas good for. Whole reps, rounded down, and never under the
 * bottom.
 */
export function stretchedRepCeiling(
  weight: number,
  next: number,
  bottomReps: number
): number {
  const share = shareAtReps(bottomReps) * (weight / next);
  return Math.max(bottomReps, Math.floor(repsAtShare(share) + EPSILON));
}

/** A share lighter on the grid, by at least one step. */
export function lighterBy(
  grid: LoadGrid,
  weight: number,
  share: number
): number {
  return Math.min(grid.nearest(weight * (1 - share)), grid.below(weight));
}

/** 10% lighter on the grid, by at least one step. */
export function loweredLoad(grid: LoadGrid, weight: number): number {
  return lighterBy(grid, weight, LOWERED_SHARE);
}
