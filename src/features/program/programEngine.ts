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
  return weeklyTarget >= 5 ? "ppl" : "upper_lower";
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

/* ================================
   GENERATE FULL PROGRAM
================================ */

export function generateProgram(
  goal: Goal,
  weeklyTarget: number,
  existingWorkouts?: WorkoutDay[],
): { splitType: SplitType; workouts: WorkoutDay[] } {
  const splitType = chooseSplit(weeklyTarget);
  const workouts = splitType === "ppl"
    ? buildPPL(goal, existingWorkouts)
    : buildUpperLower(goal, existingWorkouts);
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

  if (exercise.progressionType === "double") {
    if (completed) {
      updated.weight = exercise.weight + 2.5 + goalWeightBonus(goal);
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;

      if (updated.consecutiveFailures >= 2) {
        updated.weight = Math.round((exercise.weight * 0.95) * 2) / 2;
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  } else {
    if (completed) {
      if (microloading) {
        updated.weight = exercise.weight + 1;
      } else {
        if (actualReps >= exercise.reps + 2) {
          updated.weight = exercise.weight + 2.5;
          updated.reps = exercise.reps;
        }
      }
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;
      if (updated.consecutiveFailures >= 3) {
        updated.weight = Math.max(0, exercise.weight - 1);
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

  if (dir === "up") return `${w} ↑`;
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
      weight: Math.round((ex.weight * 0.85) * 2) / 2,
    })),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed);
}

export function advanceWeek(state: ProgramState): ProgramState {
  const nextWeek = state.weekNumber + 1;
  const prescription = generateWeekPrescription(nextWeek);

  const snapshot = { weekNumber: state.weekNumber, workouts: state.workouts };
  const history = [...(state.weekHistory ?? []), snapshot].slice(-8);

  let workouts = state.workouts.map((day) => ({ ...day, completed: false }));

  if (prescription.deload) {
    workouts = applyDeload(workouts);
  }

  workouts = applyFatigue(workouts, state.fatigueScore);

  return {
    ...state,
    weekNumber: nextWeek,
    currentPhase: prescription.deload ? "deload" : "progression",
    workouts,
    weekHistory: history,
    updatedAt: Date.now(),
  };
}