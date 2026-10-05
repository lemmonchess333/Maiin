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
const AUTOMATIC_STEP_SHARE = 0.15;
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
const PLATES = uniform(2.5);
const SMALL_PLATES = uniform(1.25);
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
 * How far a target climbs past its range when the next weight is too big a
 * step to take on its own: up to the reps at which the next weight, for the
 * range's bottom, is the same effort by Epley's estimate (10 kg dumbbells
 * for 22 reps against 12.5 kg for 12). There it waits for the person to
 * pick the heavier weight up, which the plan then follows.
 */
export function stretchedRepCeiling(
  weight: number,
  next: number,
  bottomReps: number
): number {
  return Math.floor(
    30 * ((next / weight) * (1 + bottomReps / 30) - 1) + EPSILON
  );
}

/** 10% lighter on the grid, by at least one step. */
export function loweredLoad(grid: LoadGrid, weight: number): number {
  return Math.min(grid.nearest(weight * 0.9), grid.below(weight));
}
