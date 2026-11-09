/**
 * The no-equipment setup: a person who owns nothing trains with their body,
 * the floor, a wall, a step and a sturdy table, and nothing else.
 *
 * "Minimal" stays what its copy says, some kit (`matchTemplate.ts` gives it
 * dumbbells), so the person with nothing has their own setup rather than a
 * redefined one: a minimal plan the person already has keeps its dumbbell
 * lifts.
 *
 * The catalogue's `equipment: "Bodyweight"` can't decide this alone. It
 * means "no load in the hand", and a third of those exercises still hang
 * from a bar, dip on bars or lie on a bench. So the setup names the ones it
 * allows, and `noEquipment.test.ts` holds every bodyweight exercise in the
 * catalogue to one list or the other, with what the other one needs: a
 * bodyweight exercise added later is a decision, not a default.
 */
import type { MovementCategory } from "@/lib/exerciseMovementCategory";
import type { MovementComplexity } from "./experienceModel";

/**
 * The exercises a person with no equipment can do. A sturdy table is the
 * one piece of furniture any of them needs: the inverted row is done under
 * one when there's no bar, which its guide says (`releasedFormPlacards.ts`).
 * A wall (the handstand push-up, a hand for balance) and a step (the calf
 * raise's heel drop) are in every home.
 */
export const NO_EQUIPMENT_EXERCISE_IDS: ReadonlySet<string> = new Set([
  "push-ups",
  "pike-push-up",
  "diamond-push-ups",
  "handstand-push-ups",
  "inverted-row",
  "bodyweight-squat",
  "bodyweight-lunge",
  "pistol-squat",
  "sissy-squat",
  "single-leg-calf-raise",
  "glute-bridge",
  "superman-hold",
  "plank",
  "side-plank",
  "dead-bug",
  "crunches",
  "bicycle-crunch",
  "toe-touches",
  "russian-twist",
  "mountain-climbers",
  "l-sit",
  "burpees",
]);

/**
 * The bodyweight exercises the setup leaves out, and what each needs. Read
 * by the tests that keep the two lists whole; the reason is for whoever
 * moves one.
 */
export const BODYWEIGHT_EXERCISES_NEEDING_KIT: Readonly<
  Record<string, string>
> = {
  "pull-ups": "a pull-up bar",
  "chin-ups": "a pull-up bar",
  "muscle-ups": "a pull-up bar or rings",
  "leg-raise": "a pull-up bar to hang from",
  dips: "parallel bars",
  "tricep-dips": "parallel bars",
  "weighted-chest-dip": "parallel bars and a weight",
  "bench-dips": "a bench",
  "decline-sit-up": "a decline bench",
  "dragon-flag": "a bench to hold",
  "weighted-push-ups": "a plate or a weighted vest",
  "weighted-plank": "a plate",
  "nordic-hamstring-curl": "a partner or a strap to hold the ankles",
};

/** One lift a no-equipment slot may take, at the level it asks for. */
export interface NoEquipmentOption {
  id: string;
  /** As the bank's (`variationBank.ts`): absent is simple. */
  complexity?: MovementComplexity;
}

/**
 * The lifts that stand in for a movement when its own pool in the bank has
 * none the person can do left on the day, in the order they're taken. The
 * equipment filter reaches for these only with no equipment, after the
 * bank's own lifts (`applyEquipmentFilterToWorkouts`), so the other setups
 * and their plans don't move.
 *
 * The pulls are the thin part. The inverted row is the one pull the floor
 * allows, so a pull day's second back lift is the superman hold: it holds
 * the upper back and the back extensors, not the lats, and it is the only
 * other back exercise in the catalogue that needs nothing. A curl needs
 * something to hold and a chin-up a bar, so a biceps slot takes the row
 * where the day has none and otherwise goes: the row works them already.
 */
export const NO_EQUIPMENT_STAND_INS: Readonly<
  Record<MovementCategory, readonly NoEquipmentOption[]>
> = {
  horizontal_push: [
    { id: "push-ups" },
    { id: "diamond-push-ups", complexity: "technical" },
  ],
  vertical_push: [
    { id: "pike-push-up" },
    { id: "handstand-push-ups", complexity: "advanced" },
  ],
  horizontal_pull: [{ id: "inverted-row" }, { id: "superman-hold" }],
  vertical_pull: [{ id: "inverted-row" }, { id: "superman-hold" }],
  knee_dominant: [
    { id: "bodyweight-squat" },
    { id: "bodyweight-lunge" },
    { id: "pistol-squat", complexity: "advanced" },
  ],
  hip_dominant: [{ id: "glute-bridge" }, { id: "superman-hold" }],
  arms_biceps: [{ id: "inverted-row" }],
  arms_triceps: [{ id: "diamond-push-ups", complexity: "technical" }],
  core: [
    { id: "plank" },
    { id: "dead-bug" },
    { id: "side-plank" },
    { id: "crunches" },
  ],
};

/**
 * The lifts a no-equipment slot takes when nothing in its own movement can
 * (`standInForMissingKit`), in order: holds and floor work that train the
 * trunk and hips, which no injury option rules out. A push day whose every
 * push a sore shoulder, elbow and wrist rule out is a session of these, not
 * an empty day.
 */
export const NO_EQUIPMENT_LAST_RESORT: readonly string[] = [
  "plank",
  "dead-bug",
  "glute-bridge",
  "side-plank",
  "crunches",
  "bodyweight-squat",
];
