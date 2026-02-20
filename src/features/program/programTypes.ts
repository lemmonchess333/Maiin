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

export type SplitType = "upper_lower" | "ppl";

export type Goal = "cut" | "lean bulk" | "recomp";

export type ProgressionType = "double" | "linear";

export interface ProgramExercise {
  name: string;
  exerciseId: string;
  movementCategory: MovementCategory;
  sets: number;
  reps: number;
  weight: number;
  progressionType: ProgressionType;
  lastPerformance: {
    sets: number;
    reps: number;
    weight: number;
    completed: boolean;
  } | null;
  plateauCount: number;
}

export interface WorkoutDay {
  dayName: string;
  dayType: string;
  exercises: ProgramExercise[];
  completed: boolean;
}

export interface ProgramState {
  goal: Goal;
  currentPhase: string;
  weekNumber: number;
  splitType: SplitType;
  workouts: WorkoutDay[];
  fatigueScore: number;
  updatedAt: number;
}

export interface WeeklyPrescription {
  week: number;
  intensityMultiplier: number;
  volumeModifier: number;
  deload: boolean;
}
