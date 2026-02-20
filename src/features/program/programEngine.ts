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
  return {
    name: ex.name,
    exerciseId: ex.id,
    movementCategory: category,
    sets,
    reps,
    weight: existing?.weight ?? weight,
    progressionType: progression,
    lastPerformance: existing?.lastPerformance ?? null,
    plateauCount: existing?.plateauCount ?? 0,
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
    lastPerformance: null,
    plateauCount: 0,
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
   PROGRESSION ENGINE
================================ */

export function applyProgression(
  exercise: ProgramExercise,
  actualReps: number,
  actualWeight: number,
  goal: Goal,
): ProgramExercise {
  const updated = { ...exercise };

  updated.lastPerformance = {
    sets: exercise.sets,
    reps: actualReps,
    weight: actualWeight,
    completed: actualReps >= exercise.reps,
  };

  if (exercise.progressionType === "double") {
    if (actualReps >= exercise.reps && actualWeight >= exercise.weight) {
      updated.weight = exercise.weight + 2.5 + goalWeightBonus(goal);
      updated.plateauCount = 0;
    } else {
      updated.plateauCount = exercise.plateauCount + 1;
      if (updated.plateauCount >= 2 && updated.plateauCount < 3) {
        updated.weight = Math.round((exercise.weight * 0.95) * 2) / 2;
      }
    }
  } else {
    if (actualReps >= exercise.reps) {
      updated.weight = exercise.weight + 1.25;
      updated.plateauCount = 0;
    } else {
      updated.plateauCount = exercise.plateauCount + 1;
    }
  }

  return updated;
}

/* ================================
   FATIGUE ADJUSTMENT
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

/* ================================
   DELOAD ADJUSTMENT
================================ */

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

/* ================================
   WEEK ADVANCEMENT
================================ */

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed);
}

export function advanceWeek(state: ProgramState): ProgramState {
  const nextWeek = state.weekNumber + 1;
  const prescription = generateWeekPrescription(nextWeek);

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
    updatedAt: Date.now(),
  };
}
