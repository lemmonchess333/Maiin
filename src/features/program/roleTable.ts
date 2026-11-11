import { getExerciseById } from "@/lib/exercises";
import { exerciseRole, type ExerciseRole } from "./exerciseRole";
import { toExperience, type Experience } from "./experienceModel";
import type { PrimaryGoal } from "./programTypes";

/**
 * The sets and reps a plan gives each lift, by its role, the goal and the
 * level (Lift4 (5)). A range is climbed a rep at a time to its top before the
 * weight steps; a target with no top is fixed and steps whenever every set
 * reaches it.
 *
 *                     main lifts        other compounds   isolations
 *   Build muscle      6–10 (beg. 8)     8–12              10–15, or 12–20
 *                                                         for calves, side
 *                                                         delts and abs
 *   Get stronger      5                 6–10              8–12
 *   General fitness   8–12 (beg. 8)     8–12              10–15
 *   Support running   5                 6–10              8–12
 *
 * Three sets by default; a beginner's main lifts three and everything else
 * two; four on a strength main lift from intermediate up. "Lose fat" builds
 * as Build muscle, with the cut in the nutrition targets. Timed holds keep
 * their seconds and are not read here.
 *
 * A deadlift from the floor is its own row (Lift21): the main lift's in any
 * slot, and past beginner three sets at most, 5–8 wherever the goal gives a
 * range. Sets of 8 to 12 on it end on a tired back.
 */
export interface RoleReps {
  sets: number;
  bottom: number;
  /** The top of the range; absent for a fixed target. */
  top?: number;
}

type TableGoal = "hypertrophy" | "strength" | "general" | "running";

const ROLE_TABLE: Record<
  TableGoal,
  Record<ExerciseRole, { bottom: number; top?: number }>
> = {
  hypertrophy: {
    main: { bottom: 6, top: 10 },
    compound: { bottom: 8, top: 12 },
    isolation: { bottom: 10, top: 15 },
  },
  strength: {
    main: { bottom: 5 },
    compound: { bottom: 6, top: 10 },
    isolation: { bottom: 8, top: 12 },
  },
  general: {
    main: { bottom: 8, top: 12 },
    compound: { bottom: 8, top: 12 },
    isolation: { bottom: 10, top: 15 },
  },
  running: {
    main: { bottom: 5 },
    compound: { bottom: 6, top: 10 },
    isolation: { bottom: 8, top: 12 },
  },
};

/** Build muscle's isolations that take 12–20: calves, side delts and abs. */
const HIGH_REP_MUSCLE_GROUPS: ReadonlySet<string> = new Set([
  "Calves",
  "Side Delts",
  "Abs",
  "Lower Abs",
  "Obliques",
  "Core",
]);

function tableGoal(goal: PrimaryGoal | undefined): TableGoal {
  if (goal === "fat_loss") return "hypertrophy";
  return goal === "hypertrophy" || goal === "strength" || goal === "running"
    ? goal
    : "general";
}

/** The table's row for one role. Pure, so the server's copy can match it. */
export function roleReps(
  goal: PrimaryGoal | undefined,
  role: ExerciseRole,
  experience: Experience | undefined,
  highRepIsolation: boolean
): RoleReps {
  const g = tableGoal(goal);
  const beginner = toExperience(experience) === "beginner";
  let reps = ROLE_TABLE[g][role];
  if (role === "main" && beginner && reps.top !== undefined) {
    reps = { bottom: 8 };
  }
  if (g === "hypertrophy" && role === "isolation" && highRepIsolation) {
    reps = { bottom: 12, top: 20 };
  }
  const sets =
    role === "main"
      ? g === "strength" && !beginner
        ? 4
        : 3
      : beginner
        ? 2
        : 3;
  return { sets, ...reps };
}

/** Whether an isolation trains a muscle that takes 12–20 in Build muscle. */
export function isHighRepIsolation(exerciseId: string): boolean {
  const muscle = getExerciseById(exerciseId)?.muscleGroup;
  return muscle !== undefined && HIGH_REP_MUSCLE_GROUPS.has(muscle);
}

/** The deadlifts pulled from the floor, which take a row of their own. The
 *  server keeps the same list (`functions/lib/roleTable.js`). */
export const FLOOR_DEADLIFT_IDS: readonly string[] = [
  "deadlift",
  "sumo-deadlift",
  "trap-bar-deadlift",
];

/** Whether a lift is a deadlift pulled from the floor. */
export function isFloorDeadlift(exerciseId: string): boolean {
  return FLOOR_DEADLIFT_IDS.includes(exerciseId);
}

/** Whether a lift is a floor deadlift held as a main lift. */
export function isMainFloorDeadlift(exercise: {
  exerciseId: string;
  isAccessory?: boolean;
}): boolean {
  return exercise.isAccessory !== true && isFloorDeadlift(exercise.exerciseId);
}

/**
 * The table's row for one exercise. A floor deadlift takes the main-lift
 * row in any slot, and past beginner 3 sets of 5 to 8 at most (Lift21): it
 * is never a supporting lift's 8 to 12, and a fourth set of it costs more
 * than it gives.
 */
export function roleRepsFor(
  goal: PrimaryGoal | undefined,
  exercise: { exerciseId: string; isAccessory?: boolean },
  experience: Experience | undefined
): RoleReps {
  const floor = isFloorDeadlift(exercise.exerciseId);
  const row = roleReps(
    goal,
    floor ? "main" : exerciseRole(exercise),
    experience,
    isHighRepIsolation(exercise.exerciseId)
  );
  if (!floor || toExperience(experience) === "beginner") return row;
  return row.top === undefined
    ? { ...row, sets: Math.min(row.sets, 3) }
    : { sets: Math.min(row.sets, 3), bottom: 5, top: 8 };
}

/** The reps a whole plan's starting loads are estimated for: its main
 *  lifts' bottom (`seedStartingLoads`). */
export function mainRepAnchor(
  goal: PrimaryGoal | undefined,
  experience: Experience | undefined
): number {
  return roleReps(goal, "main", experience, false).bottom;
}
