import { getExerciseById, isBodyweightExerciseId } from "@/lib/exercises";
import {
  liftUnitLabel,
  loadIn,
  loadToKg,
  wholeLoadIn,
  type LiftUnit,
} from "@/lib/liftLoad";
import { kgToLb, lbToKg } from "@/lib/weightUnits";

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
 *   belt        a bodyweight lift's added load (Pgm8 L6), one plate at a
 *               time: 2.5 kg; 1.25 kg with small plates
 *
 * In lb (Lift18), a lifter's loads round to lb kit, still stored as kg:
 *
 *   barbell     5 lb, a 2.5 lb plate a side; 2.5 lb with small plates
 *   dumbbells   3, 5, 8, 10, 12, 15 lb, then every 5 lb
 *   machine or
 *   cable stack 5 lb
 *   kettlebell  the kg bells, which are sold in kg even where lb is the unit
 *   belt        5 lb; 2.5 lb with small plates
 *
 * A lift the catalogue doesn't know steps as a stack does. A step of more
 * than about 15% of the weight is never taken on its own
 * (`automaticStepUp`): a 2.5 kg jump is 1.5% of a squat but 25% of a 10 kg
 * dumbbell, so a light lift's target climbs in reps instead
 * (`stretchedRepCeiling`), and the plan follows the heavier weight once the
 * person picks it up. A plate on a belt is always taken: the weight a
 * bodyweight lift moves is the person as well as the belt
 * (`applyProgression`).
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

/** A grid of lb weights, taking and giving kg: what a load in lb rounds to,
 *  stored as the exact kg of that many lb, so 135 lb stays 135 lb. */
function inLb(grid: LoadGrid): LoadGrid {
  return {
    above: (kg) => lbToKg(grid.above(kgToLb(kg))),
    below: (kg) => lbToKg(grid.below(kgToLb(kg))),
    nearest: (kg) => lbToKg(grid.nearest(kgToLb(kg))),
  };
}

/** A barbell's step in lb, and with small plates (Lift18). */
export const BARBELL_STEP_LB = 5;
export const SMALL_PLATES_STEP_LB = 2.5;

interface Kit {
  plates: LoadGrid;
  smallPlates: LoadGrid;
  dumbbells: LoadGrid;
  kettlebells: LoadGrid;
  stack: LoadGrid;
}

const KETTLEBELLS = ladder([...range(4, 32, 2), ...range(36, 48, 4)]);

const KIT: Record<LiftUnit, Kit> = {
  kg: {
    plates: uniform(BARBELL_STEP_KG),
    smallPlates: uniform(SMALL_PLATES_STEP_KG),
    dumbbells: ladder([...range(1, 10, 1), ...range(12.5, 50, 2.5)]),
    kettlebells: KETTLEBELLS,
    stack: uniform(2.5),
  },
  lbs: {
    plates: inLb(uniform(BARBELL_STEP_LB)),
    smallPlates: inLb(uniform(SMALL_PLATES_STEP_LB)),
    dumbbells: inLb(ladder([3, 5, 8, 10, 12, 15, ...range(20, 120, 5)])),
    kettlebells: KETTLEBELLS,
    stack: inLb(uniform(5)),
  },
};

/** The grid of a lift whose equipment the catalogue names, or null. A
 *  bodyweight lift has none of its own: its load goes on a belt
 *  (`loadGridFor`). `unit` is the lifter's kit (Lift18), from the plan's
 *  `settings.loadUnit`. */
const isKettlebell = (exerciseId: string | undefined) =>
  !!exerciseId && getExerciseById(exerciseId)?.equipment === "Kettlebell";

/**
 * A load as the lifter reads it on the lift's own kit (Lift18). Kettlebells
 * keep their kg sizes, and an lb lifter reads a bell in whole lb, as they
 * are labelled where lb is the unit: the 16 kg bell is 35 lb, not 35.3.
 * Every other load reads as `loadIn` gives it, so a load off the lb kit
 * still shows its tenth.
 */
export function kitLoadIn(
  kg: number,
  unit: LiftUnit,
  exerciseId: string | undefined
): number {
  return unit === "lbs" && isKettlebell(exerciseId)
    ? wholeLoadIn(kg, unit)
    : loadIn(kg, unit);
}

/** `kitLoadIn` with its unit: "35 lb", "132.3 lb", "60 kg". */
export function formatKitLoad(
  kg: number,
  unit: LiftUnit,
  exerciseId: string | undefined
): string {
  return `${kitLoadIn(kg, unit, exerciseId)} ${liftUnitLabel(unit)}`;
}

/**
 * A load typed in the lifter's unit, as the kg it is stored as. On a
 * kettlebell in lb, a whole number that names a bell is that bell: 35 is
 * the 16 kg bell, so a bell typed as it reads stays the bell, and the plan
 * steps to the next one rather than from 15.9 kg to 16. Any other number is
 * the exact kg it converts to.
 */
export function kitLoadToKg(
  value: number,
  unit: LiftUnit,
  exerciseId: string | undefined
): number {
  const kg = loadToKg(value, unit);
  if (unit !== "lbs" || !isKettlebell(exerciseId)) return kg;
  const bell = KETTLEBELLS.nearest(kg);
  return Math.abs(kgToLb(bell) - value) < 0.5 ? bell : kg;
}

export function equipmentGridFor(
  exerciseId: string | undefined,
  smallPlates: boolean,
  unit: LiftUnit = "kg"
): LoadGrid | null {
  const kit = KIT[unit];
  switch (exerciseId ? getExerciseById(exerciseId)?.equipment : undefined) {
    case "Barbell":
      return smallPlates ? kit.smallPlates : kit.plates;
    case "Dumbbells":
      return kit.dumbbells;
    case "Kettlebell":
      return kit.kettlebells;
    case "Machine":
    case "Cable Machine":
      return kit.stack;
    default:
      return null;
  }
}

/**
 * The grid a lift's weight moves on. A bodyweight lift's weight is the load
 * added to it (Pgm8 L6), as plates hung from a belt one at a time: a 2.5 kg
 * plate, or 1.25 kg with small plates, which mean a 1.25 kg step wherever
 * plates go.
 */
export function loadGridFor(
  exerciseId: string | undefined,
  smallPlates: boolean,
  unit: LiftUnit = "kg"
): LoadGrid {
  const grid = equipmentGridFor(exerciseId, smallPlates, unit);
  if (grid) return grid;
  const kit = KIT[unit];
  if (isBodyweightExerciseId(exerciseId))
    return smallPlates ? kit.smallPlates : kit.plates;
  return kit.stack;
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
