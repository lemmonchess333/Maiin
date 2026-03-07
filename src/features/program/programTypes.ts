/* ================================
   PROGRAM ENGINE TYPES
================================ */

export type MovementCategory =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "knee_dominant"
  | "hip_dominant"
  | "arms_biceps"
  | "arms_triceps"
  | "core";

export type SplitType = "full_body" | "upper_lower" | "ppl" | "ppl_ul" | "ppl_x2";

export type Goal = "cut" | "lean bulk" | "recomp";

export type ProgressionType = "double" | "linear";

/* ================================
   PERFORMANCE HISTORY
================================ */

export interface PerformanceRecord {
  date: string;
  weight: number;
  repsCompleted: number;
  repsTarget: number;
}

/* ================================
   EXERCISE
================================ */

export interface ProgramExercise {
  name: string;
  exerciseId: string;
  movementCategory: MovementCategory;
  sets: number;
  reps: number;
  weight: number;
  progressionType: ProgressionType;
  // Exercise-specific progression
  lastSuccessfulWeight: number;
  lastAttemptedWeight: number;
  consecutiveFailures: number;
  plateauCount: number;
  performanceHistory: PerformanceRecord[];
  // Legacy compat
  lastPerformance: {
    sets: number;
    reps: number;
    weight: number;
    completed: boolean;
  } | null;
}

/* ================================
   WORKOUT DAY
================================ */

export interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

/* ================================
   SETTINGS
================================ */

export interface ProgramSettings {
  autoProgression: boolean;
  microloading: boolean;
}

/* ================================
   WEEK SNAPSHOT (for history)
================================ */

export interface WeekSnapshot {
  weekNumber: number;
  workouts: WorkoutDay[];
}

/* ================================
   PROGRAM STATE
================================ */

export interface ScheduledRunDay {
  dayIndex: number;
  templateId: string;
  type: string;
  completed: boolean;
  userOverride?: string;
}

export interface RunPlan {
  mode: "structured" | "race_prep";
  raceGoal?: { distance: string; targetDate: string };
  totalWeeks?: number;
  currentWeek?: number;
}

export interface ProgramState {
  goal: Goal;
  currentPhase: string;
  weekNumber: number;
  splitType: SplitType;
  workouts: WorkoutDay[];
  fatigueScore: number;
  updatedAt: number;
  settings?: ProgramSettings;
  weekHistory?: WeekSnapshot[];
  runDays?: ScheduledRunDay[];
  runPlan?: RunPlan;
}

/* ================================
   WEEKLY PRESCRIPTION
================================ */

export interface WeeklyPrescription {
  week: number;
  intensityMultiplier: number;
  volumeModifier: number;
  deload: boolean;
}

/* ================================
   BACKWARD-COMPAT NORMALIZER
================================ */

export function normalizeExercise(ex: Partial<ProgramExercise> & { name: string; exerciseId: string }): ProgramExercise {
  return {
    name: ex.name,
    exerciseId: ex.exerciseId,
    movementCategory: ex.movementCategory ?? "horizontal_push",
    sets: ex.sets ?? 3,
    reps: ex.reps ?? 8,
    weight: ex.weight ?? 0,
    progressionType: ex.progressionType ?? "linear",
    lastSuccessfulWeight: ex.lastSuccessfulWeight ?? ex.weight ?? 0,
    lastAttemptedWeight: ex.lastAttemptedWeight ?? ex.weight ?? 0,
    consecutiveFailures: ex.consecutiveFailures ?? 0,
    plateauCount: ex.plateauCount ?? 0,
    performanceHistory: ex.performanceHistory ?? [],
    lastPerformance: ex.lastPerformance ?? null,
  };
}

export function normalizeProgramState(state: ProgramState): ProgramState {
  return {
    ...state,
    settings: state.settings ?? { autoProgression: true, microloading: true },
    weekHistory: state.weekHistory ?? [],
    workouts: state.workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => normalizeExercise(ex)),
    })),
  };
}
