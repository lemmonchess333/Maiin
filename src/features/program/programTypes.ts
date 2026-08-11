/* ================================
   PROGRAM ENGINE TYPES
================================ */

import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

/* MovementCategory lives in lib/exerciseMovementCategory.ts (the module
   that also owns its inference) and is re-exported here for the many
   existing importers. Breaking the programTypes <-> inference cycle
   (2026-07-11 repo audit batch 3): this file imports the inference
   function, so the inference module must not import back from here. */
import type { MovementCategory } from "@/lib/exerciseMovementCategory";
import type { CanonicalMuscle } from "./muscleTaxonomy";
export type { MovementCategory } from "@/lib/exerciseMovementCategory";

export type SplitType =
  | "full_body"
  | "upper_lower"
  | "ppl"
  | "ppl_ul"
  | "ppl_x2"
  | "ppl_x2_fb";

/**
 * User-facing split *preference* vocabulary — distinct from the engine's
 * `SplitType` above. This is the coarse choice surfaced in onboarding and
 * Programme Settings (Full Body / Upper-Lower / PPL / Bro Split / Auto), NOT
 * the structural split the engine builds.
 *
 * Two values here have no `SplitType` equivalent: `"bro_split"` (the engine
 * never builds a bro split) and `"auto"` (let the engine choose from weekly
 * lift days). The preference is persisted on `profile.preferredSplit` and
 * read by `matchTemplate` as a template-scoring signal — it is INERT in plan
 * generation (`chooseSplit` derives structure from lift days, per Pgm5 Q1).
 *
 * It previously lived as four hand-copied unions (Onboarding, TrainingSection,
 * UserProfile, planBuilder's input cast). Consolidated here so the preference
 * vocabulary has one source of truth, and the `as SplitType` cast-lie at the
 * planBuilder boundary — which claimed a value `SplitType` can't represent —
 * is gone.
 */
export type PreferredSplit =
  | "full_body"
  | "upper_lower"
  | "ppl"
  | "bro_split"
  | "auto";

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
export type PrimaryGoal =
  | "hypertrophy"
  | "strength"
  | "fat_loss"
  | "general"
  | "running";

/**
 * Training-stimulus parameters derived from the user's `PrimaryGoal`.
 * Consumed by the procedural engine (`generateProgram`) so main- and
 * accessory-lift rep ranges, volume, and progression type track what the
 * user actually asked for.
 */
export interface GoalProfile {
  mainReps: number;
  accessoryReps: number;
  /**
   * Top of the authored rep range for mains / accessories (training-book
   * backlog #7, H3/N2). `mainReps`..`mainRepsMax` is what the double
   * progression climbs before load moves. The procedural engine had no
   * ranges at all before #7 — only template-derived programs did — so the
   * range machinery shipped in P1 never reached generated programs.
   */
  mainRepsMax: number;
  accessoryRepsMax: number;
  volumeMultiplier: number;
  mainProgression: ProgressionType;
}

export type ProgressionType = "double" | "linear";

/**
 * What `reps` counts (training-book backlog #7's time axis, N2). Absent
 * means repetitions — the overwhelming default, and what every legacy row
 * carries. `"seconds"` marks an isometric hold, where the same number means
 * a duration: a plank prescribed "30-45s" was being stored AND displayed as
 * "30 reps", and any overshoot tripped the 20-rep bodyweight cap into
 * advising "add load" at what is an ordinary hold length.
 */
export type RepUnit = "reps" | "seconds";

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
  /**
   * Stable per-instance id (#1038). `exerciseId` is NOT unique — the same
   * exercise can appear twice in a day — so it can't key a reorderable list.
   * This is the dnd-kit sortable id + React key for the Programme exercise
   * rows, so drag/swipe-delete reconcile by EXERCISE instead of by position
   * (positional keys leaked a row's swipe/drag state onto whichever exercise
   * slid into that slot). Assigned lazily by `normalizeExercise` on first
   * load (idempotent — kept once present) so legacy plans backfill without a
   * migration. Optional for back-compat; render falls back to a positional id
   * when absent.
   */
  instanceId?: string;
  movementCategory: MovementCategory;
  sets: number;
  reps: number;
  baseReps?: number; // original prescribed rep target — used as reset anchor on weight increase
  /**
   * Top of the authored rep range (P1, training-book backlog). When present
   * and progressionType is "double", the rep target climbs from baseReps
   * toward this ceiling as targets are completed; load rises only when the
   * ceiling is reached, then the target resets to baseReps. Absent (all
   * generated programs today, and legacy docs) → the pre-range behaviour:
   * load rises on a 2-rep overshoot. Optional field with a default → no
   * programSchemaVersion bump (see docs/proposals/schema-versioning.md).
   */
  repRangeMax?: number;
  /**
   * Steady-state set-count anchor (backlog #5, volume ramp). Stamped at
   * generation (after volume balancing) and lazily on first advance for
   * legacy docs. advanceWeek derives each week's sets FROM this anchor —
   * which is also the fix for the compounding auto-deload decay (the
   * sets−1 / ×0.85 cut was applied to live state and never restored, so
   * every mesocycle permanently shrank the programme). Any future UI
   * that edits an exercise's set count MUST update baseSets too, or the
   * next weekly advance will revert the edit. Optional + defaulting
   * readers → no schema bump.
   */
  baseSets?: number;
  /**
   * Load stored on entering an automatic deload week and restored
   * (max(live, stored)) on meso exit, then removed. Absent outside a
   * deload cycle.
   */
  preDeloadWeight?: number;
  /**
   * Rep target stored on entering an automatic deload week and restored
   * (max(live, stored)) on meso exit, then removed. Only the post-novice
   * deload recipe (backlog #8) cuts reps, but the stash is unconditional
   * so the restore can't depend on which recipe ran — a user who changes
   * their experience level mid-mesocycle must still get their reps back.
   */
  preDeloadReps?: number;
  /**
   * The calibration this slot's load lineage descends from — the exercise
   * identity and weight at the last CALIBRATED assignment (cold-start seed,
   * or a one-shot rescaled swap). Mesocycle rotation scales the next
   * variation's load from HERE rather than from the previous rotation's
   * output, which is what makes repeated rotation non-compounding (the
   * documented 50 → 30 → 12.5 decay). Absent on legacy slots, which keep
   * the old carry-the-weight rotation behaviour.
   */
  rotationAnchor?: { exerciseId: string; weight: number };
  /** Unit for `reps` / `repRangeMax`. Absent = repetitions. */
  repUnit?: RepUnit;
  /**
   * Per-exercise rest between sets in seconds, carried from
   * TemplateExercise.restSeconds. WorkoutSession prefers this over
   * profile.defaultRestSeconds; a mid-session manual target change by the
   * user wins over both. Absent on generated programs (they have no
   * authored rest yet).
   */
  restSeconds?: number;
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
  /**
   * True for assistance/isolation lifts (built via `makeAccessory`), false for
   * the day's main compounds (`makeExercise`). Used by the weekly-volume
   * balancer (D-LIFT-1 active) to know which sets it may nudge toward the
   * landmark — mains are the progression anchor and are never auto-adjusted.
   * Optional for back-compat: legacy programs (no flag) are simply not balanced
   * until their next regeneration.
   */
  isAccessory?: boolean;
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

/**
 * PROGRAM-DELOAD-01: pre-deload stash written by the server
 * `applyDeloadWeek` command and consumed (removed) by
 * `revertDeloadWeek`. Scoped to one week — the `weekNumber` guard makes
 * a snapshot from a previous week inert after rollover, so
 * `advanceWeek` never needs to know it exists. Optional-with-default
 * on ProgramState: no schema version bump (readers tolerate absence).
 */
export interface DeloadSnapshot {
  weekNumber: number;
  workouts: WorkoutDay[];
  currentPhase: string;
  fatigueScore: number;
  appliedAt: number;
}

/**
 * RUN-EASE-01: pre-ease stash written by the server `applyEaseWeek`
 * command and consumed (removed) by `revertEaseWeek`.
 *
 * Runs only — an easier week never touches the lift side, which is the
 * whole reason it is a separate stash from `DeloadSnapshot` rather than a
 * field on it.
 *
 * Week-scoped for a stronger reason than the deload's. `runDays` are
 * regenerated wholesale at every rollover, so an easier week already
 * expires by itself: next Monday the plan returns at full prescription.
 * The `weekNumber` guard therefore retires the snapshot at exactly the
 * moment the week it could restore stops existing — which is also why
 * there is no per-day `preEase…` field. That shape belongs to
 * `preDeloadWeight`, where lift weights DO carry forward and a cut has to
 * be explicitly given back.
 */
export interface EaseSnapshot {
  weekNumber: number;
  runDays: ScheduledRunDay[];
  appliedAt: number;
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
// v3 (2026-08-04): one-time coverage backfill for plans generated before the
// lateral-raise and calf slots existed. Version-gated precisely so it runs
// ONCE — a user who deletes those slots afterwards keeps them deleted.
export const CURRENT_PROGRAM_SCHEMA_VERSION = 3 as const;

/* ================================
   SCHEDULED RUN
   ================================ */

/** Run-template categories the scheduler emits. Narrows the legacy
 *  `type: string` field to known values. Existing v1 docs from the
 *  scheduler have always used one of these; the union is purely a
 *  type-safety tightening, not a runtime change. */
export type RunPlannedType = "easy" | "tempo" | "intervals" | "long" | "race";

/**
 * Run types that impose HIGH glycogen demand (long / tempo / intervals /
 * race). Single source of truth shared by the run scheduler (clash flagging)
 * and the nutrition day-intensity classifier (HARD tier). `easy` is the only
 * non-hard planned type. Declared here (the shared types module) so neither
 * consumer re-derives the set and drifts. */
export const HARD_RUN_TYPES: ReadonlySet<string> = new Set([
  "long",
  "tempo",
  "intervals",
  "race",
]);

/** State machine for scheduled-run completion lifecycle.
 *
 *  Legal transitions (enforced by `transitionStatus`):
 *    planned → completed_exact | completed_modified | completed_late | skipped
 *    planned → race_no_show
 *    race_no_show → completed_exact | completed_modified | completed_late
 *      (PR-D: race_no_show is recoverable. The auto-transition that
 *      writes it is an inferred state — if the user later logs the
 *      race via reconciliation, the slot becomes completed_*.)
 *
 *  Disallowed (no silent reverts):
 *    completed_* → planned | skipped
 *    skipped → completed_* (without explicit reconciliation)
 *
 *  Note on "missing" statuses:
 *    "missed" is DERIVED at view time, not stored. PR-J Q1 + Q5
 *      refined: a runDay is missed when it has no claim in the
 *      computed claim map AND date < today − 7d (Q5 P83 derived
 *      `expired` threshold). See `scheduledRunCompletion.ts`.
 *    "moved" is METADATA (movedFromDate/movedToDate), not a status —
 *      a moved run stays `status: "planned"` on its new date.
 *    "freeform_extra" lives on the saved RUN DOCUMENT's planMetadata,
 *      not on ScheduledRunDay — extras aren't planned-day states. */
/** Active status union — the values writers produce going forward.
 *  PR-J Q4 P59 + Q8 P102: split from the legacy completed_* triple
 *  so the post-PR-J writer surface (which produces only these
 *  values) is type-distinct from the legacy values still readable
 *  on past runDays. */
export type ScheduledRunStatus = "planned" | "skipped" | "race_no_show";

/** Legacy status union — values that exist on past runDays but
 *  will never be written by post-PR-J code. PR-J Q1 P8 commits to
 *  keeping them readable forever; the derivation's
 *  `isLegacyCompleted` branch (Q2 P27) treats any of these as
 *  "completion holds." A migration write to drop them would lose
 *  the original recorded state with no upside — the field stays
 *  as-is on existing docs. */
export type LegacyScheduledRunStatus =
  | "completed_exact"
  | "completed_modified"
  | "completed_late";
// PR-D: `race_completed_unlinked` dropped from the enum. Defined
// pre-PR-D but never written by any code path — paper status with
// dead UI branches across DayPeekCard, DayActionSheet,
// ProgrammeRunSection, and trainingResolver. The reconciliation
// flow in RunSummary writes completed_exact directly via
// completeRunDay; the unlinked intermediate state was never
// necessary.

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
   *  `completed`. New code (planBuilder, runScheduler) always sets
   *  it.
   *
   *  PR-J Q8 P102: accepts both the active union (what writers
   *  produce going forward) and the legacy union (preserved on
   *  past docs). Readers narrow via `isLegacyCompleted` from
   *  `scheduledRunStatus.ts` per Q2 P27's derivation formula. */
  status?: ScheduledRunStatus | LegacyScheduledRunStatus;

  // PR-J Q1 P9: `linkedRunId` removed. The "navigation hook from
  // completed runDay → saved run" the field was reserved for is
  // deferred until needed; the link is recomputable at click time
  // from (runDay.date, runDay.templateId) → saved-run lookup.
  // Existing docs may carry the field; the type widening allows
  // extra unread properties, so no runtime cleanup is needed.

  /** Original scheduled date before user moved this instance. The
   *  `id` is preserved across moves; `date` + `dayIndex` update.
   *  Both `movedFromDate` and `movedToDate` are optional and set
   *  only when the user explicitly reschedules within a week. */
  movedFromDate?: string;
  movedToDate?: string;

  /** Run9 phase-3 (Slice C): true when a HARD run (long / tempo / intervals /
   *  race) had to be placed on a "both" day (lift + run on the same day)
   *  because no run-only slot was available — the 6-day-lifter clash the
   *  scheduler must FLAG rather than silently drop (R3-placement). The run is
   *  still placed; the UI surfaces a "shares a day with lifting" note so the
   *  user can move a lift if they want. Easy runs on both-days are NOT flagged
   *  (low stress). Set by generateRacePlanV2. */
  clashesWithLift?: boolean;
}

export interface RunPlan {
  mode: "structured" | "race_prep";
  raceGoal?: { distance: string; targetDate: string; eventName?: string };
  totalWeeks?: number;
  currentWeek?: number;
  /** P2-1: true when totalWeeks fell below the ideal for the race
   *  distance (5k=4, 10k=6, half=8, marathon=12). Race-prep users
   *  with a tight target date see a "compressed plan" banner in
   *  Programme so they understand the plan dropped intervals or
   *  trimmed long-run progression. Source: generateRacePlanV2's
   *  `compressed` output. */
  compressed?: boolean;
  /** Run9 phase-3 (Slice B): true when weeks-remaining fell BELOW the
   *  taper-safe floor (= taperWeeks + 1 per distance: 5k=2, 10k=2, half=3,
   *  marathon=4). At/above the floor a tight plan still `compressed`s to keep
   *  the date; below it, compressing is no longer safe, so the generator
   *  emits a "finish-safely" plan — all easy, no quality, the long run capped
   *  at baseLongKm (no week-over-week jumps) — and the UI NAMES the risk
   *  instead of silently shortening. `belowFloor` implies `compressed`.
   *  Source: generateRacePlanV2's `belowFloor` output. */
  belowFloor?: boolean;
  /** PR-D / PR-E: post-race recovery phase. Entered automatically
   *  when the race-day runDay transitions to completed_* (per
   *  `completeRunDay`). All template generation during this phase
   *  emits `easy_30` regardless of weekly position. Exits when
   *  `today >= recoveryEndDate` (via the post-race card's "what's
   *  next?" prompt, PR-C variant 3) or via the user's explicit
   *  "Skip recovery early" affordance. */
  phase?: "recovery";
  /** Local YYYY-MM-DD string. Computed at recovery-phase entry as
   *  `raceGoal.targetDate + recoveryWeeksForDistance × 7d`. Read
   *  by the card to display "N days left" and by the load effect
   *  to detect phase-end. */
  recoveryEndDate?: string;
  /** PR-J Q2 P28: race-day runDay IDs that have already triggered
   *  the recovery-entry effect. Prevents the effect from re-firing
   *  on the same race after exit (P14 → P28 refinement). Supports
   *  multi-race plans (Round 3 stress #52) by tracking per-race
   *  entry rather than a single boolean. */
  completedRaces?: string[];
}

/* ================================
   STATUS TRANSITION VALIDATOR
   ================================

   Pure boolean function — call before every status write to gate
   illegal transitions. Use case: RunSummary.completeRunDay validates
   `transitionStatus(current, "completed_exact")` before writing. */

/** Status union accepted by `transitionStatus` and `LEGAL_TRANSITIONS`
 *  keys + values. PR-J Q8 P104: the function consumes both unions so
 *  callers don't need to narrow at the boundary; legacy values are
 *  hard-terminal (no outgoing transitions) per the existing semantics. */
type AnyScheduledRunStatus = ScheduledRunStatus | LegacyScheduledRunStatus;

const LEGAL_TRANSITIONS: Record<
  AnyScheduledRunStatus,
  AnyScheduledRunStatus[]
> = {
  // PR-J Q2 chunk B2: completeRunDay deleted, so planned no longer
  // transitions to completed_* via the writer (completion is now
  // derived per Q1 P27). Legacy completed_* values remain in the
  // table as terminal so existing data type-checks; new writers
  // can only produce active-union values.
  planned: ["skipped", "race_no_show"],
  // PR-D: race_no_show is recoverable.
  // PR-J Q2 P15: race_no_show → planned is the reversal path when
  // a matching saved run lands post-no-show. The race-no-show
  // effect performs this transition automatically (chunk B4).
  race_no_show: ["planned"],
  // PR-J Q1 P7: skipped is reversible — a user who manual-completes
  // a skipped slot follows the two-step transition
  // skipped → planned → manualCompletions[id] (Q2 P20).
  skipped: ["planned"],
  // Hard terminal — legacy values stay terminal forever.
  completed_exact: [],
  completed_modified: [],
  completed_late: [],
};

/** Returns true iff `to` is a legal transition from `from`.
 *  Callers should throw on `false` rather than silently no-op so
 *  illegal writes surface in dev rather than corrupt data in prod.
 *
 *  PR-J Q8 P104: accepts the union so callers like
 *  `getScheduledRunStatus` (which may return a legacy value) can
 *  pass through without narrowing. Legacy values are terminal in
 *  the table → false for any outgoing transition. */
export function transitionStatus(
  from: AnyScheduledRunStatus,
  to: AnyScheduledRunStatus
): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** PR-J Q2 P11: explicit user intent to mark a runDay slot complete
 *  without a real saved run. Distinct from the legacy `completed: true`
 *  boolean (which migrated to `status: "completed_exact"`) — this map
 *  records the INTENT, the derivation produces the visible ✅. Stored
 *  on `programState` rather than on the runDay so plan-regenerate
 *  cleanup (P19) can drop orphan keys in a single pass. */
export interface ManualCompletion {
  completedAt: { seconds: number; nanoseconds: number } | Date | number;
}

/**
 * How hard a training block asks the user to go (Blk2).
 *
 * The second of the block's two axes, and the reason `BlockPreset` was
 * retired. The old five presets mixed three training STIMULI (strength /
 * muscle / hybrid) with two adherence POSTURES (consistency reset / return
 * to training) — one list, two questions — which is exactly why
 * `presetProgrammeGoal` had to return `null` twice. `PrimaryGoal` has
 * values on the first axis only. Splitting them means a returning strength
 * lifter can finally say "get stronger, easing back in" instead of picking
 * which half of their situation to describe.
 */
export type BlockPace = "full" | "lighter" | "easing";

export type BlockDurationWeeks = 4 | 8 | 12;

/**
 * The training block that owns the lift prescription right now (Blk2).
 *
 * Lives on `programState` rather than in `users/{uid}/trainingBlocks`, which
 * is what makes start and release atomic — block, focus and workouts are one
 * document, so Firestore's own single-document guarantee replaces a
 * transaction and overlap becomes structurally impossible. The subcollection
 * stays as the ARCHIVE of finished blocks.
 *
 * Absent means no block, which is exactly today's behaviour — the reason
 * this needs no schema-version bump.
 */
export interface ActiveTrainingBlock {
  /** Archive doc id, `${startDate}-${createdAt}`. */
  id: string;
  /**
   * Whether this block owns the prescription. False for a legacy block
   * adopted at deploy: it was created as a narrative wrapper, never
   * represcribed anything, and must not have a prescription applied or
   * released retroactively.
   */
  owned: boolean;
  focus: PrimaryGoal;
  pace: BlockPace;
  durationWeeks: BlockDurationWeeks;
  /** Local YYYY-MM-DD. Block weeks are counted from here. */
  startDate: string;
  /**
   * The standing focus to restore at release, captured from the profile at
   * start. This one scalar is the entire inverse of the block — see
   * `represcribe.ts` on why there is no per-slot snapshot.
   */
  goalBefore: PrimaryGoal;
  /**
   * Weeks of plateau-RESPONSE amnesty remaining, decremented by
   * `advanceWeek`. Set when the focus changed or the pace is easing, both
   * of which make early misses expected rather than informative.
   *
   * A counter rather than a date so it expires monotonically with no sweep,
   * no clock and no review step — including for a user who abandons the
   * block and never opens the app again.
   */
  amnestyWeeksLeft: number;
  /**
   * Lifts a week this block asks for. Display and the review denominator
   * only — NEVER mirrored to `profile.weeklyWorkoutsTarget`, which feeds
   * `expectedDayCount` and would silently send the user's next unrelated
   * settings save down the REBUILD branch with `liftDaysChanged` false, so
   * the loss-disclosing confirm never fires.
   */
  weeklyLiftTarget: number;
  anchorExerciseIds: string[];
  why: string;
  createdAt: number;
  /**
   * Embedded discriminator, not a document version — the one-version-per
   * -document rule is untouched. An unrecognised value reads as
   * `owned: false` so an unknown shape can never drive a prescription.
   */
  schemaVersion: 1;
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
  /** PR-J Q2 P11: manualCompletions map keyed by `runDay.id`.
   *  Optional + sparse — only contains entries for slots the user
   *  has explicitly marked complete via DayActionSheet → "Mark
   *  complete (manual)". The derivation (Q2 P27) ORs this map's
   *  presence against saved-run matching + legacy status to surface
   *  the slot's ✅ state. Cleanup sweep on auto-rollover + plan
   *  regenerate (P19) drops orphan keys.
   *
   *  Optional in v2 type so existing v2 docs without the map field
   *  read cleanly via TS (treated as empty map by readers).
   *  `migrateProgramState` doesn't backfill — empty is correct. */
  manualCompletions?: Record<string, ManualCompletion>;
  /**
   * PR-L L4: server-set flag indicating the user fell behind on
   * their weekly run target the prior week (<50% of prescribed runs
   * with real saved-run matches). Written by `weeklyFellBehindCheck`
   * (Mondays 05:00 UTC). Read by the client on app open; rendered as
   * the adaptive-plan bottom sheet (shift / compress / skip per Q24).
   * Cleared by any of the three user choices.
   *
   * Optional — only present when the user fell behind a given week.
   */
  pendingFellBehindPrompt?: {
    /** YYYY-MM-DD Sunday of the week the user fell behind on. */
    weekKey: string;
    /** Ratio of real runs / weekly target. e.g. 0.25 = 1/4. */
    completedRatio: number;
    realRunCount: number;
    weeklyTarget: number;
  };
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
   * Backlog #9 (Helms H5): how many times the adjustment rule has already
   * cut volume for the CURRENT stall without it clearing. Reset to 0 the
   * moment the programme is no longer plateaued. Its only job is the
   * flowchart's second-order branch — if a light week didn't fix it, the
   * problem isn't fatigue, so escalate to reorganising rather than cutting
   * again. Optional with a defaulting reader → no schema bump.
   */
  plateauResponses?: number;
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
  /**
   * Blk2: the training block that owns the lift prescription, or absent for
   * the overwhelmingly common no-block case. Optional with a defaulting
   * reader → no schema bump, same pattern as `plateauResponses` above.
   *
   * Client-written and never read by a function, but it is allow-listed in
   * `functions/lib/programStateSanitizer.js` — keep in lockstep, and note
   * the two server paths fail in OPPOSITE directions without the entry:
   * `applyProgramCommand` rejects the whole command (the deload button
   * throws), `configurePlan` warns and drops (the block silently vanishes
   * on every settings save).
   */
  trainingBlock?: ActiveTrainingBlock;
  /**
   * PROGRAM-DELOAD-01: present only between a user-applied deload and
   * its undo (or the next week rollover, after which the weekNumber
   * guard makes it inert). Server-written by the applyDeloadWeek
   * command; also allow-listed in functions/programStateSanitizer.js —
   * keep in lockstep.
   */
  deloadSnapshot?: DeloadSnapshot;
  /**
   * RUN-EASE-01: present only between a user-applied easier week and its
   * undo (or the next week rollover, after which the weekNumber guard
   * makes it inert and the regenerated runDays make it moot). Server-
   * written by the applyEaseWeek command; also allow-listed in
   * functions/lib/programStateSanitizer.js — keep in lockstep.
   */
  easeSnapshot?: EaseSnapshot;
  /**
   * D1: local week key (Sunday, `localWeekKey()`) of the week the current
   * `workouts` were generated for. The LIFT side's calendar anchor.
   *
   * Why it had to exist. The auto week-rollover was keyed on
   * `runDays[0].weekKey` — a RUN field — and returned early for freeform
   * users, who have no runDays. So a pure lifter had no automatic rollover at
   * all, and the only other path was a manual button gated on every day being
   * completed-or-skipped. Miss one Friday, never tap "skip", and the
   * programme froze on week N permanently: no deload, no adjustment rule, no
   * mesocycle rotation, forever. Per CLAUDE.md's design-for-the-user-base
   * rule that is the modal path, not an edge case.
   *
   * Written by `advanceWeek`, so both the manual and automatic paths stamp it
   * without either having to remember. Backfilled to the CURRENT week by
   * `migrateProgramState` — a legacy doc has no anchor, and treating "absent"
   * as "stale since epoch" would roll a returning user forward twelve weeks
   * and three deloads on first open.
   *
   * Optional with a defaulting reader → no schema bump (see
   * docs/proposals/schema-versioning.md).
   */
  liftWeekKey?: string;

  /**
   * Canonical muscles given a RECOVERY SESSION on the most recent weekly
   * advance (14b) — halved sets and reps at held load, per RP Ch3 P202.
   *
   * Persisted for one reason: the cut restores itself in full via
   * `applyWeeklyVolumeShape`, so a muscle sitting at its ceiling would show
   * the MRV signal again immediately and oscillate half → full → half. This is
   * the refractory list that stops that — a muscle here is re-entering and is
   * not eligible for another recovery session this week. `advanceWeek` clears
   * it as it writes the next one, so it never accumulates.
   *
   * NOT a history: it holds one week only, and `recoveryTrigger.ts` explains
   * why this is a local device rather than RP Ch3 P203's midpoint re-entry.
   *
   * Optional with a defaulting reader → no schema bump. Absent means "nothing
   * re-entering", which is the correct reading for every existing document, so
   * there is nothing to backfill.
   */
  recoveringMuscles?: CanonicalMuscle[];

  /**
   * The last exercise removed through the command boundary, stashed verbatim
   * so `restoreExercise` can undo it (P6).
   *
   * SERVER-WRITTEN. `removeExercise` fills it; `restoreExercise` consumes and
   * clears it. The client never sets it — that is the point: the client cannot
   * reconstruct a removed exercise's logged history or calibrated load, so an
   * undo that rebuilt from the catalog would silently return a different
   * exercise wearing the same name.
   *
   * ONE slot, overwritten by the next removal. A history of removals is a
   * different feature; the v8 evaluation argues specifically for "a
   * single-slot lastEngineChange + one-tap undo" over an immutable version
   * store, and this is that shape.
   *
   * Optional with a defaulting reader → no schema bump. Absent means "nothing
   * to undo", correct for every existing document.
   */
  lastRemovedExercise?: {
    dayIndex: number;
    /** Position it held, so the undo puts it back where it was. */
    index: number;
    exercise: ProgramExercise;
    /** Epoch ms — the server refuses a restore older than its window. */
    removedAt: number;
  };
}

/* ================================
   WEEKLY PRESCRIPTION
================================ */

/**
 * Transient — computed per call by `generateWeekPrescription`, never persisted.
 *
 * `intensityMultiplier` and `volumeModifier` were removed here after a grep
 * across `src/` and `functions/` found zero readers: they were written on
 * every call and consumed by nothing, so the advertised 2.5%/week intensity
 * ramp was never behaviour. See `generateWeekPrescription` for why they were
 * deleted rather than wired.
 */
export interface WeeklyPrescription {
  week: number;
  deload: boolean;
}

/* ================================
   BACKWARD-COMPAT NORMALIZER
================================ */

/**
 * Stable per-instance id for a ProgramExercise (#1038). Prefers
 * crypto.randomUUID; falls back to a timestamp+random token in environments
 * without it (older WebViews / jsdom without the global).
 */
export function generateInstanceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `ex_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function normalizeExercise(
  ex: Partial<ProgramExercise> & { name: string; exerciseId: string }
): ProgramExercise {
  return {
    name: ex.name,
    exerciseId: ex.exerciseId,
    // #1038: assign once, keep thereafter — idempotent so the persist-if-
    // changed guard on read only writes the first time a legacy plan loads.
    instanceId: ex.instanceId ?? generateInstanceId(),
    movementCategory:
      ex.movementCategory ?? inferMovementCategory(ex.name, ex.exerciseId),
    sets: ex.sets ?? 3,
    reps: ex.reps ?? 8,
    baseReps: ex.baseReps ?? ex.reps ?? 8,
    // Optional fields must be carried explicitly — this function rebuilds
    // the object field-by-field, so anything omitted here is silently
    // stripped on every load. Conditional spread keeps `undefined` out of
    // the object (Firestore rejects undefined values at the setDoc site).
    ...(ex.repRangeMax !== undefined ? { repRangeMax: ex.repRangeMax } : {}),
    ...(ex.baseSets !== undefined ? { baseSets: ex.baseSets } : {}),
    ...(ex.preDeloadWeight !== undefined
      ? { preDeloadWeight: ex.preDeloadWeight }
      : {}),
    ...(ex.preDeloadReps !== undefined
      ? { preDeloadReps: ex.preDeloadReps }
      : {}),
    ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
    ...(ex.restSeconds !== undefined ? { restSeconds: ex.restSeconds } : {}),
    ...(ex.isAccessory !== undefined ? { isAccessory: ex.isAccessory } : {}),
    ...(ex.rotationAnchor !== undefined
      ? { rotationAnchor: ex.rotationAnchor }
      : {}),
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
  backfill?: { primaryGoal?: PrimaryGoal }
): ProgramState {
  // Backfill primaryGoal from UserProfile for pre-W1a docs. Keeps the
  // program-page legibility line functional for legacy users without
  // forcing a migration. If both `state.primaryGoal` and
  // `backfill.primaryGoal` are missing, we DO NOT write the field —
  // adding `primaryGoal: undefined` as an explicit property would
  // crash the `setDoc` call site in useProgram.ts because Firestore
  // rejects `undefined` field values. The UI falls back to a generic
  // label when the field is absent (issue #845).
  const resolvedPrimaryGoal = state.primaryGoal ?? backfill?.primaryGoal;
  return {
    ...state,
    settings: state.settings ?? { autoProgression: true, microloading: true },
    weekHistory: state.weekHistory ?? [],
    ...(resolvedPrimaryGoal !== undefined && {
      primaryGoal: resolvedPrimaryGoal,
    }),
    workouts: (state.workouts ?? []).map((day) => ({
      ...day,
      skipped: day.skipped ?? false,
      exercises: (day.exercises ?? []).map((ex) => normalizeExercise(ex)),
    })),
  };
}

/* ── Plan-measure value vocabularies (D3 — single source) ─────────────────
   These plan-shaping enums were duplicated across the onboarding + settings
   capture surfaces (Onboarding.tsx, ProgrammeSettings.tsx, TrainingSection.tsx)
   and ~5 lib modules — each able to drift. Canonicalise here next to Goal /
   PrimaryGoal / PreferredSplit. The `VALID_*` arrays are the runtime allow-
   lists; the types derive from them so the two can't disagree. RunMode stays
   in planBuilder (it already exports the 3-state union; runModeResolution's
   2-state variant is a deliberately distinct type). */
export const VALID_EXPERIENCE = [
  "beginner",
  "intermediate",
  "advanced",
] as const;
export type Experience = (typeof VALID_EXPERIENCE)[number];

export const VALID_EQUIPMENT = ["full_gym", "home_gym", "minimal"] as const;
export type Equipment = (typeof VALID_EQUIPMENT)[number];

export const VALID_RACE_DISTANCE = ["5k", "10k", "half", "marathon"] as const;
export type RaceDistance = (typeof VALID_RACE_DISTANCE)[number];
