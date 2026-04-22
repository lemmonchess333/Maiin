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

export type SplitType = "full_body" | "upper_lower" | "ppl" | "ppl_ul" | "ppl_x2" | "ppl_x2_fb";

export type Goal = "cut" | "lean bulk" | "recomp";

/**
 * Lifting goal from onboarding — orthogonal to the `Goal` type above.
 * `Goal` describes the nutrition phase (cut / lean bulk / recomp) and is
 * already used in the engine to scale volume. `PrimaryGoal` describes the
 * training stimulus the user wants — strength vs hypertrophy vs fat loss
 * vs general vs running-supportive.
 *
 * Before W1a these two axes were conflated. `generateProgram()` only
 * received the nutrition `Goal` and hardcoded rep ranges, meaning a user
 * who declared "strength" at onboarding silently got hypertrophy reps on
 * every regenerate. `PrimaryGoal` + `GoalProfile` below fix that seam.
 */
export type PrimaryGoal = "hypertrophy" | "strength" | "fat_loss" | "general" | "running";

/**
 * Training-stimulus parameters derived from the user's `PrimaryGoal`.
 * Consumed by the procedural engine (`generateProgram`) so main- and
 * accessory-lift rep ranges, volume, and progression type track what the
 * user actually asked for.
 */
export interface GoalProfile {
  mainReps: number;
  accessoryReps: number;
  volumeMultiplier: number;
  mainProgression: ProgressionType;
}

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
  baseReps?: number; // original prescribed rep target — used as reset anchor on weight increase
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
  isCustom?: boolean;
  skipped?: boolean;
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
  nextWorkoutOverride?: number;
  /**
   * Lifting goal declared at onboarding. Added in W1a so the procedural
   * engine can scale rep ranges to the user's actual request on regen,
   * and so the Program page UI can surface "Built for [goal] · [split]"
   * legibility. Optional for backward compatibility with pre-W1a docs —
   * `normalizeProgramState` backfills from `UserProfile.primaryGoal` at
   * read time; UI falls back to `"General Fitness"` if still missing.
   */
  primaryGoal?: PrimaryGoal;
  /**
   * ID of the handwritten template this program was assigned at
   * onboarding, when a match existed. Absent when `matchTemplate`
   * couldn't find a goal-matching template and the program came from
   * the procedural engine — UI uses this to render or omit the
   * "from the X template" clause.
   */
  templateId?: string;
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
    baseReps: ex.baseReps ?? ex.reps ?? 8,
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

export function normalizeProgramState(
  state: ProgramState,
  backfill?: { primaryGoal?: PrimaryGoal },
): ProgramState {
  return {
    ...state,
    settings: state.settings ?? { autoProgression: true, microloading: true },
    weekHistory: state.weekHistory ?? [],
    // Backfill primaryGoal from UserProfile for pre-W1a docs. Keeps the
    // program-page legibility line functional for legacy users without
    // forcing a migration. If both are missing we leave it undefined and
    // the UI falls back to a generic label.
    primaryGoal: state.primaryGoal ?? backfill?.primaryGoal,
    workouts: (state.workouts ?? []).map((day) => ({
      ...day,
      skipped: day.skipped ?? false,
      exercises: (day.exercises ?? []).map((ex) => normalizeExercise(ex)),
    })),
  };
}
