/* ================================
   PROGRAM ENGINE TYPES
================================ */

import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

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
  /**
   * Optional free-text note surfaced in the UI. Currently used by
   * `applyInjuryFilters` to explain a substitution ("Swapped from
   * Barbell Squat (knee limitation): ...") or flag an exercise with no
   * safe substitute ("No safe substitute found — consider reducing
   * load"). Carried from `TemplateExercise.notes` through
   * `templateExToProgEx` so the warning survives the template →
   * program-state conversion.
   */
  notes?: string;
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

/* ================================
   SCHEDULE VERSION CONSTANTS
   ================================

   Bumped when the on-disk shape of weekSchedule or programState
   changes incompatibly. Read-side migrations (src/features/program/
   migrations.ts) gate on these values to populate missing fields
   without regenerating plans. */
export const CURRENT_WEEKSCHEDULE_VERSION = 1 as const;
export const CURRENT_PROGRAM_SCHEMA_VERSION = 2 as const;

/* ================================
   SCHEDULED RUN
   ================================ */

/** Run-template categories the scheduler emits. Narrows the legacy
 *  `type: string` field to known values. Existing v1 docs from the
 *  scheduler have always used one of these; the union is purely a
 *  type-safety tightening, not a runtime change. */
export type RunPlannedType = "easy" | "tempo" | "intervals" | "long" | "race";

/** State machine for scheduled-run completion lifecycle.
 *
 *  Legal transitions (enforced by `transitionStatus`):
 *    planned → completed_exact | completed_modified | completed_late | skipped
 *    planned → race_no_show | race_completed_unlinked
 *    race_completed_unlinked → completed_exact
 *
 *  Disallowed (no silent reverts):
 *    completed_* → planned | skipped
 *    skipped → completed_* (without explicit reconciliation)
 *
 *  Note on "missing" statuses:
 *    "missed" is DERIVED at view time, not stored. A run is "missed"
 *      when `date < localToday && status === "planned" && !linkedRunId`.
 *    "moved" is METADATA (movedFromDate/movedToDate), not a status —
 *      a moved run stays `status: "planned"` on its new date.
 *    "freeform_extra" lives on the saved RUN DOCUMENT's planMetadata,
 *      not on ScheduledRunDay — extras aren't planned-day states. */
export type ScheduledRunStatus =
  | "planned"
  | "completed_exact"
  | "completed_modified"
  | "completed_late"
  | "skipped"
  | "race_no_show"
  | "race_completed_unlinked";

export interface ScheduledRunDay {
  /** Stable scheduled-run identity. Generated by `generateScheduledRunId`
   *  during plan creation; preserved across moves (date changes,
   *  `id` does not). Used as the `?scheduledRunId=...` URL param so
   *  RunSummary can complete the exact instance.
   *
   *  Optional in v1 type so legacy docs read without TS errors;
   *  `migrateProgramState` backfills lazily on first read. */
  id?: string;

  /** Sunday-start week key (local-date "YYYY-MM-DD"). Used for
   *  week-bucket queries and adherence calculations. Optional in v1
   *  type; backfilled by migration. */
  weekKey?: string;

  /** Calendar date the run is scheduled for (local "YYYY-MM-DD").
   *  Optional in v1 type; backfilled by migration. */
  date?: string;

  /** 0=Sun..6=Sat. Derived from `date` post-migration; present in
   *  legacy docs as the only date-shaped field. */
  dayIndex: number;

  /** Run template ID (from `RUN_TEMPLATES`). */
  templateId: string;

  /** Legacy free-text label of the run type. Pre-v7 the field was
   *  `type: string`; v7 narrows the values to `RunPlannedType` for
   *  type safety. Existing data uses the same strings. */
  type: RunPlannedType | string;

  /** Legacy completion boolean. Preserved for back-compat during
   *  migration. New code should read `status` instead — the
   *  migration sets `status = "completed_exact"` when this is true. */
  completed?: boolean;

  /** User override template ID. Pre-v7 was the only way to swap a
   *  scheduled run's template at runtime. Still a string (verified
   *  at `runPlanMetadata.ts:490` — must not become boolean). */
  userOverride?: string;

  /** Authoritative status enum (v7+). Optional in v1 type because
   *  legacy docs lack the field; migration backfills based on
   *  `completed`. New code (planBuilder, runScheduler) always sets it. */
  status?: ScheduledRunStatus;

  /** Reference to the saved run document once executed. */
  linkedRunId?: string;

  /** Original scheduled date before user moved this instance. The
   *  `id` is preserved across moves; `date` + `dayIndex` update.
   *  Both `movedFromDate` and `movedToDate` are optional and set
   *  only when the user explicitly reschedules within a week. */
  movedFromDate?: string;
  movedToDate?: string;
}

export interface RunPlan {
  mode: "structured" | "race_prep";
  raceGoal?: { distance: string; targetDate: string };
  totalWeeks?: number;
  currentWeek?: number;
  /** P2-1: true when totalWeeks fell below the ideal for the race
   *  distance (5k=4, 10k=6, half=8, marathon=12). Race-prep users
   *  with a tight target date see a "compressed plan" banner in
   *  Programme so they understand the plan dropped intervals or
   *  trimmed long-run progression. Source: generateRacePlanV2's
   *  `compressed` output. */
  compressed?: boolean;
}

/* ================================
   STATUS TRANSITION VALIDATOR
   ================================

   Pure boolean function — call before every status write to gate
   illegal transitions. Use case: RunSummary.completeRunDay validates
   `transitionStatus(current, "completed_exact")` before writing. */

const LEGAL_TRANSITIONS: Record<ScheduledRunStatus, ScheduledRunStatus[]> = {
  planned: [
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
    "race_completed_unlinked",
  ],
  // Race-day run logged separately but later linked back → counts
  // as an exact completion. Other completed_* states are terminal.
  race_completed_unlinked: ["completed_exact"],
  // Terminal states — no legal outgoing transitions.
  completed_exact: [],
  completed_modified: [],
  completed_late: [],
  skipped: [],
  race_no_show: [],
};

/** Returns true iff `to` is a legal transition from `from`.
 *  Callers should throw on `false` rather than silently no-op so
 *  illegal writes surface in dev rather than corrupt data in prod. */
export function transitionStatus(from: ScheduledRunStatus, to: ScheduledRunStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
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

  /**
   * Schema version for the `programState` doc shape. Read-side
   * migrations gate on this — when `< CURRENT_PROGRAM_SCHEMA_VERSION`,
   * `migrateProgramState()` repairs the shape in place (adds
   * id/date/weekKey/status to existing runDays without regenerating
   * the plan). Missing in legacy docs is treated as v1.
   *
   * Bump pattern: increment when adding new required fields that
   * existing data lacks. v2 added the run-identity tuple
   * (id/date/weekKey/status) to ScheduledRunDay.
   */
  programSchemaVersion?: number;
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
    movementCategory: ex.movementCategory ?? inferMovementCategory(ex.name, ex.exerciseId),
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
    ...(ex.notes !== undefined ? { notes: ex.notes } : {}),
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
