/**
 * The first weight of every loaded catalogue lift the variation bank does not
 * list (training deep dive, D1). A lift's first weight is its movement
 * category's main-lift seed times a factor (`startingWeightForExercise`); the
 * bank holds the factor for the lifts the generator picks, and a lift outside
 * it took the main lift's whole seed. An 80 kg intermediate man who added a
 * lateral raise on Train was given 32.5 kg dumbbells, a leg extension 85 kg
 * and a treadmill 35 kg.
 *
 * Each row names the category the factor is read against, since the name
 * alone files some lifts wrongly (a farmer's carry is not core work, nor a
 * thruster). Dumbbell and kettlebell factors are per hand, as the bank's are
 * (`db-bench` is 0.35 of the bench). A factor of 0 starts the lift at no
 * added weight: conditioning, and a lift the body is the load for.
 *
 * The factors err light, as the bank's do: a light first set corrects itself
 * the next session, a heavy one costs a failed one. A lift the generator
 * places as an accessory took 0.3 before this table (the lateral raise, the
 * face pull, the leg extension, the calf raises), and keeps it, so a built
 * plan moves only where 0.3 was wrong: reverse flyes at 16 kg a hand.
 * `catalogueLoads.test.ts` walks the whole catalogue, so a loaded lift added
 * to it later without a row here fails a test instead of taking a main
 * lift's weight.
 */
import type { MovementCategory } from "@/lib/exerciseMovementCategory";

export interface CatalogueLoad {
  /** The category whose main lift the factor scales. */
  category: MovementCategory;
  /** Of that main lift's seed; per hand for dumbbells and kettlebells. */
  factor: number;
}

const load = (category: MovementCategory, factor: number): CatalogueLoad => ({
  category,
  factor,
});

export const CATALOGUE_LOADS: Readonly<Record<string, CatalogueLoad>> = {
  // Chest, against the bench press.
  "decline-bench": load("horizontal_push", 0.9),
  "decline-db-press": load("horizontal_push", 0.35),
  "smith-bench-press": load("horizontal_push", 0.85),
  "chest-press-machine": load("horizontal_push", 0.8),
  "db-flyes": load("horizontal_push", 0.15),
  "cable-crossover": load("horizontal_push", 0.2),
  "cable-fly": load("horizontal_push", 0.2),
  "pec-deck": load("horizontal_push", 0.5),
  "machine-chest-fly": load("horizontal_push", 0.5),

  // Back and rear shoulders, against the barbell row.
  "meadows-row": load("horizontal_pull", 0.4),
  "face-pulls": load("horizontal_pull", 0.3),
  "reverse-pec-deck": load("horizontal_pull", 0.3),
  "rear-delt-machine-fly": load("horizontal_pull", 0.3),
  "reverse-flyes": load("horizontal_pull", 0.1),
  // A shrug moves more than a row: the barbell one at about the row's
  // weight, the dumbbells at 0.4 a hand.
  shrugs: load("horizontal_pull", 0.4),
  "barbell-shrug": load("horizontal_pull", 0.9),

  // Shoulders, against the overhead press.
  "shoulder-press-machine": load("vertical_push", 0.9),
  "smith-shoulder-press": load("vertical_push", 0.9),
  "barbell-upright-row": load("vertical_push", 0.8),
  "lateral-raise": load("vertical_push", 0.3),
  "front-raise": load("vertical_push", 0.25),
  "cable-lateral-raise": load("vertical_push", 0.15),
  "cuban-press": load("vertical_push", 0.15),
  "lu-raise": load("vertical_push", 0.1),
  // Pressed overhead after the pull or the squat, so the press sets them.
  "clean-and-press": load("vertical_push", 0.8),
  thrusters: load("vertical_push", 0.8),
  "man-maker": load("vertical_push", 0.3),
  "turkish-get-up": load("vertical_push", 0.45),

  // Biceps, against the barbell curl.
  "ez-bar-curl": load("arms_biceps", 1),
  "reverse-barbell-curl": load("arms_biceps", 0.75),
  "bayesian-cable-curl": load("arms_biceps", 0.4),
  "incline-db-curl": load("arms_biceps", 0.35),
  "zottman-curl": load("arms_biceps", 0.35),
  "concentration-curl": load("arms_biceps", 0.35),
  "spider-db-curl": load("arms_biceps", 0.35),

  // Triceps, against the rope pushdown. The JM press is a barbell press, so
  // it is heavier than the pushdown it is measured against.
  "overhead-cable-tricep-extension": load("arms_triceps", 0.9),
  "reverse-grip-cable-pushdown": load("arms_triceps", 0.8),
  "single-arm-cable-pushdown": load("arms_triceps", 0.45),
  "jm-press": load("arms_triceps", 2),

  // Legs, against the squat.
  "smith-machine-squat": load("knee_dominant", 0.85),
  "zercher-squat": load("knee_dominant", 0.7),
  "landmine-squat": load("knee_dominant", 0.35),
  "barbell-step-ups": load("knee_dominant", 0.35),
  lunges: load("knee_dominant", 0.2),
  "walking-dumbbell-lunges": load("knee_dominant", 0.2),
  "leg-extension": load("knee_dominant", 0.3),
  "calf-raise": load("knee_dominant", 0.3),
  "standing-calf-raise": load("knee_dominant", 0.3),
  "donkey-calf-raise": load("knee_dominant", 0.3),
  "seated-calf-raise": load("knee_dominant", 0.3),
  "sled-push-pull": load("knee_dominant", 0.5),

  // Hips, against the deadlift.
  "kettlebell-swing": load("hip_dominant", 0.2),
  "farmers-carry": load("hip_dominant", 0.3),
  "hip-abduction-machine": load("hip_dominant", 0.35),
  "hip-adduction-machine": load("hip_dominant", 0.35),
  "cable-glute-kickback": load("hip_dominant", 0.1),
  // The body is the load, as for the Nordic curl in the bank.
  "glute-ham-raise": load("hip_dominant", 0),

  // Core, against the cable crunch.
  "cable-woodchopper": load("core", 0.4),

  // Conditioning: no weight to start from.
  "battle-ropes": load("core", 0),
  "box-jumps": load("core", 0),
  "jump-rope": load("core", 0),
  treadmill: load("core", 0),
  "incline-treadmill-walk": load("core", 0),
  elliptical: load("core", 0),
  "rowing-machine": load("core", 0),
  stairmaster: load("core", 0),
  bike: load("core", 0),
  "spin-bike": load("core", 0),
  "assault-bike": load("core", 0),
  "ski-erg": load("core", 0),
  swimming: load("core", 0),
};

/** The row for a lift the bank does not list, or undefined. */
export function catalogueLoadFor(
  exerciseId: string | undefined
): CatalogueLoad | undefined {
  return exerciseId ? CATALOGUE_LOADS[exerciseId] : undefined;
}
