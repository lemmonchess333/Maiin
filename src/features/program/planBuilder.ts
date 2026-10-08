import type { RunningBaseline } from "@/features/program/runningBaseline";
import type { RunTimeLimits } from "./runTimeLimits";
import {
  continuingRacePlan,
  continuedBlockWeeks,
  planWeekFromToday,
} from "./racePlanContinuation";
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

import { planningEasyPaceSPerKm, type RunFitnessInput } from "@/lib/runPaces";
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
  DEFAULT_PROGRAM_SETTINGS,
} from "./programTypes";
import { planWeekSchedule, type ScheduleDay } from "@/lib/scheduleUtils";
import {
  addLocalDays,
  localWeekKey,
  parseLocalDate,
  weekPosition,
} from "@/lib/dateHelpers";
import {
  applyDeload,
  balanceWeekVolume,
  generateProgram,
  expectedDayCount,
  oneSetFewer,
  raceWeekSession,
  resetToBaseSets,
  withRaceLegTrim,
} from "./programEngine";
import {
  firstWeekBack,
  isRaceBuildWeek,
  raceBlockWeek,
} from "./weekPrescription";
import { mainRepAnchor } from "./roleTable";
import { represcribeSwapped } from "./represcribe";
import { refitSessionsToTime, sessionMinutesFor } from "./sessionFit";
import {
  loadContextFrom,
  seedStartingLoads,
  weightAfterExerciseSwap,
} from "./startingLoads";
import { applyComplexityGate, toExperience } from "./experienceModel";
import { exerciseBank, exerciseDisplayName } from "./variationBank";
import {
  applyInjuryFiltersToWorkouts,
  applyEquipmentFilterToWorkouts,
  restoreSwappedLifts,
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
   * The experience level the EXISTING plan was built at, when there is one:
   * every settings save passes it, and onboarding, which builds a first plan,
   * does not.
   *
   * A level change is a content edit (Lift4, restoring Pgm5's rule): it
   * never rebuilds the week or swaps an exercise. What this tells the
   * builder is that the week is someone's own, so the experience gate leaves
   * its exercises alone; only a plan being built is gated.
   *
   * Not persisted on ProgramState: the caller edits a profile and therefore
   * already knows the value it is replacing, and a stored copy would be a
   * second source of truth for something the profile already owns.
   */
  previousExperience?: string;

  /**
   * How long a session the person has, in minutes
   * (`profile.liftTimeBudgetMinutes`, asked on the days step; Lift4 (5)). A
   * new plan's sessions are fitted to it (`sessionFit.ts`), an hour when it
   * was never answered.
   */
  sessionMinutes?: number;
  /**
   * The session length as the settings form found it. When a save changes
   * it, the plan the person has is re-fitted to the new one: sets only, so
   * their lifts and history stay (`refitSessionsToTime`). Onboarding, which
   * builds a first plan, does not pass it.
   */
  previousSessionMinutes?: number;

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
  /** Run17 — the runner's `profile.runFitness`, so the long-run ceiling is
   *  measured at their confirmed easy pace (`planningEasyPaceSPerKm`
   *  applies RUN-EV-08's gate). Omitted → the nominal tier table. */
  runFitness?: RunFitnessInput | null;
  runningBaseline?: RunningBaseline | null;
  runTimeLimits?: RunTimeLimits | null;
  recentLayoff?: import("./layoffDetection").LayoffClass;
  weekSchedule?: ScheduleDay[];
  raceGoal?: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    /** Optional user-entered event name, ≤60 chars. */
    eventName?: string;
    /** A2: optional goal finish time, seconds. Passed through to the
     *  profile; the scheduler does not consume it yet (goal-pace
     *  sessions are the follow-up slice). */
    targetTimeS?: number;
  };

  /** Pgm6 tuning knobs (volume preset + difficulty). Optional —
   *  omitted means `standard`/`standard`, which is byte-identical to
   *  the pre-Pgm6 plan shape. Persisted flat on the profile as
   *  `runVolume` / `runDifficulty` so weekly refresh regens read the
   *  same knobs this build used. */
  runTuning?: RunTuning;

  equipment: "full_gym" | "home_gym" | "minimal";

  /** Lift4 (11): a barbell and a rack beside a home gym's or a minimal
   *  setup's kit ("what do you have?"). */
  barbellAtHome?: boolean;

  /** Lift4 (10): the answer at race setup to "Lighten leg sessions while
   *  your runs build?". Saved on the profile, and the week being saved in
   *  takes it at once when it is a build week. */
  raceLegTrim?: boolean;

  /** Lift4 (11): "I have small plates", for a new plan's settings; a plan
   *  the person has keeps the setting it has. */
  smallPlates?: boolean;

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
    /** Explicit null = clear the goal (freeform save via configurePlan —
     *  RUN-EV-02; the CF sanitizer preserves a literal null). The optional
     *  eventSpaceId is the catalogue binding a caller may re-attach —
     *  buildPlan itself never sets it. */
    raceGoal?:
      | (PlanBuilderInput["raceGoal"] & { eventSpaceId?: string })
      | null;
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
    nonRaceGoal?: import("@/lib/nonRaceGoal").NonRaceGoal | null;
    runningBaseline?: RunningBaseline | null;
    runTimeLimits?: RunTimeLimits | null;
    /** The session length the plan was built for (Lift4 (5)). */
    liftTimeBudgetMinutes?: number;
    /** A barbell and a rack beside the equipment tier's kit (Lift4 (11)). */
    barbellAtHome?: boolean;
    /** The race-setup answer on the leg trim (Lift4 (10)). */
    raceLegTrim?: boolean;
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
  return planWeekSchedule(input.liftDays, runDays, input.weekSchedule);
}

/**
 * Lift programme. Pgm5 (Q2 — structure-preserving regeneration): a CONTENT
 * edit (goal / nutrition / experience / equipment / injuries with the same
 * lift-day count) preserves the user's day structure and all safe exercise
 * customisations. The engine only rebuilds from template when there is no
 * existing programme or the lift-day count changes; a level change is a
 * content edit (Lift4). Explicit Reset stays destructive via a separate path
 * (useProgram.regenerateProgram → generateProgram directly).
 *
 * Injury/equipment edits re-apply their filters in place. Only an exercise
 * that is now unsafe or unavailable changes identity; it takes its own
 * role's numbers (`represcribeSwapped`), and its movement-specific
 * load/history is safely reinitialised.
 */
function buildLiftProgram(input: PlanBuilderInput): {
  splitType: SplitType;
  workouts: WorkoutDay[];
  /** The session length the workouts are fitted to; absent for a plan
   *  kept as it was, built before plans were fitted to time. */
  sessionMinutes?: number;
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
  // A level change is a content edit like any other (Lift4, restoring
  // Pgm5's rule): it never rebuilds the week and never swaps an exercise.
  // The level reaches the plan through what reads it — whether lighter
  // weeks come and the RPE row now, the exercises a plan built later picks.
  const preserve = sameDayCount && !!input.existingState;

  const base =
    preserve && input.existingState
      ? // Content edit → preserve the user's structure + customizations.
        { splitType: input.existingState.splitType, workouts: existing }
      : // No existing plan, or lift-days changed → rebuild from template.
        // The new week starts from the plan's own numbers, not this week's
        // lighter ones, which `keepWeekLighter` applies again.
        generateProgram(
          input.liftDays,
          existing && resetToBaseSets(existing),
          input.primaryGoal,
          loadCtx,
          // Backlog #10 (M6): the week's SHAPE, derived from the SAME inputs
          // this builder uses for the schedule it is about to write, so the
          // programme is ordered against the week the user will actually get.
          // Read-only — lifts stay split-ordered (ADR-0002).
          buildWeekSchedule(input),
          toExperience(input.experience),
          sessionMinutesFor(input.sessionMinutes),
          {
            equipment: input.equipment,
            injuries: input.injuries,
            barbellAtHome: input.barbellAtHome,
          }
        );

  // Experience gate (2026-07-28). `generateProgram` gates internally, but that
  // is not enough and a sweep proved it: the PRESERVE branch above never calls
  // `generateProgram` at all, so a beginner seeded from a template — the only
  // seed path at onboarding — was never gated once. It is idempotent, so the
  // generated path pays nothing.
  //
  // Only for a plan being built: a generated one, or a template seeded at
  // onboarding, the one caller with no previous level. A settings save keeps
  // the exercises the plan has. Gated there, a level change kept as a content
  // edit would come back later as swaps on an unrelated save (Lift4: the
  // engine never swaps an exercise on its own).
  const building = !preserve || input.previousExperience === undefined;
  const levelled = building
    ? applyComplexityGate(
        base.workouts,
        toExperience(input.experience),
        exerciseBank,
        (ex, toId) =>
          weightAfterExerciseSwap(ex as ProgramExercise, toId, loadCtx).weight,
        exerciseDisplayName
      )
    : base.workouts;

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
  // A limitation lifted brings back the lifts it swapped out (Lift4 (11)).
  const injurySafe = applyInjuryFiltersToWorkouts(
    restoreSwappedLifts(
      levelled,
      input.injuries,
      input.equipment,
      loadCtx,
      input.barbellAtHome
    ),
    input.injuries,
    input.equipment,
    loadCtx,
    input.barbellAtHome
  );
  // A lift the swaps bring in takes its own role's numbers; a new plan's
  // were swapped in the generator, before its role table.
  const equipmentSafe = represcribeSwapped(
    levelled,
    applyEquipmentFilterToWorkouts(
      injurySafe,
      input.equipment,
      input.injuries,
      toExperience(input.experience),
      loadCtx,
      input.barbellAtHome
    ),
    input.primaryGoal,
    toExperience(input.experience)
  );
  // Lift4 (5): a settings save that changes the session length re-fits the
  // plan the person has, sets only. Anything else keeps the plan's sets as
  // they are, and the length it was fitted to.
  const refit =
    preserve &&
    input.sessionMinutes !== undefined &&
    input.previousSessionMinutes !== undefined &&
    input.sessionMinutes !== input.previousSessionMinutes;
  const fitted = refit
    ? refitWeek(
        equipmentSafe,
        input.primaryGoal,
        toExperience(input.experience),
        sessionMinutesFor(input.sessionMinutes)
      )
    : equipmentSafe;
  const sessionMinutes = !preserve
    ? sessionMinutesFor(input.sessionMinutes)
    : refit
      ? sessionMinutesFor(input.sessionMinutes)
      : input.existingState?.sessionMinutes;
  // Template-seeded onboarding takes the preserve branch above. Those rows
  // historically arrived at 0 kg and therefore never passed through
  // generateProgram's cold-start seeding. Run the idempotent seeder across
  // the final shape so both generated and preserved plans are calibrated.
  // With no bodyweight, a lift with no load starts from the bar (Lift4 (5));
  // the loads a plan already shows stay.
  const workouts = seedStartingLoads(
    fitted,
    loadCtx,
    // Must carry the SAME rep anchor generateProgram used, or this pass
    // silently undoes it: this seeder runs last and is the one that
    // decides the final weight for every buildPlan path, including the
    // preserve branch that never reaches generateProgram at all. Omitting
    // it here made a `running` plan render 4-6 reps at the unchanged
    // 8-rep weight — the exact "tested copy vs running copy" shape, with
    // both copies in the same feature directory.
    mainRepAnchor(input.primaryGoal, toExperience(input.experience)),
    { unloadedOnly: !loadCtx }
  );
  return {
    splitType: base.splitType,
    // New days or a new session length build the week's sets afresh, so a
    // week made lighter goes lighter again (`keepWeekLighter`).
    workouts: !preserve || refit ? keepWeekLighter(input, workouts) : workouts,
    ...(sessionMinutes !== undefined ? { sessionMinutes } : {}),
  };
}

/**
 * A rebuild inside a lighter week keeps the week lighter (the precedence
 * table in the lifting handoff): half the sets in a lighter week, with race
 * week's one short session; one set fewer in the first week back. Without
 * it, new lift days or a new session length gave the week its full sets
 * while it still read as lighter.
 */
function keepWeekLighter(
  input: PlanBuilderInput,
  workouts: WorkoutDay[]
): WorkoutDay[] {
  const kept = input.preserveHistory ? input.existingState : undefined;
  if (!kept) return workouts;
  if (kept.currentPhase === "deload") {
    const lighter = applyDeload(workouts);
    return kept.raceWeek === "race"
      ? raceWeekSession(lighter, kept.settings?.smallPlates === true)
      : lighter;
  }
  return firstWeekBack(kept) ? oneSetFewer(workouts) : workouts;
}

/** A re-fitted week, balanced as a new plan's is, with its volume anchor
 *  (`baseSets`) moved to the sets it now has. */
function refitWeek(
  workouts: WorkoutDay[],
  goal: PrimaryGoal,
  experience: ReturnType<typeof toExperience>,
  minutes: number
): WorkoutDay[] {
  return balanceWeekVolume(
    refitSessionsToTime(workouts, goal, experience, minutes),
    goal,
    experience,
    minutes
  ).map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({ ...ex, baseSets: ex.sets })),
  }));
}

/**
 * The race build's leg trim on the week a plan is saved in (Lift4 (10)):
 * a yes at race setup trims the leg lifts at once in a build week, where
 * the rollover would have; a no gives back what a trim took. Not inside a
 * lighter week, a race's final weeks or the first week back, which have
 * fewer sets already. A week kept (`preserveHistory`) keeps which race week
 * it is.
 */
function raceLegTrimNow(
  input: PlanBuilderInput,
  workouts: WorkoutDay[],
  runPlan: RunPlan | undefined
): { workouts: WorkoutDay[]; raceWeek: ProgramState["raceWeek"] } {
  const kept = input.preserveHistory ? input.existingState : undefined;
  const raceWeek = kept?.raceWeek;
  const trim =
    input.raceLegTrim === true &&
    isRaceBuildWeek(raceBlockWeek(runPlan)) &&
    kept?.currentPhase !== "deload" &&
    (raceWeek === undefined || raceWeek === "build") &&
    !(kept && firstWeekBack(kept));
  if (trim)
    return { workouts: withRaceLegTrim(workouts, true), raceWeek: "build" };
  // A lighter week taken in a build week has its own sets: they stay.
  if (raceWeek === "build" && kept?.currentPhase !== "deload")
    return { workouts: withRaceLegTrim(workouts, false), raceWeek: undefined };
  return { workouts, raceWeek };
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
  // localWeekKey to find its first day (Monday — see WEEK_STARTS_ON).
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
    const continued = input.preserveHistory
      ? continuingRacePlan(input.existingState?.runPlan, input.raceGoal)
      : undefined;
    if (continued?.phase === "recovery") {
      return {
        runDays: input.existingState?.runDays ?? [],
        runPlan: continued,
      };
    }
    const racePlan = generateRacePlanV2({
      weekSchedule,
      // New plans have no prior layoff read; settings pass the same
      // account-scoped evidence as the live weekly generator.
      recentLayoff: input.recentLayoff ?? "none",
      raceGoal: input.raceGoal,
      weeklyRunDays: input.weeklyRunDays,
      currentDate: input.currentDate,
      weekStart,
      tuning: input.runTuning ?? DEFAULT_RUN_TUNING,
      easyPaceSPerKm: planningEasyPaceSPerKm(input.runFitness),
      runningBaseline: input.runningBaseline,
      runTimeLimits: input.runTimeLimits,
      planTotalWeeks: continued?.totalWeeks,
    });
    const totalWeeks = continuedBlockWeeks(racePlan.totalWeeks, continued);
    return {
      runDays: planWeekFromToday(
        racePlan.weeks[0] ?? [],
        input.currentDate,
        continued
          ? {
              runDays: input.existingState?.runDays ?? [],
              manualCompletions: input.existingState?.manualCompletions,
            }
          : undefined
      ),
      runPlan: {
        ...continued,
        mode: "race_prep",
        raceGoal: input.raceGoal,
        totalWeeks,
        currentWeek: totalWeeks - racePlan.totalWeeks,
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
    runDays: planWeekFromToday(
      scheduleStructuredWeekV2({
        weekSchedule,
        weekNumber: input.existingState?.weekNumber ?? 1,
        weekStart,
      }),
      input.currentDate
    ),
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
  if (input.sessionMinutes !== undefined)
    updates.liftTimeBudgetMinutes = sessionMinutesFor(input.sessionMinutes);
  if (input.barbellAtHome !== undefined)
    updates.barbellAtHome = input.barbellAtHome;
  if (input.raceLegTrim !== undefined) updates.raceLegTrim = input.raceLegTrim;
  if (input.runningBaseline !== undefined)
    updates.runningBaseline = input.runningBaseline;
  if (input.runTimeLimits !== undefined)
    updates.runTimeLimits = input.runTimeLimits;
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
  const { splitType, workouts, sessionMinutes } = buildLiftProgram(input);
  const { runDays, runPlan } = buildRunPlan(input, weekSchedule);
  const { workouts: weekWorkouts, raceWeek } = raceLegTrimNow(
    input,
    workouts,
    runPlan
  );
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
    /* LIFT-EV-02 (owner decision 2026-08-09): a fresh plan opens in
       "progression" — the engine's own lifecycle vocabulary (rollover
       writes "progression"/"deload", programEngine ~line 2695) — instead
       of the historical "Hypertrophy" literal, which falsely labelled
       every non-hypertrophy plan's first week. Stimulus labels now come
       from primaryGoal at the display layer (Home) and from
       trainingSignals for nutrition; currentPhase encodes lifecycle
       only. */
    currentPhase:
      input.preserveHistory && input.existingState
        ? input.existingState.currentPhase
        : "progression",
    weekNumber:
      input.preserveHistory && input.existingState
        ? input.existingState.weekNumber
        : 1,
    splitType,
    workouts: weekWorkouts,
    fatigueScore:
      input.preserveHistory && input.existingState
        ? input.existingState.fatigueScore
        : 0,
    updatedAt: parseLocalDate(input.currentDate).getTime(),
    // A new plan takes "I have small plates" from the "what do you have?"
    // list (Lift4 (11)); a plan the person has keeps its settings.
    settings: input.existingState?.settings ?? {
      ...DEFAULT_PROGRAM_SETTINGS,
      ...(input.smallPlates !== undefined
        ? { smallPlates: input.smallPlates }
        : {}),
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
    // Lift4 (5): named for the same reason as the block above.
    ...(sessionMinutes !== undefined ? { sessionMinutes } : {}),
    programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
    // D1: the lift-week calendar anchor. Same no-merge reasoning as the block
    // above — unnamed here means deleted on every settings save, which would
    // silently disable the automatic week rollover for the exact user it was
    // built for. Derived from `input.currentDate` rather than the clock so
    // `buildPlan` stays a pure function of its input.
    // A start late in the week is anchored on next week (firstLiftWeekKey).
    liftWeekKey: firstLiftWeekKey(input),
    ...(carriedBlock ? { trainingBlock: carriedBlock } : {}),
    // Lift4 (11): a rebuild in the weeks back after a break keeps them, or
    // a calendar lighter week could follow the break straight away.
    ...(input.preserveHistory && input.existingState?.easingBack
      ? { easingBack: input.existingState.easingBack }
      : {}),
    // Lift4 (10): and one in a race's final weeks keeps which it is, as it
    // keeps the week's phase.
    ...(raceWeek ? { raceWeek } : {}),
    ...(input.preserveHistory &&
    input.raceGoal &&
    continuingRacePlan(input.existingState?.runPlan, input.raceGoal) &&
    input.existingState?.manualCompletions
      ? { manualCompletions: input.existingState.manualCompletions }
      : {}),
  };

  const output: PlanBuilderOutput = {
    programState,
    weekSchedule,
    profileUpdates,
  };

  validatePlanOutput(output);
  return output;
}

/**
 * The week the lift rollover counts the plan's current week as. The
 * rollover moves on when this week has passed.
 *
 * A fresh plan built Thursday to Sunday is anchored on the NEXT week, so
 * its week 1 runs on to the following Sunday (an owner call). Rolled
 * on the first Monday, a Friday sign-up's week 1 had three days in it,
 * and its later workouts were dropped before a training day came round.
 * Monday to Wednesday still leaves most of a week.
 *
 * Rebuilding an existing plan (a settings save) keeps an anchor that is
 * already ahead, as that long first week and the manual "next week" both
 * write one, instead of pulling it back to this week.
 */
export function firstLiftWeekKey(input: {
  currentDate: string;
  preserveHistory?: boolean;
  existingState?: { liftWeekKey?: string };
}): string {
  const today = parseLocalDate(input.currentDate);
  const thisWeek = localWeekKey(today);
  if (input.preserveHistory && input.existingState) {
    const kept = input.existingState.liftWeekKey;
    return kept && kept > thisWeek ? kept : thisWeek;
  }
  // weekPosition: 0 Monday … 6 Sunday; Thursday is 3.
  return weekPosition(today.getDay()) >= 3
    ? localWeekKey(addLocalDays(today, 7))
    : thisWeek;
}
