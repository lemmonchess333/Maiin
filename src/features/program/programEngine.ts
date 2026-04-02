import type {
  Goal,
  MovementCategory,
  ProgramExercise,
  ProgramState,
  SplitType,
  WorkoutDay,
  WeeklyPrescription,
} from "./programTypes";
import { pickExercise, pickAccessory } from "./variationBank";
import { format } from "date-fns";

/* ================================
   E1RM CALCULATION
================================ */

export function calculateE1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/* ================================
   WEEKLY PRESCRIPTION
================================ */

export function generateWeekPrescription(week: number): WeeklyPrescription {
  if (week % 4 === 0) {
    return { week, intensityMultiplier: 0.85, volumeModifier: 0.7, deload: true };
  }
  return {
    week,
    intensityMultiplier: 1 + (week % 4) * 0.025,
    volumeModifier: 1,
    deload: false,
  };
}

/* ================================
   GOAL ADJUSTMENTS
================================ */

function goalVolumeMultiplier(goal: Goal): number {
  switch (goal) {
    case "cut": return 0.9;
    case "lean bulk": return 1.12;
    case "recomp": return 1.0;
  }
}

function goalWeightBonus(goal: Goal): number {
  switch (goal) {
    case "lean bulk": return 1.25;
    default: return 0;
  }
}

/* ================================
   SPLIT SELECTION
================================ */

export function chooseSplit(weeklyTarget: number): SplitType {
  if (weeklyTarget <= 0) return "full_body"; // run-only athlete — no lift days
  const clamped = Math.min(7, weeklyTarget);
  if (clamped === 1) return "full_body";
  if (clamped === 2) return "upper_lower";
  if (clamped === 3) return "ppl";
  if (clamped === 4) return "upper_lower";
  if (clamped === 5) return "ppl_ul";
  if (clamped === 6) return "ppl_x2";
  return "ppl_x2_fb";
}

export function splitLabel(split: SplitType): string {
  switch (split) {
    case "full_body": return "Full Body";
    case "upper_lower": return "Upper / Lower";
    case "ppl": return "Push / Pull / Legs";
    case "ppl_ul": return "Push / Pull / Legs + Upper / Lower";
    case "ppl_x2": return "Push / Pull / Legs ×2";
    case "ppl_x2_fb": return "Push / Pull / Legs ×2 + Full Body";
  }
}

/* ================================
   EXERCISE BUILDER HELPER
================================ */

function makeExercise(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  progression: "double" | "linear",
  existing?: ProgramExercise,
): ProgramExercise {
  const ex = pickExercise(category, existing?.plateauCount ?? 0, existing?.exerciseId);
  const w = existing?.weight ?? weight;
  return {
    name: ex.name,
    exerciseId: ex.id,
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight: w,
    progressionType: progression,
    lastSuccessfulWeight: existing?.lastSuccessfulWeight ?? w,
    lastAttemptedWeight: existing?.lastAttemptedWeight ?? w,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    plateauCount: existing?.plateauCount ?? 0,
    performanceHistory: existing?.performanceHistory ?? [],
    lastPerformance: existing?.lastPerformance ?? null,
  };
}

function makeAccessory(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  excludeId?: string,
): ProgramExercise {
  const ex = pickAccessory(category, excludeId);
  return {
    name: ex.name,
    exerciseId: ex.id,
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight,
    progressionType: "linear",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

/* ================================
   SPLIT TEMPLATES
================================ */

function buildFullBody(goal: Goal, count: number, existing?: WorkoutDay[]): WorkoutDay[] {
  const vm = goalVolumeMultiplier(goal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];

  const dayA: WorkoutDay = {
    dayName: "Full Body A",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise("horizontal_push", round(3 * vm), 6, 60, "double", findExisting(0, 0)),
      makeExercise("knee_dominant", round(3 * vm), 6, 80, "double", findExisting(0, 1)),
      makeExercise("vertical_pull", round(3 * vm), 8, 0, "double", findExisting(0, 2)),
      makeExercise("hip_dominant", round(3 * vm), 8, 60, "linear", findExisting(0, 3)),
      makeExercise("core", round(2 * vm), 12, 15, "linear", findExisting(0, 4)),
    ],
  };

  if (count === 1) return [dayA];

  const dayB: WorkoutDay = {
    dayName: "Full Body B",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise("vertical_push", round(3 * vm), 6, 40, "double", findExisting(1, 0)),
      makeExercise("hip_dominant", round(3 * vm), 6, 80, "double", findExisting(1, 1)),
      makeExercise("horizontal_pull", round(3 * vm), 8, 50, "double", findExisting(1, 2)),
      makeExercise("knee_dominant", round(3 * vm), 10, 60, "linear", findExisting(1, 3)),
      makeExercise("arms_biceps", round(2 * vm), 12, 10, "linear", findExisting(1, 4)),
    ],
  };

  return [dayA, dayB];
}

function buildUpperLower(goal: Goal, existing?: WorkoutDay[]): WorkoutDay[] {
  const vm = goalVolumeMultiplier(goal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];

  return [
    {
      dayName: "Upper A",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise("horizontal_push", round(4 * vm), 6, 60, "double", findExisting(0, 0)),
        makeExercise("horizontal_pull", round(4 * vm), 6, 60, "double", findExisting(0, 1)),
        makeExercise("vertical_push", round(3 * vm), 10, 30, "linear", findExisting(0, 2)),
        makeExercise("arms_biceps", round(3 * vm), 12, 12, "linear", findExisting(0, 3)),
        makeExercise("arms_triceps", round(3 * vm), 12, 15, "linear", findExisting(0, 4)),
      ],
    },
    {
      dayName: "Lower A",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise("knee_dominant", round(4 * vm), 6, 80, "double", findExisting(1, 0)),
        makeExercise("hip_dominant", round(4 * vm), 6, 80, "double", findExisting(1, 1)),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeExercise("core", round(3 * vm), 12, 15, "linear", findExisting(1, 3)),
      ],
    },
    {
      dayName: "Upper B",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise("vertical_push", round(4 * vm), 6, 40, "double", findExisting(2, 0)),
        makeExercise("vertical_pull", round(4 * vm), 6, 0, "double", findExisting(2, 1)),
        makeAccessory("horizontal_push", round(3 * vm), 10, 30, "bench-press"),
        makeExercise("arms_biceps", round(3 * vm), 12, 10, "linear", findExisting(2, 3)),
        makeExercise("arms_triceps", round(3 * vm), 12, 12, "linear", findExisting(2, 4)),
      ],
    },
    {
      dayName: "Lower B",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise("hip_dominant", round(4 * vm), 6, 80, "double", findExisting(3, 0)),
        makeAccessory("knee_dominant", round(3 * vm), 10, 50, "squat"),
        makeAccessory("hip_dominant", round(3 * vm), 12, 40, "deadlift"),
        makeExercise("core", round(3 * vm), 12, 15, "linear", findExisting(3, 3)),
      ],
    },
  ];
}

function buildPPL(goal: Goal, existing?: WorkoutDay[]): WorkoutDay[] {
  const vm = goalVolumeMultiplier(goal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];

  return [
    {
      dayName: "Push A",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise("horizontal_push", round(4 * vm), 6, 60, "double", findExisting(0, 0)),
        makeExercise("vertical_push", round(3 * vm), 10, 30, "linear", findExisting(0, 1)),
        makeAccessory("horizontal_push", round(3 * vm), 12, 30, "bench-press"),
        makeExercise("arms_triceps", round(3 * vm), 12, 15, "linear", findExisting(0, 3)),
        makeAccessory("arms_triceps", round(3 * vm), 15, 10, "rope-tricep-pushdown"),
      ],
    },
    {
      dayName: "Pull A",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise("vertical_pull", round(4 * vm), 6, 0, "double", findExisting(1, 0)),
        makeExercise("horizontal_pull", round(3 * vm), 10, 50, "linear", findExisting(1, 1)),
        makeAccessory("vertical_pull", round(3 * vm), 12, 40, "pull-ups"),
        makeExercise("arms_biceps", round(3 * vm), 12, 12, "linear", findExisting(1, 3)),
        makeAccessory("arms_biceps", round(3 * vm), 15, 8, "barbell-curl"),
      ],
    },
    {
      dayName: "Legs",
      dayType: "legs",
      completed: false,
      exercises: [
        makeExercise("knee_dominant", round(4 * vm), 6, 80, "double", findExisting(2, 0)),
        makeExercise("hip_dominant", round(4 * vm), 6, 80, "double", findExisting(2, 1)),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeAccessory("hip_dominant", round(3 * vm), 12, 40, "deadlift"),
        makeExercise("core", round(3 * vm), 15, 15, "linear", findExisting(2, 4)),
      ],
    },
    {
      dayName: "Push B",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise("vertical_push", round(4 * vm), 6, 40, "double", findExisting(3, 0)),
        makeAccessory("horizontal_push", round(3 * vm), 10, 40, "bench-press"),
        makeAccessory("vertical_push", round(3 * vm), 12, 20, "overhead-press"),
        makeExercise("arms_triceps", round(3 * vm), 12, 15, "linear", findExisting(3, 3)),
      ],
    },
    {
      dayName: "Pull B",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise("horizontal_pull", round(4 * vm), 6, 60, "double", findExisting(4, 0)),
        makeAccessory("vertical_pull", round(3 * vm), 10, 40, "pull-ups"),
        makeAccessory("horizontal_pull", round(3 * vm), 12, 30, "barbell-row"),
        makeExercise("arms_biceps", round(3 * vm), 12, 10, "linear", findExisting(4, 3)),
      ],
    },
  ];
}

/** Legs B — flipped emphasis from Legs A.
 *  Legs A leads with squat (knee), Legs B leads with deadlift (hip).
 *  Accessories also swap order for different training stimulus. */
function buildLegsB(goal: Goal, existing?: WorkoutDay[]): WorkoutDay {
  const vm = goalVolumeMultiplier(goal);
  const round = (n: number) => Math.max(1, Math.round(n));
  // Use index 5 for existing exercises (Legs B is the 6th workout day)
  const findExisting = (exIdx: number) => existing?.[5]?.exercises[exIdx];

  return {
    dayName: "Legs B",
    dayType: "legs",
    completed: false,
    exercises: [
      // Flipped: hip-dominant leads
      makeExercise("hip_dominant", round(4 * vm), 6, 80, "double", findExisting(0)),
      makeExercise("knee_dominant", round(4 * vm), 8, 60, "double", findExisting(1)),
      // Accessories in reversed order with different rep ranges
      makeAccessory("hip_dominant", round(3 * vm), 10, 40, "deadlift"),
      makeAccessory("knee_dominant", round(3 * vm), 10, 40, "squat"),
      makeExercise("core", round(3 * vm), 12, 15, "linear", findExisting(4)),
    ],
  };
}

/* ================================
   GENERATE FULL PROGRAM
================================ */

export function generateProgram(
  goal: Goal,
  weeklyTarget: number,
  existingWorkouts?: WorkoutDay[],
): { splitType: SplitType; workouts: WorkoutDay[] } {
  // 0 lift days → run-only athlete, return empty workouts
  if (weeklyTarget <= 0) {
    return { splitType: "full_body", workouts: [] };
  }

  const splitType = chooseSplit(weeklyTarget);
  let workouts: WorkoutDay[];

  switch (splitType) {
    case "full_body":
      workouts = buildFullBody(goal, Math.min(weeklyTarget, 2), existingWorkouts);
      break;
    case "ppl":
      workouts = buildPPL(goal, existingWorkouts).slice(0, 3);
      break;
    case "upper_lower": {
      const ul = buildUpperLower(goal, existingWorkouts);
      // 2-day uses first upper + first lower only
      workouts = weeklyTarget <= 2 ? ul.slice(0, 2) : ul;
      break;
    }
    case "ppl_ul":
      workouts = [
        ...buildPPL(goal, existingWorkouts).slice(0, 3),
        ...buildUpperLower(goal, existingWorkouts).slice(0, 2),
      ];
      break;
    case "ppl_x2": {
      const ppl = buildPPL(goal, existingWorkouts);
      workouts = [...ppl, buildLegsB(goal, existingWorkouts)];
      break;
    }
    case "ppl_x2_fb": {
      const ppl7 = buildPPL(goal, existingWorkouts);
      const fb = buildFullBody(goal, 1, existingWorkouts);
      workouts = [
        ...ppl7,
        buildLegsB(goal, existingWorkouts),
        {
          ...fb[0],
          dayName: "Full Body (Recovery)",
          completed: false,
          exercises: fb[0].exercises.map(ex => ({ ...ex })),
        },
      ];
      break;
    }
    default:
      workouts = buildUpperLower(goal, existingWorkouts);
  }

  return { splitType, workouts };
}

/* ================================
   EXERCISE-SPECIFIC PROGRESSION
================================ */

export function applyProgression(
  exercise: ProgramExercise,
  actualReps: number,
  actualWeight: number,
  goal: Goal,
  microloading: boolean,
): ProgramExercise {
  const today = format(new Date(), "yyyy-MM-dd");
  const record = { date: today, weight: actualWeight, repsCompleted: actualReps, repsTarget: exercise.reps };
  const history = [...(exercise.performanceHistory || []), record].slice(-10);

  const updated: ProgramExercise = {
    ...exercise,
    lastAttemptedWeight: actualWeight,
    performanceHistory: history,
    lastPerformance: {
      sets: exercise.sets,
      reps: actualReps,
      weight: actualWeight,
      completed: actualReps >= exercise.reps,
    },
  };

  const completed = actualReps >= exercise.reps && actualWeight >= exercise.weight;

  const isBodyweight = exercise.weight === 0;
  const resetReps = exercise.baseReps ?? exercise.reps; // anchor to original prescription

  if (exercise.progressionType === "double") {
    if (completed) {
      // True double progression: accumulate reps until ceiling, then increase weight
      if (actualReps >= exercise.reps + 2) {
        if (isBodyweight) {
          // Bodyweight: progress via rep target increase
          updated.reps = exercise.reps + 1;
        } else {
          // Weighted: increase weight and reset reps to base prescription
          updated.weight = exercise.weight + 2.5 + goalWeightBonus(goal);
          updated.reps = resetReps;
        }
      }
      // Otherwise: success recorded but reps still accumulating toward ceiling
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;

      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          // Bodyweight deload: reduce rep target (minimum 4)
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.round((exercise.weight * 0.95) * 2) / 2;
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  } else {
    if (completed) {
      if (isBodyweight) {
        // Bodyweight linear: increase rep target when exceeding by 2
        if (actualReps >= exercise.reps + 2) {
          updated.reps = exercise.reps + 1;
        }
      } else if (microloading) {
        updated.weight = exercise.weight + 1;
      } else {
        if (actualReps >= exercise.reps + 2) {
          updated.weight = exercise.weight + 2.5;
          updated.reps = resetReps; // reset to original prescription, not drifted value
        }
      }
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;
      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.max(0, exercise.weight - 1);
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  }

  return updated;
}

/* ================================
   PROGRESSION DIRECTION (for UI)
================================ */

export type ProgressionDirection = "up" | "down" | "stable";

export function getProgressionDirection(ex: ProgramExercise): ProgressionDirection {
  if (!ex.lastAttemptedWeight || ex.lastAttemptedWeight === 0) return "stable";
  if (ex.weight > ex.lastAttemptedWeight) return "up";
  if (ex.weight < ex.lastAttemptedWeight) return "down";
  return "stable";
}

export function getProgressionLabel(ex: ProgramExercise): string {
  const dir = getProgressionDirection(ex);
  const w = ex.weight > 0 ? `${ex.weight}kg` : "BW";

  if (dir === "up" && ex.lastAttemptedWeight && ex.weight > ex.lastAttemptedWeight) return `${w} ↑`;
  if (dir === "down") return `${w} ↓`;
  return w;
}

/* ================================
   FATIGUE / DELOAD / ADVANCEMENT
================================ */

export function applyFatigue(
  workouts: WorkoutDay[],
  fatigueScore: number,
): WorkoutDay[] {
  if (fatigueScore <= 20) return workouts;
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, Math.round(ex.sets * 0.9)),
    })),
  }));
}

export function applyDeload(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, ex.sets - 1),
      // Bodyweight exercises (weight=0): reduce sets only, no weight change
      // Weighted: round to 2.5kg increments (standard plate size)
      weight: ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
    })),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed || day.skipped);
}

export function advanceWeek(state: ProgramState): ProgramState {
  // Cap at 52 weeks (1 year) then recycle — the 4-week periodization cycle
  // continues via modulo, but the number stays meaningful for UI display
  const nextWeek = state.weekNumber >= 52 ? 1 : state.weekNumber + 1;
  const prescription = generateWeekPrescription(nextWeek);

  const snapshot = { weekNumber: state.weekNumber, workouts: state.workouts };
  const history = [...(state.weekHistory ?? []), snapshot].slice(-8);

  let workouts = state.workouts.map((day) => ({ ...day, completed: false }));

  if (prescription.deload) {
    workouts = applyDeload(workouts);
  } else {
    // Only apply fatigue on non-deload weeks to avoid double volume reduction
    workouts = applyFatigue(workouts, state.fatigueScore);
  }

  return {
    ...state,
    weekNumber: nextWeek,
    currentPhase: prescription.deload ? "deload" : "progression",
    workouts,
    weekHistory: history,
    updatedAt: Date.now(),
    nextWorkoutOverride: undefined,
  };
}