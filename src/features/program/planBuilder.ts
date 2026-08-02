/**
 * planBuilder · P0-C · spec v7.
 *
 * The architectural centre. ONE function that creates a complete
 * plan (profile updates + weekSchedule + programState) from user
 * inputs. Called by both Onboarding (P0-5) and Configure Plan
 * (P0-9). Single source of truth — no drift between the two surfaces.
 *
 * ## Purity contract
 *
 * `buildPlan` MUST be pure. Specifically:
 *
 *   - No Firestore writes. Callers (CFs) handle persistence.
 *   - No React hook calls. Callable from Node tests + Cloud Functions.
 *   - No implicit `new Date()`. The `currentDate` arg is the only
 *     time source.
 *   - No `toISOString().split('T')` UTC bugs. Date math goes through
 *     `src/lib/dateHelpers.ts`.
 *   - Same input → same output. Property-tested.
 *
 * The skeleton in P0-C uses existing engines (programEngine,
 * runScheduler) as building blocks. Post-processing brings the
 * v1 runScheduler output up to v2 ScheduledRunDay shape
 * (id/date/weekKey/status). P0-3 will refactor runScheduler to
 * produce v2 natively + drive scheduling from `weekSchedule`.
 *
 * ## Five sub-builders
 *
 * Per the v6 ChatGPT correction (avoid the god function):
 *
 *   buildWeekSchedule  — calls generateSchedule (Both-aware from P0-B)
 *   buildLiftProgram   — wraps existing programEngine.generateProgram
 *   buildRunPlan       — wraps runScheduler + post-processes to v2
 *   buildProfileUpdates — collates profile patch
 *   validatePlanOutput — pre-flight check matching CF validation
 *
 * `buildPlan` coordinates these. Each is independently testable.
 */

import type {
  Goal,
  PreferredSplit,
  PrimaryGoal,
  ProgramExercise,
  ProgramState,
  ScheduledRunDay,
  RunPlan,
  SplitType,
  WorkoutDay,
} from "./programTypes";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  CURRENT_WEEKSCHEDULE_VERSION,
} from "./programTypes";
import { generateSchedule, type ScheduleDay } from "@/lib/scheduleUtils";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { generateProgram, expectedDayCount } from "./programEngine";
import {
  loadContextFrom,
  seedStartingLoads,
  weightAfterExerciseSwap,
} from "./startingLoads";
import { applyComplexityGate, toExperience } from "./experienceModel";
import { exerciseBank } from "./variationBank";
import {
  applyInjuryFiltersToWorkouts,
  applyEquipmentFilterToWorkouts,
} from "./matchTemplate";
import {
  generateRacePlanV2,
  scheduleStructuredWeekV2,
  DEFAULT_RUN_TUNING,
  type RunTuning,
} from "./runScheduler";

/* ─── Types ─────────────────────────────────────────────────────── */

export type RunMode = "freeform" | "structured" | "race_prep";

export interface PlanBuilderInput {
  /** Training-focus enum (hypertrophy / strength / etc.). Drives
   *  rep ranges + volume in the lift engine. */
  primaryGoal: PrimaryGoal;

  /** Nutrition phase (cut / lean bulk / recomp). Distinct from
   *  primaryGoal — see programTypes.ts for the disambiguation. */
  nutritionPhase: Goal;

  experience: "beginner" | "intermediate" | "advanced";

  /**
   * The experience level the EXISTING plan was built at, when there is one.
   *
   * Without it a level change is invisible to the builder: `buildLiftProgram`
   * preserves the saved week whenever the lift-day count is unchanged, so
   * switching Beginner ↔ Advanced in Settings produced byte-identical
   * workouts — while the confirm modal listed "Experience: intermediate →
   * beginner" as a change and the flow ended on a "Plan updated" toast.
   * Measured 2026-07-28; the plan the user was told they had updated was the
   * plan they already had.
   *
   * Not persisted on ProgramState: the caller edits a profile and therefore
   * already knows the value it is replacing, and a stored copy would be a
   * second source of truth for something the profile already owns.
   */
  previousExperience?: string;

  /** Bodyweight (kg) + sex — seed bodyweight-relative cold-start starting loads
   *  (D-LIFT-5). Optional: when absent the engine keeps its hardcoded defaults. */
  bodyweightKg?: number;
  sex?: string;

  /** Number of lift days the user wants per week. */
  liftDays: number;

  /** User-facing split *preference* (incl. `bro_split` / `auto`) — persisted
   *  to `profile.preferredSplit` and scored by `matchTemplate`, but INERT in
   *  plan shape (`chooseSplit` derives structure from lift days). Typed
   *  `PreferredSplit`, not the engine `SplitType` — the old `as SplitType`
   *  cast claimed a value the engine enum can't represent. */
  preferredSplit: PreferredSplit;

  runMode: RunMode;

  /** Run days per week. Ignored when runMode === "freeform". */
  weeklyRunDays: number;

  /** Required when runMode === "race_prep". */
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    /** Optional user-entered event name, ≤60 chars. */
    eventName?: string;
  };

  /** Pgm6 tuning knobs (volume preset + difficulty). Optional —
   *  omitted means `standard`/`standard`, which is byte-identical to
   *  the pre-Pgm6 plan shape. Persisted flat on the profile as
   *  `runVolume` / `runDifficulty` so weekly refresh regens read the
   *  same knobs this build used. */
  runTuning?: RunTuning;

  equipment: "full_gym" | "home_gym" | "minimal";

  injuries: string[];

  /** REQUIRED for determinism. Local YYYY-MM-DD. Never read wall
   *  clock inside buildPlan — pass this explicitly so tests are
   *  deterministic and Cloud Functions get reproducible results. */
  currentDate: string;

  /** Existing program state — provided for Configure Plan rebuilds
   *  so historical metadata (currentPhase, weekNumber, etc.) can be
   *  preserved while runDays/workouts regenerate. Omit for first-
   *  time plan creation (onboarding). */
  existingState?: ProgramState;

  /** When true, preserve `weekNumber`, `currentPhase`, `weekHistory`,
   *  `updatedAt` semantics from `existingState`. Onboarding passes
   *  false; Configure Plan passes true. */
  preserveHistory?: boolean;
}

export interface PlanBuilderOutput {
  programState: ProgramState;
  weekSchedule: ScheduleDay[];
  /** Partial profile fields the caller should write alongside
   *  programState. Always includes weekScheduleVersion. */
  profileUpdates: {
    weekSchedule: ScheduleDay[];
    weekScheduleVersion: number;
    weeklyWorkoutsTarget: number;
    weeklyRunDaysTarget: number;
    weeklyRunsTarget: number; // legacy field — keep in sync
    runMode: RunMode;
    raceGoal?: PlanBuilderInput["raceGoal"];
    primaryGoal: PrimaryGoal;
    // Pgm4: persist the plan-shaping inputs so the stored profile matches
    // the generated plan. Pre-Pgm4 these were only writable via the
    // onboarding-retake; the unified Programme Settings editor now edits
    // them, so buildPlan must emit them (all four are already in the
    // configurePlan CF sanitiser allow-list, profileSanitizer.js).
    experience: PlanBuilderInput["experience"];
    equipment: PlanBuilderInput["equipment"];
    injuries: string[];
    preferredSplit: PlanBuilderInput["preferredSplit"];
    // Pgm6: the tuning knobs persist flat so every weekly-refresh /
    // realign regen site can rebuild the SAME plan shape the user
    // saved (runTuningFromProfile reads these; missing → standard).
    runVolume: RunTuning["volume"];
    runDifficulty: RunTuning["difficulty"];
    // Pgm4: nutrition phase lives on profile.program.goal — that's what
    // every macro/calorie consumer reads (phaseNutrition, useEffectiveTargets,
    // calorieBalance, …), NOT programState.goal. Emit it so a phase change in
    // the unified editor actually moves the user's targets. The CF write is
    // merge:true on a nested map, so this updates goal while preserving the
    // existing startWeight / currentPhase. (The deleted ProgramSettingsPanel
    // synced this via regenerateProgram → updateProfile; the new path must
    // carry it explicitly.)
    program: { goal: Goal };
  };
}

/* ─── Sub-builders ──────────────────────────────────────────────── */

/** Produces the 7-day type structure (lift/run/both/rest). Pure. */
function buildWeekSchedule(input: PlanBuilderInput): ScheduleDay[] {
  const runDays = input.runMode === "freeform" ? 0 : input.weeklyRunDays;
  return generateSchedule(input.liftDays, runDays);
}

/**
 * Lift programme. Pgm5 (Q2 — structure-preserving regeneration): a CONTENT
 * edit (goal / nutrition / experience / equipment / injuries with the same
 * lift-day count) preserves the user's day structure and all safe exercise
 * customisations. The engine only rebuilds from template when there is no
 * existing programme, the experience tier changes, or the lift-day count
 * changes. Explicit Reset stays destructive via a separate path
 * (useProgram.regenerateProgram → generateProgram directly).
 *
 * Injury/equipment edits re-apply their filters in place. Only an exercise
 * that is now unsafe or unavailable changes identity; its slot prescription
 * survives while its movement-specific load/history is safely reinitialised.
 * A remaining follow-up is goal-driven rep/volume rescheme (it needs a
 * per-exercise role anchor the stored ProgramExercise lacks).
 */
function buildLiftProgram(input: PlanBuilderInput): {
  splitType: SplitType;
  workouts: WorkoutDay[];
} {
  const existing = input.existingState?.workouts;
  const loadCtx = loadContextFrom({
    weightKg: input.bodyweightKg,
    experience: input.experience,
    sex: input.sex,
  });
  const sameDayCount =
    !!existing &&
    existing.length > 0 &&
    existing.length === expectedDayCount(input.liftDays);
  // A level change restructures the programme — which movements are chosen
  // and whether the week undulates — so it has to rebuild even though the
  // skeleton is the same shape.
  const levelChanged =
    input.previousExperience !== undefined &&
    toExperience(input.previousExperience) !== toExperience(input.experience);

  const base =
    sameDayCount && !levelChanged && input.existingState
      ? // Content edit → preserve the user's structure + customizations.
        { splitType: input.existingState.splitType, workouts: existing }
      : // No existing plan, or lift-days changed → rebuild from template.
        generateProgram(
          input.nutritionPhase,
          input.liftDays,
          existing,
          input.primaryGoal,
          loadCtx,
          // Backlog #10 (M6): the week's SHAPE, derived from the SAME inputs
          // this builder uses for the schedule it is about to write, so the
          // programme is ordered against the week the user will actually get.
          // Read-only — lifts stay split-ordered (ADR-0002).
          buildWeekSchedule(input),
          toExperience(input.experience)
        );

  // Experience gate (2026-07-28). `generateProgram` gates internally, but that
  // is not enough and a sweep proved it: the PRESERVE branch above never calls
  // `generateProgram` at all, so a beginner seeded from a template — the only
  // seed path at onboarding — was never gated once. Running it here covers
  // both branches, and it is idempotent, so the generated path pays nothing.
  const levelled = applyComplexityGate(
    base.workouts,
    toExperience(input.experience),
    exerciseBank,
    (ex, toId) =>
      weightAfterExerciseSwap(ex as ProgramExercise, toId, loadCtx).weight
  );

  // Pgm5 follow-ups: honour the user's CURRENT injuries and equipment on the
  // regeneration path (generateProgram ignores both; the preserve branch keeps
  // whatever was there). Injuries first (safety), then equipment — the
  // equipment picker is injury-aware, so a swap never reintroduces a risk.
  // Both deep-clone (the pure builder never aliases existingState) and are
  // no-ops for healthy / full-gym users.
  //
  // These run AFTER the gate and are NOT level-aware, which is a measured
  // decision — see `applyEquipmentFilterToWorkouts`. Gating them was tried and
  // either made things worse (a beginner keeping equipment they don't own) or
  // changed nothing (no simple alternative exists in the bank). What remains
  // is bank coverage, recorded in the backlog, not a filter bug.
  const injurySafe = applyInjuryFiltersToWorkouts(
    levelled,
    input.injuries,
    input.equipment,
    loadCtx
  );
  const equipmentSafe = applyEquipmentFilterToWorkouts(
    injurySafe,
    input.equipment,
    input.injuries,
    toExperience(input.experience),
    loadCtx
  );
  // Template-seeded onboarding takes the preserve branch above. Those rows
  // historically arrived at 0 kg and therefore never passed through
  // generateProgram's cold-start seeding. Run the idempotent seeder across
  // the final shape so both generated and preserved plans are calibrated.
  const workouts = loadCtx
    ? seedStartingLoads(equipmentSafe, loadCtx)
    : equipmentSafe;
  return { splitType: base.splitType, workouts };
}

/** Builds runDays + runPlan for the requested mode. Pure (relies on
 *  injected currentDate, not wall clock). Uses the V2 scheduler API
 *  (P0-3) — both `scheduleStructuredWeekV2` and `generateRacePlanV2`
 *  drive from `weekSchedule` directly and emit native v2-shaped
 *  runDays. No post-processing bridge needed here anymore. */
function buildRunPlan(
  input: PlanBuilderInput,
  weekSchedule: ScheduleDay[]
): { runDays: ScheduledRunDay[]; runPlan: RunPlan | undefined } {
  // The week containing `currentDate` is the plan's week 0. Use
  // localWeekKey to find the Sunday-start anchor.
  const weekStart = localWeekKey(parseLocalDate(input.currentDate));

  if (input.runMode === "freeform") {
    return { runDays: [], runPlan: undefined };
  }

  if (input.runMode === "race_prep") {
    if (!input.raceGoal) {
      // race_prep without raceGoal is an invalid input; the
      // validator catches this. Return empty + undefined defensively.
      return { runDays: [], runPlan: undefined };
    }
    const racePlan = generateRacePlanV2({
      weekSchedule,
      raceGoal: input.raceGoal,
      weeklyRunDays: input.weeklyRunDays,
      currentDate: input.currentDate,
      weekStart,
      tuning: input.runTuning ?? DEFAULT_RUN_TUNING,
    });
    return {
      runDays: racePlan.weeks[0] ?? [],
      runPlan: {
        mode: "race_prep",
        raceGoal: input.raceGoal,
        totalWeeks: racePlan.totalWeeks,
        currentWeek: 0,
        // P2-1: thread the compressed flag through so the Programme
        // run section can surface a "your plan is compressed" banner.
        compressed: racePlan.compressed,
        // Run9 phase-3 (Slice B): an initial plan set inside the taper-safe
        // floor is finish-safely — carry the marker so the UI names the risk.
        belowFloor: racePlan.belowFloor,
      },
    };
  }

  // structured
  return {
    runDays: scheduleStructuredWeekV2({
      weekSchedule,
      weekNumber: input.existingState?.weekNumber ?? 1,
      weekStart,
    }),
    runPlan: { mode: "structured" },
  };
}

/** Collates the profile-side patch that callers must persist
 *  alongside programState. Single source of truth for what
 *  onboarding + Configure Plan write to `users/{uid}`. */
function buildProfileUpdates(
  input: PlanBuilderInput,
  weekSchedule: ScheduleDay[]
): PlanBuilderOutput["profileUpdates"] {
  const updates: PlanBuilderOutput["profileUpdates"] = {
    weekSchedule,
    weekScheduleVersion: CURRENT_WEEKSCHEDULE_VERSION,
    weeklyWorkoutsTarget: input.liftDays,
    weeklyRunDaysTarget: input.runMode === "freeform" ? 0 : input.weeklyRunDays,
    weeklyRunsTarget: input.runMode === "freeform" ? 0 : input.weeklyRunDays,
    runMode: input.runMode,
    runVolume: (input.runTuning ?? DEFAULT_RUN_TUNING).volume,
    runDifficulty: (input.runTuning ?? DEFAULT_RUN_TUNING).difficulty,
    primaryGoal: input.primaryGoal,
    experience: input.experience,
    equipment: input.equipment,
    injuries: input.injuries,
    preferredSplit: input.preferredSplit,
    program: { goal: input.nutritionPhase },
  };
  if (input.runMode === "race_prep" && input.raceGoal) {
    updates.raceGoal = input.raceGoal;
  }
  return updates;
}

/** Pre-flight validator. Mirrors the Cloud Function validation
 *  rules (P0-4) so client-side preflight catches malformed output
 *  before the network round-trip. Throws on first failure with a
 *  diagnostic message. */
export function validatePlanOutput(output: PlanBuilderOutput): void {
  const { programState, weekSchedule, profileUpdates } = output;

  if (!Array.isArray(weekSchedule) || weekSchedule.length !== 7) {
    throw new Error(
      `planBuilder: weekSchedule must have exactly 7 entries (got ${weekSchedule?.length})`
    );
  }
  const validTypes = new Set(["rest", "lift", "run", "both"]);
  weekSchedule.forEach((d, i) => {
    if (!validTypes.has(d.type)) {
      throw new Error(
        `planBuilder: weekSchedule[${i}].type = "${d.type}" is invalid`
      );
    }
    if (d.day !== i) {
      throw new Error(
        `planBuilder: weekSchedule[${i}].day mismatch (expected ${i}, got ${d.day})`
      );
    }
  });

  const validStatuses = new Set([
    "planned",
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
    "race_completed_unlinked",
  ]);
  (programState.runDays ?? []).forEach((rd, i) => {
    if (!rd.id) throw new Error(`planBuilder: runDays[${i}].id missing`);
    if (!rd.date || !/^\d{4}-\d{2}-\d{2}$/.test(rd.date)) {
      throw new Error(
        `planBuilder: runDays[${i}].date invalid (got "${rd.date}")`
      );
    }
    if (!rd.weekKey)
      throw new Error(`planBuilder: runDays[${i}].weekKey missing`);
    if (!rd.templateId)
      throw new Error(`planBuilder: runDays[${i}].templateId missing`);
    if (!rd.status || !validStatuses.has(rd.status)) {
      throw new Error(
        `planBuilder: runDays[${i}].status invalid (got "${rd.status}")`
      );
    }
    if (rd.userOverride !== undefined && typeof rd.userOverride !== "string") {
      throw new Error(`planBuilder: runDays[${i}].userOverride must be string`);
    }
    // No UTC ISO leak
    if (rd.date.includes("T") || rd.weekKey.includes("T")) {
      throw new Error(
        `planBuilder: runDays[${i}] date/weekKey appears to be UTC ISO`
      );
    }
  });

  if (profileUpdates.runMode === "race_prep") {
    if (!profileUpdates.raceGoal) {
      throw new Error(
        "planBuilder: race_prep mode requires raceGoal in profileUpdates"
      );
    }
    // Parity with the server gate (functions/lib/validatePlanPayload.js):
    // race_prep also requires the materialized programState.runPlan.raceGoal.
    // Unlike runMode-vocabulary and weekScheduleVersion-is-number — which the
    // typed PlanBuilderOutput already guarantees, so the client need not
    // re-check what the server validates off untyped wire data — this is a
    // SEMANTIC invariant TS can't enforce (runPlan and runPlan.raceGoal are
    // both optional). Without it, a buildPlan bug that drops runPlan.raceGoal
    // for a race-prep plan slips past the client preflight and only surfaces
    // as a server rejection.
    if (!programState.runPlan || !programState.runPlan.raceGoal) {
      throw new Error(
        "planBuilder: race_prep mode requires programState.runPlan.raceGoal"
      );
    }
  }

  if (programState.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION) {
    throw new Error(
      `planBuilder: programState.programSchemaVersion must be ${CURRENT_PROGRAM_SCHEMA_VERSION} (got ${programState.programSchemaVersion})`
    );
  }
}

/* ─── Orchestrator ──────────────────────────────────────────────── */

export function buildPlan(input: PlanBuilderInput): PlanBuilderOutput {
  const weekSchedule = buildWeekSchedule(input);
  const { splitType, workouts } = buildLiftProgram(input);
  const { runDays, runPlan } = buildRunPlan(input, weekSchedule);
  const profileUpdates = buildProfileUpdates(input, weekSchedule);

  // Blk2. This literal spreads nothing from `existingState`, so every
  // preserved field has to be named — and `configurePlan` writes the result
  // with `batch.set`, a full replace. Omitting the block would delete it on
  // every settings save (equipment, injuries, days), silently in both
  // directions: nothing errors, and the user's focus quietly reverts.
  // Carried on the same condition as currentPhase/weekNumber; a plan built
  // fresh legitimately has no block.
  const carriedBlock =
    input.preserveHistory && input.existingState?.trainingBlock
      ? input.existingState.trainingBlock
      : undefined;

  const programState: ProgramState = {
    goal: input.nutritionPhase,
    currentPhase:
      input.preserveHistory && input.existingState
        ? input.existingState.currentPhase
        : "Hypertrophy",
    weekNumber:
      input.preserveHistory && input.existingState
        ? input.existingState.weekNumber
        : 1,
    splitType,
    workouts,
    fatigueScore:
      input.preserveHistory && input.existingState
        ? input.existingState.fatigueScore
        : 0,
    updatedAt: parseLocalDate(input.currentDate).getTime(),
    settings: input.existingState?.settings ?? {
      autoProgression: true,
      microloading: true,
    },
    weekHistory:
      input.preserveHistory && input.existingState
        ? (input.existingState.weekHistory ?? [])
        : [],
    runDays,
    runPlan,
    // Blk2: while a block is active it OWNS the focus, so the focus the
    // caller passed loses. Enforced here rather than by asking every call
    // site to thread `block.focus` — this literal is the single place a
    // ProgramState is constructed, so making the pair un-driftable here
    // means no future caller can reintroduce the drift by forgetting.
    primaryGoal: carriedBlock ? carriedBlock.focus : input.primaryGoal,
    programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
    // D1: the lift-week calendar anchor. Same no-merge reasoning as the block
    // above — unnamed here means deleted on every settings save, which would
    // silently disable the automatic week rollover for the exact user it was
    // built for. Derived from `input.currentDate` rather than the clock so
    // `buildPlan` stays a pure function of its input.
    liftWeekKey: localWeekKey(parseLocalDate(input.currentDate)),
    ...(carriedBlock ? { trainingBlock: carriedBlock } : {}),
  };

  const output: PlanBuilderOutput = {
    programState,
    weekSchedule,
    profileUpdates,
  };

  validatePlanOutput(output);
  return output;
}
