/**
 * The no-equipment setup: a person who owns nothing trains on the floor,
 * with their bodyweight alone. No bar, no bench, no table, no chair.
 *
 * What a person has decides which moves exist, and pulling needs something
 * to pull on. So a no-equipment plan has no pull, as Insanity, T25, Nike
 * Training Club's no-equipment workouts and Seven have none: its back work
 * is the superman hold, and setup says so where the setup is chosen. A
 * doorway pull-up bar adds pulling: the setup asks "A pull-up bar", off
 * until the person turns it on, and with it the plan takes pull-ups,
 * chin-ups and the hanging leg raise (`ownedKit` in `matchTemplate.ts`)
 * and has its Pull days (`plansNoPull`).
 *
 * The list below stays floor moves whatever the bar answer: the bar's
 * three are added beside it, not to it, so a circuit drawn from the floor
 * list (Circ1) stays on the floor.
 *
 * "Minimal" stays what its copy says, some kit (`matchTemplate.ts` gives it
 * dumbbells), so the person with nothing has their own setup rather than a
 * redefined one: a minimal plan the person already has keeps its dumbbell
 * lifts.
 *
 * The catalogue's `equipment: "Bodyweight"` can't decide this alone. It
 * means "no load in the hand", and a third of those exercises still hang
 * from a bar, dip on bars, lie on a bench or lean on a wall. So the setup
 * names the ones it allows, and `noEquipment.test.ts` holds every
 * bodyweight exercise in the catalogue to one list or the other, with what
 * the other one needs: a bodyweight exercise added later is a decision, not
 * a default.
 */
import type { MovementCategory } from "@/lib/exerciseMovementCategory";
import type { MovementComplexity } from "./experienceModel";
import type { ProgramExercise, WorkoutDay } from "./programTypes";
import { plansNoPull } from "./programLabels";

/** The exercises a person with no equipment can do: floor moves. */
export const NO_EQUIPMENT_EXERCISE_IDS: ReadonlySet<string> = new Set([
  "push-ups",
  "pike-push-up",
  "diamond-push-ups",
  "bodyweight-squat",
  "bodyweight-lunge",
  "pistol-squat",
  // Its guide stands on a step's edge for range; flat on the floor is the
  // same move, shorter.
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
  "inverted-row": "a bar at waist height",
  dips: "parallel bars",
  "tricep-dips": "parallel bars",
  "weighted-chest-dip": "parallel bars and a weight",
  "bench-dips": "a bench",
  "decline-sit-up": "a decline bench",
  "dragon-flag": "a bench to hold",
  "weighted-push-ups": "a plate or a weighted vest",
  "weighted-plank": "a plate",
  "nordic-hamstring-curl": "a partner or a strap to hold the ankles",
  "handstand-push-ups": "a wall to kick up against",
  "sissy-squat": "something solid to hold",
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
 * A pull slot takes the superman hold, the back work the floor allows: it
 * holds the back extensors and the upper back, and trains no pull. A curl
 * has nothing to hold, so a biceps slot goes.
 */
export const NO_EQUIPMENT_STAND_INS: Readonly<
  Record<MovementCategory, readonly NoEquipmentOption[]>
> = {
  horizontal_push: [
    { id: "push-ups" },
    { id: "diamond-push-ups", complexity: "technical" },
  ],
  vertical_push: [{ id: "pike-push-up" }],
  horizontal_pull: [{ id: "superman-hold" }],
  vertical_pull: [{ id: "superman-hold" }],
  knee_dominant: [
    { id: "bodyweight-squat" },
    { id: "bodyweight-lunge" },
    { id: "pistol-squat", complexity: "advanced" },
  ],
  hip_dominant: [{ id: "glute-bridge" }, { id: "superman-hold" }],
  arms_biceps: [],
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

/**
 * What a no-equipment plan can't train, said once under the "A pull-up
 * bar" switch where the setup is chosen (setup's equipment step, Settings
 * → Programme): with the switch off, that the switch adds the pull.
 */
export const NO_EQUIPMENT_PULL_NOTE =
  "No pulling without something to pull on. Have a doorway pull-up bar? Turn it on above.";

/**
 * With the bar on, a beginner's plan still has no pull: pull-ups and
 * chin-ups aren't a beginner's (`offerableTo`), so the note says why the
 * switch changed nothing.
 */
export const NO_EQUIPMENT_BEGINNER_BAR_NOTE =
  "A beginner's plan has no pull-ups, so your back work is the superman hold.";

/**
 * The note a no-equipment setup shows under its bar switch, or none: a
 * plan with its pull says nothing. Setup asks the level after the kit, so
 * an unknown level (undefined) says nothing about the bar until it's
 * chosen.
 */
export function noEquipmentPullNote(
  equipment: string | undefined,
  pullUpBar: boolean | undefined,
  experience: string | undefined
): string | null {
  if (!plansNoPull(equipment, pullUpBar, experience)) return null;
  if (pullUpBar !== true) return NO_EQUIPMENT_PULL_NOTE;
  return experience === undefined ? null : NO_EQUIPMENT_BEGINNER_BAR_NOTE;
}

/** The most sets of the superman hold in one session. */
export const SUPERMAN_SETS_PER_SESSION = 3;
/** About the most sets of the superman hold in a week. */
export const SUPERMAN_SETS_PER_WEEK = 6;
const SUPERMAN = "superman-hold";

/**
 * The superman hold's sets: at most 3 in a session and about 6 in a week.
 * A floor plan meets it on most days, as an upper day's back work, a
 * full-body day's pull and a lower day's second hinge, and a hold keeps
 * the sets of the slot it took (a row's four), so a week could hold ten
 * or more sets of one lower-back hold.
 *
 * Over the week's budget, the holds are kept first where they're the day's
 * back work (a day with no other hinge), then in day order, and share the
 * budget evenly. In a new plan (`drop`) only as many are kept as can have
 * two sets each, and the rest go from days that keep another lift. In a
 * plan the person has, each keeps its slot, with a set at the least, so
 * the kit coming back still brings back what it replaced
 * (`restoreSwappedLifts`). `cap` picks the holds this may change; the rest
 * count towards the week as they are.
 */
export function capSupermanVolume(
  workouts: readonly WorkoutDay[],
  options: {
    drop: boolean;
    cap?: (dayIndex: number, exerciseIndex: number) => boolean;
  }
): WorkoutDay[] {
  const out = workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({ ...ex })),
  }));
  const setSets = (ex: ProgramExercise, sets: number) => {
    ex.sets = sets;
    if (ex.baseSets !== undefined) ex.baseSets = sets;
  };
  const holds: { day: number; ex: ProgramExercise; backWork: boolean }[] = [];
  let fixed = 0;
  out.forEach((day, d) =>
    day.exercises.forEach((ex, e) => {
      if (ex.exerciseId !== SUPERMAN) return;
      if (options.cap && !options.cap(d, e)) {
        fixed += ex.sets;
        return;
      }
      setSets(ex, Math.min(ex.sets, SUPERMAN_SETS_PER_SESSION));
      holds.push({
        day: d,
        ex,
        backWork: !day.exercises.some(
          (other) => other !== ex && other.movementCategory === "hip_dominant"
        ),
      });
    })
  );
  const budget = Math.max(0, SUPERMAN_SETS_PER_WEEK - fixed);
  const total = holds.reduce((sum, h) => sum + h.ex.sets, 0);
  if (holds.length === 0 || total <= budget) return out;
  // The day's back work first, then day order.
  const order = [...holds].sort(
    (a, b) => Number(b.backWork) - Number(a.backWork) || a.day - b.day
  );
  const keep = options.drop
    ? order.slice(0, Math.max(1, Math.floor(budget / 2)))
    : order;
  const each = Math.max(1, Math.floor(budget / keep.length));
  const extra = Math.max(0, budget - each * keep.length);
  keep.forEach((h, i) =>
    setSets(h.ex, Math.min(h.ex.sets, each + (i < extra ? 1 : 0)))
  );
  const gone = new Set(order.slice(keep.length).map((h) => h.ex));
  if (gone.size === 0) return out;
  return out.map((day) => {
    const left = day.exercises.filter((ex) => !gone.has(ex));
    if (left.length === day.exercises.length) return day;
    if (left.length > 0) return { ...day, exercises: left };
    // A day of nothing but the hold keeps it, at one set.
    for (const ex of day.exercises) setSets(ex, 1);
    return day;
  });
}
