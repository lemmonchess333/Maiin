import { useState, useEffect, useCallback } from "react";
import {
  doc,
  getDoc,
  getDocFromCache,
  Timestamp,
  deleteField,
  writeBatch,
} from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { stripUndefined } from "@/lib/firestoreGuards";
import { db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/lib/auth";
import { postActivity } from "@/lib/socialApi";
import { compose, enqueueShare, showQueuedToast } from "@/lib/shareComposer";
import type {
  ActiveTrainingBlock,
  BlockDurationWeeks,
  BlockPace,
  ManualCompletion,
  PrimaryGoal,
  ProgramState,
  ProgramSettings,
  ProgramExercise,
  RunPlan,
  ScheduledRunDay,
  ScheduledRunStatus,
} from "./programTypes";
import {
  BLOCK_AMNESTY_WEEKS,
  isProgressionHeld,
  represcribeWorkouts,
} from "./represcribe";
import { blockWeekOf, makeBlockId } from "./trainingBlock";
import { normalizeProgramState, transitionStatus } from "./programTypes";
import { resolveRecoveryExit } from "./runModeResolution";
import {
  migrateProgramState,
  backfillWeekScheduleIfMissing,
} from "./migrations";
import {
  generateProgram,
  advanceWeek,
  shouldAdvanceWeek,
  generateWeekPrescription,
  applyProgression,
} from "./programEngine";
import { PERFORMANCE_HISTORY_CAP } from "./programEngine";
import { loadContextFrom } from "./startingLoads";
import { showsRpeByDefault, toExperience } from "./experienceModel";
import { recoveryStateFrom } from "./adjustmentRule";
import { usePerformanceWeeks } from "@/hooks/usePerformance";
import { logger } from "@/lib/logger";
import { estimateLiftBurn } from "@/lib/workoutBurn";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import { carryCompletionsAcrossRegen } from "@/lib/runCompletionCarry";

/** Per-set record from an active WorkoutSession run. */
export interface CompletedSetLog {
  weight: number;
  reps: number;
  completed: boolean;
  /** D2: how the set was performed. Captured in the session UI since the set
   *  tracker shipped, dropped at the write boundary until now. Optional at
   *  this boundary because the projection defaults an absent/unknown value to
   *  "working"; the real writer (`toCompletionSetLogs`) always supplies it. */
  type?: string;
  /** D2: Helms's 6–10 half-point scale, present only when the session
   *  surfaced the control. Interpret via the session-level `rpeProvenance` on
   *  the workout document — a novice's RPE is not the same instrument as an
   *  RPE-familiar advanced lifter's (Helms p73). */
  rpe?: number;
}

/**
 * Session data captured from the live WorkoutSession timer + set tracker.
 * When provided to completeWorkoutDay, the saved workout record reflects
 * actual execution (wall-clock duration, completed-only sets). When
 * absent, the save falls back to planned data with estimateLiftBurn's
 * built-in zero-duration fallback.
 */
export interface CompletedSessionData {
  /** Stable for the lifetime of one in-progress session and its retries.
   *  Drives the deterministic workout id so a retried Finish targets the
   *  SAME `users/{uid}/workouts/programme-<completionId>` doc instead of
   *  appending a second log. Persisted in the draft (useWorkoutDraft). */
  completionId: string;
  /** Stable idempotency key for packet 18's program-command receipt. Carried
   *  from the draft so a retried/replayed completeWorkoutDay dispatch reuses
   *  the same receipt id. Defaults to `completionId` for older drafts. */
  completionCommandId: string;
  durationMinutes: number;
  setLogs: CompletedSetLog[][];
  /** PROGRAM-FLEX-01 / PROGRAM-ADAPT-01: set when the session ran
   *  reduced (a time-budgeted Express Session, or Easier today).
   *  Recorded on the PRIVATE workout doc (backward-compatible optional
   *  field) so history can distinguish a deliberately-reduced session
   *  from an abandoned full one. Deliberately NOT copied into the
   *  activity-feed payload below — the variant (and any recovery
   *  reason behind it) never crosses a social or analytics boundary. */
  sessionVariant?: "express45" | "express30" | "easier_today";
}
import {
  generateRacePlanV2,
  scheduleRecoveryWeekV2,
  clampPlanWeek,
  runTuningFromProfile,
  type RaceTiming,
  type RunTuning,
} from "./runScheduler";
import {
  localWeekKey,
  localDateString,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "./programTypes";
import { projectWorkoutSets } from "./workoutSetRecord";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";
import { isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import { canRescheduleRun, computeRunMove } from "@/lib/runReschedule";
import { toast } from "@/lib/toast";
import { generateInstanceId } from "./programTypes";
import { enqueueCommand, isTransportFailure } from "./commandOutbox";
import { sendProgramCommand } from "./programCommandClient";

const PROGRAM_DOC = "current";

/**
 * PR-0b-ii: assemble a v7 RunPlan record from a V2 race-plan
 * output. Preserves previous-plan continuity for the
 * "Week N of M" display: callers that advance / refresh pass
 * the prior `currentWeek` + `totalWeeks` through `carry` so the
 * stored counters keep their semantic meaning. Initial /
 * full-regenerate paths leave `carry` empty and accept V2's
 * fresh values + currentWeek=0.
 *
 * `compressed` always trusts V2's fresh output — config changes
 * (e.g. race date pushed earlier) can flip an uncompressed plan
 * to compressed and the UI banner needs to reflect that.
 */
function makeRunPlanRecord(
  v2: { totalWeeks: number; compressed: boolean; belowFloor: boolean },
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    eventName?: string;
  },
  carry: { currentWeek?: number; totalWeeks?: number } = {}
): RunPlan {
  return {
    mode: "race_prep",
    raceGoal,
    totalWeeks: carry.totalWeeks ?? v2.totalWeeks,
    currentWeek: carry.currentWeek ?? 0,
    compressed: v2.compressed,
    // Run9 phase-3 (Slice B): surface below-floor so the Realign UI names the
    // finish-safely risk instead of presenting a tight plan as a normal one.
    belowFloor: v2.belowFloor,
  };
}

/**
 * Centralised race-plan regeneration recipe.
 *
 * Eight call sites previously repeated the same sequence — build
 * generator args → call `generateRacePlanV2` → slice `weeks[0]` for
 * runDays → wrap in `makeRunPlanRecord` → optionally re-attach
 * `completedRaces[]`. Drift across sites was the symptom: PR-L L4's
 * shift/compress writers landed without the `currentWeek` carry
 * that `refreshRunSchedule` already used, and without the
 * `completedRaces` re-attach that multi-race plans need.
 *
 * The helper accepts everything explicitly so callers stay in
 * control of which week / schedule / target they feed in (varies
 * per site — load uses today, week-advance uses next-week start,
 * editor-apply uses an overridden schedule).
 */
function regenerateRacePlan({
  raceGoal,
  weekSchedule,
  weeklyRunDays,
  currentDate,
  weekStart,
  tuning,
  carry,
  prior,
}: {
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    eventName?: string;
  };
  weekSchedule: { day: number; type: "lift" | "run" | "both" | "rest" }[];
  weeklyRunDays: number;
  currentDate: string;
  weekStart: string;
  /** Pgm6 knobs — REQUIRED here (unlike the generator's optional
   *  param) so no regen site can silently forget them and regress a
   *  tuned plan back to standard. Derive via
   *  `runTuningFromProfile(profile)`. */
  tuning: RunTuning;
  carry?: {
    currentWeek?: number;
    totalWeeks?: number;
    completedRaces?: string[];
    /** RUN-H1: an active recovery phase + its end date. A regen must NEVER
     *  silently drop recovery (makeRunPlanRecord doesn't emit these fields), so
     *  callers that run while recovery is live pass them through to be
     *  preserved. Recovery EXIT stays a deliberate decision
     *  (resolveRecoveryExit) — callers that intend to exit simply don't pass
     *  them. */
    phase?: "recovery";
    recoveryEndDate?: string;
  };
  /** Run9 phase-3 Slice A — when a regen rewrites the CURRENT week with
   *  existing completions (compress / shift / schedule edit), pass the
   *  pre-regen runDays + manualCompletions so terminal status is re-stamped
   *  and manualCompletions are re-keyed onto the same-date new days. Omitted
   *  on fresh-creation sites (load with no prior runDays) where there is
   *  nothing to carry. */
  prior?: {
    runDays: ScheduledRunDay[];
    manualCompletions?: Record<string, ManualCompletion>;
  };
}): {
  runDays: ScheduledRunDay[];
  runPlan: RunPlan;
  /** Re-keyed map — present only when `prior` was supplied; callers that pass
   *  `prior` must persist this in place of the stale programState map. */
  manualCompletions?: Record<string, ManualCompletion>;
} {
  const v2 = generateRacePlanV2({
    raceGoal,
    weekSchedule,
    weeklyRunDays,
    currentDate,
    weekStart,
    tuning,
  });
  let runDays = v2.weeks[0] ?? [];
  let carriedManualCompletions: Record<string, ManualCompletion> | undefined;
  if (prior) {
    const carried = carryCompletionsAcrossRegen(
      prior.runDays,
      runDays,
      prior.manualCompletions
    );
    runDays = carried.runDays;
    carriedManualCompletions = carried.manualCompletions;
  }
  const runPlan = makeRunPlanRecord(v2, raceGoal, carry);
  if (carry?.completedRaces) {
    runPlan.completedRaces = carry.completedRaces;
  }
  // RUN-H1: preserve an active recovery phase across regen when the caller
  // passes it. makeRunPlanRecord emits a fresh race_prep record with no
  // phase/recoveryEndDate, so without this a regen during recovery (e.g.
  // week auto-rollover, realign) would silently exit recovery.
  if (carry?.phase) runPlan.phase = carry.phase;
  if (carry?.recoveryEndDate) runPlan.recoveryEndDate = carry.recoveryEndDate;
  // Compress / late-mid-week regen can produce a smaller totalWeeks
  // than the carried currentWeek (user on week 5 of 8, plan compresses
  // to 3 → "Week 5 of 3" surfaces in the race-strip and downstream
  // phase math). Clamp here once so every caller is covered.
  // currentWeek is 0-based (fresh plans start at 0; the cockpit renders
  // currentWeek + 1), so the last valid index is totalWeeks - 1.
  if (
    typeof runPlan.currentWeek === "number" &&
    typeof runPlan.totalWeeks === "number"
  ) {
    runPlan.currentWeek = clampPlanWeek(
      runPlan.currentWeek,
      runPlan.totalWeeks
    );
  }
  return { runDays, runPlan, manualCompletions: carriedManualCompletions };
}

interface RefreshRunScheduleOverrides {
  /** Confirmed week schedule from the editor's apply path —
   *  threaded explicitly so a freshly-`updateProfile`'d schedule
   *  doesn't get overwritten by a stale `profile.weekSchedule`
   *  read from useAuth's closure. */
  weekSchedule?: ScheduleDay[];
  /** Confirmed weekly run target from the editor. Same staleness
   *  concern as `weekSchedule`. */
  weeklyRunDaysTarget?: number;
  /** Confirmed Pgm6 tuning knobs from the editor. Same staleness
   *  concern: RunPlanSettings saves runVolume/runDifficulty via
   *  updateProfile immediately before refreshing, and
   *  `runTuningFromProfile(profile)` here would read the closure's
   *  pre-save values. */
  tuning?: RunTuning;
}

export function useProgram() {
  const { user, profile, updateProfile } = useAuth();
  // Backlog #9 (H5): the recovery half of the adjustment rule. A limit-1
  // read — the rule is only consulted on a week advance, so this is the
  // cheapest way to have the answer in hand when that happens. Resolves to
  // "unknown" (⇒ hold) with no doc, a legacy doc, or too little baseline
  // depth for the engine's own deload judgement to mean anything.
  const { currentWeek: perfWeek } = usePerformanceWeeks(1);
  const recovery = recoveryStateFrom(perfWeek?.signals);
  const [programState, setProgramState] = useState<ProgramState | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(
    null
  );

  // Load program from Firestore (with backward-compat normalize)
  useEffect(() => {
    let cancelled = false;
    const loadProgram = async () => {
      if (!user || !profile) {
        setProgramState(null);
        setLoading(false);
        return;
      }

      // PR-0b-i: weekSchedule backfill on read. Self-heals legacy
      // profiles where weekSchedule is absent / wrong-length /
      // duplicated-day / corrupted-type. The patch persists via
      // updateProfile so subsequent reads (and the V2 writer
      // paths below, which read `profile.weekSchedule` directly
      // for run-day generation) see the repaired value.
      // backfillWeekScheduleIfMissing returns null when the
      // schedule is already valid, so this is a no-op on
      // the warm path.
      //
      // throwOnError so we own failure handling — without it, a
      // rules rejection (e.g. a new UserProfile field not yet in
      // allowedUserFields) would fire the generic "Couldn't save
      // your settings" toast on every Programme page load.
      // Migrations should be silent: log + move on, retry next
      // load. The user still gets the page, just with a stale
      // weekSchedule until the rules catch up.
      const profilePatch = backfillWeekScheduleIfMissing(profile);
      if (profilePatch) {
        try {
          await updateProfile(profilePatch, { throwOnError: true });
        } catch (e) {
          logger.warn(
            "[useProgram] weekSchedule backfill failed; continuing with stale shape",
            e
          );
        }
      }

      // Run9 (3a): `structured` run mode is retired. A legacy structured user
      // is migrated to freeform INLINE here — not via a separate effect — so
      // the migration can't race the runDays generation below (the load effect
      // is the one place that generates run days). `effectiveRunMode` makes the
      // rest of this load behave as freeform immediately; the persisted
      // runMode write is fire-and-forget (idempotent: once freeform, the next
      // load skips this). The orphaned structured runDays/runPlan are wiped in
      // the existing-doc branch below.
      const effectiveRunMode =
        profile.runMode === "structured" ? "freeform" : profile.runMode;
      if (profile.runMode === "structured") {
        logger.log("[Run9] migrating legacy structured user → freeform");
        updateProfile({ runMode: "freeform" }).catch((e) =>
          logger.warn("[Run9] structured→freeform migration write failed", e)
        );
      }

      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);

      // Cache-first paint. Firestore persistence is enabled (firebase.ts),
      // but a plain getDoc is server-first when online — it only falls back
      // to IndexedDB when offline. So on every cold open a returning user
      // waits a full network round-trip even though a fresh copy is already
      // cached locally. Read that cached copy first and paint it immediately
      // while the authoritative server read below runs and reconciles.
      //
      // Safe by construction: normalize/migrate are pure (no writes), the
      // whole block is wrapped so a cache miss (first-ever load, eviction,
      // or persistence unavailable) just falls through to the server read
      // exactly as before, and the server path below remains the sole writer
      // and source of truth — it overwrites this paint within the same load.
      // `cancelled` guards against a superseded run (e.g. account switch)
      // flashing stale cached state after the effect re-ran.
      try {
        const cachedSnap = await getDocFromCache(ref);
        if (!cancelled && cachedSnap.exists()) {
          const cachedNorm = normalizeProgramState(
            cachedSnap.data() as ProgramState,
            { primaryGoal: profile.primaryGoal }
          );
          setProgramState(migrateProgramState(cachedNorm, localWeekKey()));
          setLoading(false);
        }
      } catch {
        // Cache miss / persistence unavailable — fall through to the
        // server read. No regression: this is the pre-cache-first path.
      }

      const snap = await getDoc(ref);

      if (snap.exists()) {
        const raw = snap.data() as ProgramState;
        // Pass profile.primaryGoal as the backfill source so pre-W1a
        // programState docs — written before primaryGoal was persisted —
        // still return a normalised state with the user's actual goal,
        // not an empty field. Onboarding already stores primaryGoal on
        // the profile, so the backfill is always available at read time.
        const normalized = normalizeProgramState(raw, {
          primaryGoal: profile.primaryGoal,
        });

        // PR-0b-i: shape-aware migration on read. Repairs V1-shaped
        // runDays (missing id / date / weekKey / status) and aligns
        // inconsistent completed↔status pairs. Idempotent — healthy
        // V2 docs return the input reference, and the
        // JSON.stringify guard below avoids writes when nothing
        // changed. Migration NEVER regenerates workouts; any
        // customizations the user made survive untouched.
        const migrated = migrateProgramState(normalized, localWeekKey());

        // Persist-if-changed guard. Avoids a Firestore write on every
        // cold app open for users whose docs are already clean. The
        // stringify comparison is safe here because the doc is plain
        // JSON (no undefineds, functions, Symbols, or Dates that
        // wouldn't survive serialisation). It's a write optimisation
        // — the React state below uses `migrated` directly, so
        // correctness doesn't depend on this guard firing.
        if (JSON.stringify(migrated) !== JSON.stringify(raw)) {
          // Defence-in-depth (issue #845): strip undefined fields
          // before the write. normalizeProgramState was already
          // fixed at the source, but any future field that lands
          // in `migrated` as `undefined` would silently re-introduce
          // the "Failed to load programme" loop. setDocGuarded strips
          // undefined recursively (a no-op for already-clean docs).
          await setDocGuarded(ref, migrated, { merge: true });
        }

        if (
          profile.runMode === "structured" &&
          ((migrated.runDays && migrated.runDays.length > 0) ||
            migrated.runPlan)
        ) {
          // Run9 (3a): retire `structured`. Wipe the orphaned auto-assigned
          // runDays + runPlan (the user is now freeform; runMode is being
          // migrated above). deleteField removes the stale runPlan under a
          // merge write; runDays:[] overwrites the structured days.
          const localCleared = { ...migrated, runDays: [] } as ProgramState;
          delete (localCleared as { runPlan?: unknown }).runPlan;
          await setDocGuarded(
            ref,
            { runDays: [], runPlan: deleteField(), updatedAt: Date.now() },
            { merge: true }
          );
          setProgramState(localCleared);
        } else if (
          // Hydrate run days only for an active race plan with no days yet.
          // (Run9: `structured` no longer generates a week — only race_prep.)
          !migrated.runDays &&
          effectiveRunMode === "race_prep" &&
          profile.raceGoal
        ) {
          // PR-0b-ii: V2 writers. Reads weekSchedule directly so
          // hybrid Both-day slots get a scheduled run (V1 lost them
          // because it derived run-eligible days from liftIndices).
          // PR-0b-i's backfill above guarantees a valid 7-entry
          // weekSchedule is present on profile by this point.
          const weekSchedule = profile.weekSchedule ?? [];
          const runTarget = getWeeklyRunTarget(profile) || 3;
          const weekStart = localWeekKey();
          const { runDays, runPlan } = regenerateRacePlan({
            tuning: runTuningFromProfile(profile),
            raceGoal: profile.raceGoal,
            weekSchedule,
            weeklyRunDays: runTarget,
            currentDate: localDateString(),
            weekStart,
          });

          const withRuns = { ...migrated, runDays, runPlan };
          // Issue #845 defence-in-depth — same reason as the
          // persist-if-changed branch above. `withRuns` inherits any
          // undefined field that survived `migrated`; setDocGuarded
          // strips them before the write.
          await setDocGuarded(
            ref,
            { ...withRuns, updatedAt: Date.now() },
            { merge: true }
          );
          setProgramState(withRuns);
        } else {
          // PR-0b-i: drive React state from the migrated value so
          // the UI sees v2-shaped runDays + corrected status/
          // completed pairs. Pre-PR-0b-i this set `normalized`,
          // which would leave consumers reading legacy fields.
          setProgramState(migrated);
        }
      } else {
        const goal = profile.program?.goal ?? "recomp";
        const weeklyTarget = profile.weeklyWorkoutsTarget ?? 4;
        // Thread primaryGoal through so the procedural engine reps track
        // what the user asked for. Pre-W1a this call dropped primaryGoal
        // entirely and hypertrophy-rep defaults leaked into every goal.
        const { splitType, workouts } = generateProgram(
          goal,
          weeklyTarget,
          undefined,
          profile.primaryGoal,
          loadContextFrom(profile),
          // Backlog #10 (M6): the week's SHAPE, so back-to-back days aren't
          // the two that load the same lower back. Read-only — this does not
          // date-pin lifts (ADR-0002).
          profile.weekSchedule,
          toExperience(profile.experience)
        );

        // Generate run schedule only for an active race plan. PR-0b-ii: V2
        // writers. Run9 (3a): `structured` is retired — freeform (incl. a
        // migrated structured user) gets no auto-assigned runDays.
        let runDays: ScheduledRunDay[] | undefined;
        let runPlan: ProgramState["runPlan"];
        if (effectiveRunMode === "race_prep" && profile.raceGoal) {
          const weekSchedule = profile.weekSchedule ?? [];
          const runTarget = getWeeklyRunTarget(profile) || 3;
          const weekStart = localWeekKey();
          ({ runDays, runPlan } = regenerateRacePlan({
            tuning: runTuningFromProfile(profile),
            raceGoal: profile.raceGoal,
            weekSchedule,
            weeklyRunDays: runTarget,
            currentDate: localDateString(),
            weekStart,
          }));
        }

        const initial: ProgramState = {
          goal,
          // Persist primaryGoal alongside the engine-derived workouts.
          // Loading already backfills via normalizeProgramState (see
          // line ~80) but the initial doc should write the field
          // explicitly so the persisted shape matches reads.
          ...(profile.primaryGoal !== undefined && {
            primaryGoal: profile.primaryGoal,
          }),
          currentPhase: "base",
          weekNumber: 1,
          splitType,
          workouts,
          fatigueScore: 0,
          updatedAt: Date.now(),
          settings: { autoProgression: true, microloading: true },
          weekHistory: [],
          // PR-0b-ii: explicit schema version on initial creation so
          // PR-0b-i's shape-aware migration sees a current doc on
          // next read. Without this, the doc would migrate (no-op)
          // on every cold open until the next saveProgram.
          programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
          ...(runDays !== undefined && { runDays }),
          ...(runPlan !== undefined && { runPlan }),
        };

        await setDocGuarded(ref, initial);
        setProgramState(initial);
      }

      setLoading(false);
    };

    loadProgram().catch((err) => {
      logger.error("Failed to load program:", err);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // updateProfile is intentionally omitted: it's a stable
    // function reference from useAuth's context and including it
    // would force a re-run on every render that recreates it.
    // The PR-0b-i profilePatch call uses updateProfile inside the
    // effect body — same call style as elsewhere in the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  // Save program to Firestore
  const saveProgram = useCallback(
    async (state: ProgramState) => {
      if (!user) return;
      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
      // Strip undefined values — Firestore rejects them
      const clean = Object.fromEntries(
        Object.entries({ ...state, updatedAt: Date.now() }).filter(
          ([, v]) => v !== undefined
        )
      );
      try {
        await setDocGuarded(ref, clean);
        setProgramState(state);
      } catch (error) {
        logger.error("[Program] Save failed:", error);
        toast.error("Couldn't save your changes. Try again.");
        throw error;
      }
    },
    [user]
  );

  // PR-L L5 — the race-no-show transition (PR-D) and recovery-phase
  // exit (PR-E) effects used to live here as `useEffect`s that wrote
  // to programState. They moved to server-side Cloud Functions per
  // the PR-L plan so non-React clients (Apple Watch, future native)
  // reach the same state without per-client logic.
  //
  // The replacements are:
  //   - Race-no-show: `dailyRaceReconciliationSweep` (Pub/Sub, 04:00
  //     UTC daily). Reads programState + the race-date saved-runs
  //     bucket; writes `runDay.status: race_no_show` when the 3-day
  //     grace has passed and no real race-templated saved-run matched.
  //   - Recovery-exit: same scheduled function. Clears
  //     `runPlan.phase` + `recoveryEndDate` when today is past
  //     `recoveryEndDate + 7d`.
  //   - Recovery-entry: `onRunCreated` extension (`_maybeWriteRecoveryEntry
  //     ForRun`). Writes recovery state when a saved run is a strict
  //     race-day match.
  //
  // No client write path remains for these transitions. The hook is
  // now a pure Firestore reader + UI dispatcher for race-day state.
  // Latency trade-off: recovery hero pops in 3-10s vs <1s pre-L5
  // (next Cloud Function invocation); acceptable per the PR-L scope.

  // PR-G: auto week-rollover effect. When the user opens the app
  // and the calendar week has advanced past the week their
  // runDays were generated for, automatically rotate forward to
  // catch up. Mirrors what the user-tapped "Advance to Next Week"
  // button does on the Lift tab, but driven by calendar instead
  // of lift completion.
  //
  // Ordering: this effect is declared AFTER PR-D's auto-transition
  // and PR-E's recovery-exit so they run first. Without that
  // ordering, the rollover would archive a planned race-day
  // runDay into weekHistory BEFORE the auto-transition writes
  // `race_no_show` to it, losing the inferred state.
  //
  // Detection: `programState.runDays[0]?.weekKey` is the Sunday of
  // the week the runDays were last generated for. If that's
  // before `localWeekKey()`, the user is ≥1 week stale.
  //
  // Loop: while stale, run `advanceWeek` and regenerate runDays
  // for the new week. Cap at 12 iterations to prevent runaway
  // in pathological cases (user gone for months). Each iteration
  // archives the previous week into `weekHistory` and increments
  // `weekNumber`.
  //
  // Trade-off (per the design grill): a planned-but-never-done
  // Saturday run gets archived as `status: "planned"` in
  // weekHistory on the Monday rollover. That's intentional —
  // honest record of "we didn't do this." Better than zombie
  // planned entries lingering in the current week.
  //
  // Skips: freeform users (no runDays to rotate); users whose
  // runDays is empty (no signal to compare).
  useEffect(() => {
    if (!programState || !profile) return;
    if (!profile.runMode || profile.runMode === "freeform") return;

    const runDayWeekKey = programState.runDays?.[0]?.weekKey;
    if (!runDayWeekKey) return;

    const todayKeyG = localWeekKey();
    if (runDayWeekKey >= todayKeyG) return;

    // Loop up to 12 iterations. Each iteration advances the
    // local `rolling` state but doesn't write to Firestore — we
    // batch all writes into a single saveProgram at the end.
    let rolling = programState;
    let iterations = 0;
    while (iterations < 12) {
      const currentRunWeekKey = rolling.runDays?.[0]?.weekKey;
      if (!currentRunWeekKey || currentRunWeekKey >= todayKeyG) break;

      // Advance lift side (workouts, weekNumber, weekHistory).
      // Backlog #8: the deload recipe follows training age (Helms H4).
      // Backlog #9: plus the joint plateau x recovery adjustment rule.
      // 4th arg (D1): keep the lift anchor moving in lockstep on this path
      // too, so a user who later switches to freeform doesn't inherit a stale
      // `liftWeekKey` and trigger a spurious catch-up.
      const nextLiftWeekKey = localWeekKey(
        addLocalDays(parseLocalDate(currentRunWeekKey), 7)
      );
      const advanced = advanceWeek(
        rolling,
        profile.experience,
        recovery,
        nextLiftWeekKey
      );

      // Advance run side. Compute the next week's start key. Take
      // one week step from the current runDay week key.
      const nextWeekStart = localWeekKey(
        addLocalDays(parseLocalDate(currentRunWeekKey), 7)
      );
      const nextWeekCurrentDate = localDateString(
        addLocalDays(parseLocalDate(currentRunWeekKey), 7)
      );
      const weekSchedule = profile.weekSchedule ?? [];
      const runTarget = getWeeklyRunTarget(profile) || 3;

      const advRunPlan = advanced.runPlan;
      // Asked about NEXT week's date, not today: the question is whether the
      // week being rolled into is still inside the recovery window. The
      // explicit `!!advRunPlan` is what carries the non-null guarantee into
      // the block below, which spreads it — `isInRecoveryOn` deliberately
      // does not narrow (see its doc).
      const inRecovery =
        !!advRunPlan && isInRecoveryOn(advRunPlan, nextWeekCurrentDate);

      if (inRecovery) {
        // RUN-H1: a week rolling over mid-recovery must STAY a recovery week
        // and keep phase/recoveryEndDate — never regenerate a race plan (which
        // emits race-training runDays AND drops the recovery flags via
        // makeRunPlanRecord). Mirrors refreshRunSchedule's recovery branch;
        // recovery exit is a deliberate decision (resolveRecoveryExit), not a
        // rollover side effect.
        advanced.runDays = scheduleRecoveryWeekV2({
          weekSchedule,
          weekStart: nextWeekStart,
        });
        advanced.runPlan = { ...advRunPlan };
      } else if (
        profile.runMode === "race_prep" &&
        profile.raceGoal &&
        // R3: same elapsed guard as refreshRunSchedule — a week rolling over
        // after an elapsed race (recovery ended, raceGoal not yet server-
        // cleared) must go freeform, not regenerate a plan dated in the past.
        nextWeekCurrentDate <= profile.raceGoal.targetDate
      ) {
        const r = regenerateRacePlan({
          tuning: runTuningFromProfile(profile),
          raceGoal: profile.raceGoal,
          weekSchedule,
          weeklyRunDays: runTarget,
          currentDate: nextWeekCurrentDate,
          weekStart: nextWeekStart,
          carry: {
            currentWeek: (advanced.runPlan?.currentWeek ?? 0) + 1,
            totalWeeks: advanced.runPlan?.totalWeeks,
            completedRaces: advanced.runPlan?.completedRaces,
          },
        });
        advanced.runDays = r.runDays;
        advanced.runPlan = r.runPlan;
      } else {
        // RUN-M: structured mode is retired (Run9a — the Run surface is two
        // states, freeform + race_prep). This else is unreachable today (the
        // effect early-returns on freeform), so a non-race state IS freeform:
        // no auto-assigned runDays, no runPlan. Never resurrect a structured
        // week here.
        advanced.runDays = [];
        advanced.runPlan = undefined;
      }

      rolling = advanced;
      iterations++;
    }

    if (iterations === 0) return;

    logger.log(
      `[auto-rollover] advanced ${iterations} week${iterations > 1 ? "s" : ""} (from ${runDayWeekKey} to ${rolling.runDays?.[0]?.weekKey ?? "?"})`
    );

    saveProgram(rolling)
      .then(() => {
        toast.success(
          `Week advanced — ${iterations} week${iterations > 1 ? "s" : ""}`
        );
      })
      .catch((err) => {
        logger.warn("[auto-rollover] save failed", err);
      });
  }, [programState, profile, saveProgram, recovery]);

  /**
   * D1 — calendar week rollover for the LIFT side.
   *
   * The effect above only ever ran for users with a run plan: it returns early
   * on freeform and needs `runDays[0].weekKey` as its anchor. A pure lifter has
   * neither, so their only path to a new week was the manual button, which is
   * gated on EVERY day being completed-or-skipped. Miss one Friday, never tap
   * "skip", and the whole weekly tier stopped forever — no deload, no
   * adjustment rule, no mesocycle rotation. Per CLAUDE.md's
   * design-for-the-user-base rule that is the modal lifter, not an edge case,
   * and it made every acceptance criterion in the v8 lifting arc unmeasurable
   * in production.
   *
   * Deliberately a SEPARATE effect rather than a generalisation of the one
   * above. That one carries ordering constraints against PR-D's
   * auto-transition and PR-E's recovery exit, plus three race-plan branches;
   * folding a second anchor into it risks all of that to save a few lines. The
   * two are mutually exclusive by construction — this runs exactly when that
   * one bails — so they can never both write.
   *
   * Unattended days roll over as they stand and are archived into
   * `weekHistory` by `advanceWeek`. That is the same honest-record trade-off
   * the run side already made ("better than zombie planned entries lingering
   * in the current week"): the archive says what actually happened, so the
   * adherence-sensitive readers downstream are not fed a lie.
   */
  useEffect(() => {
    if (!programState || !profile) return;

    // Precisely the complement of the run-side effect's guards, so exactly one
    // of the two can act on any given state.
    const runSideOwnsRollover =
      !!profile.runMode &&
      profile.runMode !== "freeform" &&
      !!programState.runDays?.[0]?.weekKey;
    if (runSideOwnsRollover) return;

    const anchor = programState.liftWeekKey;
    // Absent means a pre-D1 document that `migrateProgramState` has not
    // repaired yet. Do nothing — seeding here would race the migration, and
    // treating absent as stale would roll a returning user forward by the
    // whole iteration cap on first open.
    if (!anchor) return;

    const todayKey = localWeekKey();
    if (anchor >= todayKey) return;

    let rolling = programState;
    let iterations = 0;
    // Same cap as the run side: a user gone for months catches up twelve weeks
    // and then stops, rather than spinning through a year of deloads.
    while (iterations < 12) {
      const current = rolling.liftWeekKey;
      if (!current || current >= todayKey) break;
      const nextKey = localWeekKey(addLocalDays(parseLocalDate(current), 7));
      rolling = advanceWeek(rolling, profile.experience, recovery, nextKey);
      iterations++;
    }

    if (iterations === 0) return;

    logger.log(
      `[auto-rollover:lift] advanced ${iterations} week${iterations > 1 ? "s" : ""} (from ${anchor} to ${rolling.liftWeekKey ?? "?"})`
    );

    saveProgram(rolling)
      .then(() => {
        toast.success(
          `Week advanced — ${iterations} week${iterations > 1 ? "s" : ""}`
        );
      })
      .catch((err) => {
        logger.warn("[auto-rollover:lift] save failed", err);
      });
  }, [programState, profile, saveProgram, recovery]);

  // Mark a workout day as completed (does NOT auto-advance week)
  // Also writes to workouts collection so Home stats can see it.
  //
  // `sessionData` (optional) carries the wall-clock duration and per-set
  // completion state from an active WorkoutSession. When supplied, the saved
  // record reflects actual execution; otherwise we fall back to planned data
  // (every set assumed completed at `ex.lastAttemptedWeight || ex.weight`).
  const completeWorkoutDay = useCallback(
    async (dayIndex: number, sessionData: CompletedSessionData) => {
      // Fail CLOSED — returning silently here would let the session UI clear
      // its draft as if the workout persisted. The caller surfaces the throw.
      if (!programState || !user) {
        throw new Error(
          "Cannot complete a workout without an active programme and user."
        );
      }
      const day = programState.workouts[dayIndex];
      if (!day) {
        throw new Error("Cannot complete a programme day that does not exist.");
      }
      if (!sessionData?.completionId) {
        throw new Error("Workout completion is missing its idempotency key.");
      }

      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, completed: true, skipped: false } : d
        ),
        // Clear next-workout override if completing the overridden day
        ...(programState.nextWorkoutOverride === dayIndex && {
          nextWorkoutOverride: undefined,
        }),
      };

      // Local date key so the written workout is picked up by the
      // useEffectiveTargets / useHomeData filters, which both format in
      // the viewer's local timezone via isWorkoutOnDate.
      const today = localDateString();

      // Build exercises array — from actual setLogs when available,
      // otherwise from planned data (every set assumed completed).
      const exercises = day.exercises.map((ex, exIndex) => {
        const logs = sessionData.setLogs?.[exIndex];
        // D2: the no-logs fallback keeps its historical shape — the last
        // ATTEMPTED load and the last actual reps, which is the best guess
        // available when a day is marked done without a live session.
        const plannedWeight = ex.lastAttemptedWeight || ex.weight;
        const plannedReps = ex.lastPerformance?.reps ?? ex.reps;

        // D2: one shared projection across all three call sites (here,
        // Routine, and the server command reducer). The planned pair recorded
        // on each set is the PRESCRIPTION — `ex.reps` / `ex.weight` — because
        // that is what `applyProgression` scores the actual against, and what
        // it overwrites a moment later. The fallback branch below has no
        // prescription to preserve, so it reuses its own planned values.
        const sets = logs
          ? projectWorkoutSets(logs, {
              sets: ex.sets,
              reps: ex.reps,
              weightKg: ex.weight,
            })
          : projectWorkoutSets(undefined, {
              sets: ex.sets,
              reps: plannedReps,
              weightKg: plannedWeight,
            });

        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          category: ex.movementCategory,
          ...(ex.repUnit !== undefined ? { repUnit: ex.repUnit } : {}),
          sets,
          // D2: how many sets were PRESCRIBED, against `sets.length` which is
          // how many were completed. The array stays completed-only — every
          // downstream reader (workoutBurn's completedSetCount, the volume
          // tallies, the PR scan) assumes that, and emitting incomplete rows
          // would silently move calories, tonnage and PRs for every user. This
          // recovers "planned 4, did 3" additively, with no reader moved.
          plannedSetCount: ex.sets,
          caloriesBurned: 0,
        };
      });

      const tonnage = exercises.reduce(
        (t, ex) =>
          t +
          (ex.repUnit === "seconds"
            ? 0
            : ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0)),
        0
      );
      const completedSetCount = exercises.reduce(
        (c, ex) => c + ex.sets.length,
        0
      );

      // Require bodyweight to compute a sensible burn. If it's missing we
      // save the workout anyway — the helper returns 0 — but log so the
      // operator can notice.
      const bodyweightKg = profile?.weightKg ?? 0;
      if (bodyweightKg <= 0) {
        logger.warn(
          "completeWorkoutDay: profile.weightKg missing — workout will save with totalCalories=0"
        );
      }

      const durationMinutes =
        sessionData.durationMinutes && sessionData.durationMinutes > 0
          ? sessionData.durationMinutes
          : 0;
      const effectiveDurationMin =
        durationMinutes > 0 ? durationMinutes : completedSetCount * 3;

      const totalCalories = estimateLiftBurn({
        durationMinutes,
        tonnageKg: tonnage,
        bodyweightKg,
        completedSetCount,
      });

      // ── CORE persistence boundary — atomic programme + workout write.
      // Pre-packet-15 this was saveProgram(updated) FOLLOWED BY a separate
      // workout write inside a log-only catch: a workout-write failure left
      // the day permanently completed with no matching workout record (a
      // split state that broke History / calorie totals / performance). One
      // writeBatch commits both or neither. The id is deterministic
      // (programme-<completionId>) so a retried Finish overwrites the same
      // doc rather than appending a second log.
      const programRef = doc(
        db,
        "users",
        user.uid,
        "programState",
        PROGRAM_DOC
      );
      const workoutId = `programme-${sessionData.completionId}`;
      const workoutRef = doc(db, "users", user.uid, "workouts", workoutId);

      try {
        const batch = writeBatch(db);
        batch.set(
          programRef,
          stripUndefined({ ...updated, updatedAt: Date.now() })
        );
        batch.set(
          workoutRef,
          stripUndefined({
            date: today,
            exercises,
            totalCalories,
            durationMinutes: effectiveDurationMin,
            notes: `${day.dayName} — Programme Week ${programState.weekNumber}`,
            createdAt: Timestamp.now(),
            source: "programme",
            completionId: sessionData.completionId,
            sessionVariant: sessionData.sessionVariant,
            // D2: session-level provenance for any per-set RPE above. Helms
            // p139 keeps novices on %1RM rather than RPE for their first
            // month, and p73 claims accuracy only for lifters who are
            // advanced AND RPE-familiar AND near failure — so a future
            // consumer must be able to tell whose number it is holding rather
            // than calibrating on an uncalibrated beginner's guess. Recorded
            // once per session because it cannot vary within one.
            rpeProvenance: {
              experience: profile?.experience,
              shownByDefault: showsRpeByDefault(
                toExperience(profile?.experience)
              ),
            },
          })
        );
        await batch.commit();
        // Local programme state changes only after BOTH docs commit.
        setProgramState(updated);
      } catch (error) {
        logger.error("[Program] completion batch failed:", error);
        toast.error(
          "Couldn't save your workout. Your session is still ready to retry."
        );
        throw error;
      }

      // ── POST-SAVE best-effort: sharing must NOT invalidate a saved workout.
      try {
        // Share composer: prompt the user (or replay their saved
        // default) for visibility + caption. Returns null if they
        // declined to share. Replaces the old autoPostWorkouts flag —
        // see src/lib/shareComposer.ts for the preference store.
        const decision = await compose(user.uid, {
          type: "workout",
          title: day.dayName,
          meta: [
            `${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}`,
            tonnage > 0
              ? `${Math.round(tonnage).toLocaleString()}kg volume`
              : "",
            effectiveDurationMin > 0 ? `${effectiveDurationMin} min` : "",
          ].filter(Boolean),
        });
        if (decision) {
          const uniqueCategories = [
            ...new Set(
              day.exercises.map((ex) => ex.movementCategory).filter(Boolean)
            ),
          ];
          const payload = {
            authorId: user.uid,
            authorName: profile?.displayName || "Athlete",
            ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
            type: "workout" as const,
            visibility: decision.visibility,
            ...(decision.caption ? { caption: decision.caption } : {}),
            workoutName: day.dayName,
            activityTitle: day.dayName,
            exerciseCount: day.exercises.length,
            totalVolume: tonnage,
            duration: effectiveDurationMin * 60,
            muscleGroups: uniqueCategories,
            // Exercises — full list (was previously sliced to 3) with
            // structured fields per exercise so feed viewers can
            // "Save as routine" (PR 4) without parsing the summary
            // string. ActivityCard renders only the top 3 visually
            // for compactness; the rest sit on the doc for the routine
            // copy flow.
            exercises: exercises.map((ex) => {
              const setCount = ex.sets.length;
              const targetReps = ex.sets[0]?.reps ?? 0;
              const targetWeightKg = ex.sets[0]?.weightKg ?? 0;
              return {
                name: ex.exerciseName,
                exerciseId: ex.exerciseId,
                summary: `${setCount}×${targetReps}×${targetWeightKg}kg`,
                setCount,
                targetReps,
                targetWeightKg,
              };
            }),
          };
          try {
            await postActivity(payload);
          } catch (socialErr) {
            // Network failures (offline, transient) — queue and let
            // ShareComposerSheet's drain effect retry on reconnect.
            // Auth/identity errors still surface as a warning since
            // those won't recover by retrying.
            const isNetwork =
              typeof navigator !== "undefined" && navigator.onLine === false;
            if (isNetwork) {
              enqueueShare(user.uid, payload);
              showQueuedToast();
            } else {
              logger.warn("Failed to post workout to feed:", socialErr);
            }
          }
        }
      } catch (err) {
        // Post-save sharing/social failure — the workout already committed.
        logger.warn("[Program] post-save workout sharing failed:", err);
      }

      const allDone = updated.workouts.every((d) => d.completed || d.skipped);
      if (allDone) {
        toast.success(
          "All workouts complete! Advance to next week when ready."
        );
      }
      return { workoutId };
    },
    [programState, user, profile]
  );

  // Skip a workout day (no stats, no social post)
  const skipWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;
      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, skipped: true } : d
        ),
      };
      await saveProgram(updated);
    },
    [programState, user, saveProgram]
  );

  // Set a specific day as the next workout (override default progression),
  // or null to follow programme order again. PROGRAM-SESSION-ORDER-01: a
  // cursor change only — layout, loads, history and fatigue are untouched.
  // The writer accepts only an in-range, unfinished day; terminal or
  // malformed selections are ignored (the derive-time guard in Program.tsx
  // already falls back, but a bad override must not persist either).
  // `undefined` is stripped by the guarded write path, so a reset removes
  // the field rather than storing a stale value.
  const setNextWorkout = useCallback(
    async (dayIndex: number | null) => {
      if (!programState) return;
      if (dayIndex === null) {
        if (programState.nextWorkoutOverride == null) return;
        await saveProgram({ ...programState, nextWorkoutOverride: undefined });
        return;
      }
      const day = programState.workouts[dayIndex];
      if (!Number.isInteger(dayIndex) || !day || day.completed || day.skipped) {
        return;
      }
      await saveProgram({ ...programState, nextWorkoutOverride: dayIndex });
    },
    [programState, saveProgram]
  );

  // Manually advance to next week (called from UI)
  const advanceToNextWeek = useCallback(async () => {
    if (!programState) return;
    if (!shouldAdvanceWeek(programState.workouts)) return;

    // Backlog #8: the deload recipe follows training age (Helms H4).
    // Backlog #9: plus the joint plateau x recovery adjustment rule.
    // D1: stamp the CURRENT calendar week, not the next one. The anchor means
    // "which calendar week these workouts belong to", and a user finishing
    // early is still inside this one — so the automatic rollover stays quiet
    // until the calendar genuinely moves on, instead of firing again days
    // later on top of the advance the user just asked for.
    const advanced = advanceWeek(
      programState,
      profile?.experience,
      recovery,
      localWeekKey()
    );

    // Refresh run days for new week. PR-0b-ii: V2 writers + next-
    // week date vantage so the saved runDays carry next-week
    // dates / weekKey. `currentWeek` increments to track week-
    // since-plan-start; `totalWeeks` preserved from prev so the
    // race-strip "Week N of M" display stays consistent.
    if (profile?.runMode && profile.runMode !== "freeform") {
      const weekSchedule = profile.weekSchedule ?? [];
      const runTarget = getWeeklyRunTarget(profile) || 3;
      const nextWeekStart = localWeekKey(addLocalDays(new Date(), 7));
      const nextWeekCurrentDate = localDateString(addLocalDays(new Date(), 7));

      const advRunPlan = advanced.runPlan;
      // Asked about NEXT week's date, not today: the question is whether the
      // week being rolled into is still inside the recovery window. The
      // explicit `!!advRunPlan` is what carries the non-null guarantee into
      // the block below, which spreads it — `isInRecoveryOn` deliberately
      // does not narrow (see its doc).
      const inRecovery =
        !!advRunPlan && isInRecoveryOn(advRunPlan, nextWeekCurrentDate);

      if (inRecovery) {
        // RUN-H1: a week rolling over mid-recovery must STAY a recovery week
        // and keep phase/recoveryEndDate — never regenerate a race plan (which
        // emits race-training runDays AND drops the recovery flags via
        // makeRunPlanRecord). Mirrors refreshRunSchedule's recovery branch;
        // recovery exit is a deliberate decision (resolveRecoveryExit), not a
        // rollover side effect.
        advanced.runDays = scheduleRecoveryWeekV2({
          weekSchedule,
          weekStart: nextWeekStart,
        });
        advanced.runPlan = { ...advRunPlan };
      } else if (
        profile.runMode === "race_prep" &&
        profile.raceGoal &&
        // R3: same elapsed guard as refreshRunSchedule — a week rolling over
        // after an elapsed race (recovery ended, raceGoal not yet server-
        // cleared) must go freeform, not regenerate a plan dated in the past.
        nextWeekCurrentDate <= profile.raceGoal.targetDate
      ) {
        const r = regenerateRacePlan({
          tuning: runTuningFromProfile(profile),
          raceGoal: profile.raceGoal,
          weekSchedule,
          weeklyRunDays: runTarget,
          currentDate: nextWeekCurrentDate,
          weekStart: nextWeekStart,
          carry: {
            currentWeek: (advanced.runPlan?.currentWeek ?? 0) + 1,
            totalWeeks: advanced.runPlan?.totalWeeks,
            completedRaces: advanced.runPlan?.completedRaces,
          },
        });
        advanced.runDays = r.runDays;
        advanced.runPlan = r.runPlan;
      } else {
        // RUN-M: structured retired — a non-race state is freeform (no runDays).
        advanced.runDays = [];
        advanced.runPlan = undefined;
      }
    }

    await saveProgram(advanced);

    const rx = generateWeekPrescription(advanced.weekNumber);
    if (rx.deload) {
      toast.info("Deload week — reduce intensity and recover");
    } else {
      toast.success(`Week ${advanced.weekNumber} started`);
    }
  }, [programState, profile, saveProgram, recovery]);

  // P0-6: Mark a run day as completed.
  //
  // Accepts either a v2 ScheduledRunDay.id (string) for precise
  // by-id completion, or a legacy dayIndex (number) for the
  // pre-v2 path that's still wired elsewhere in the UI. When the
  // id path resolves, status transitions via `transitionStatus`
  // (planned → completed_exact). The runtime `completed: true`
  // flag is set on both paths for back-compat — the in-app
  // `runDays.find(d => !d.completed)` lookups still work.
  //
  // The transition validation is a soft guard: a no-op (status
  // already terminal) logs a warning and falls through without
  // writing — completing the same scheduled run twice shouldn't
  // double-fire the "ready for next week" toast.
  /**
   * PR-J Q2 (a'''') — Manual mark-complete writer.
   *
   * Records explicit user intent to mark a runDay slot complete
   * via `programState.manualCompletions[runDayId]`. The derivation
   * (Q2 P27) reads the map alongside saved-run claims + legacy
   * status to surface the ✅ in UI. NO synthetic saved-run write —
   * gamification (streaks, PI, badges, challenges) only consumes
   * real activity per Q2 P25.
   *
   * Behavior pins inherited from the lock:
   * - P20 (skipped → planned → map): when target is `skipped`,
   *   first transitions back to `planned` then writes the map key.
   * - P21 (race-day UI suppression): caller responsibility — this
   *   writer doesn't enforce it because the writer is the lower
   *   layer. DayActionSheet hides the button on race-day slots.
   *
   * Q1 P9 + linkedRunId: not written (the field is dropped from
   * the type by this PR).
   */
  const markManualComplete = useCallback(
    async (runDayId: string) => {
      if (!programState?.runDays || !user) return;
      const targetIndex = programState.runDays.findIndex(
        (rd) => rd.id === runDayId
      );
      if (targetIndex === -1) {
        logger.warn(
          `[markManualComplete] no runDay matched id=${runDayId}; skipping`
        );
        return;
      }
      const targetDay = programState.runDays[targetIndex];

      // RUN-RACE-GUARD-01: a race completes only via a logged run
      // (RunSummary reconciliation), never a manual mark — otherwise a
      // race overridden to easy + manual-completed silently erases the
      // race. Gate on the immutable race identity.
      if (isScheduledRaceRunDay(targetDay)) {
        logger.warn(
          `[markManualComplete] refusing to manually complete a scheduled race (id=${targetDay.id}); a race completes via a logged run`
        );
        return;
      }

      // P20: skipped → planned two-step. The transition gate uses
      // the updated LEGAL_TRANSITIONS table that now permits
      // skipped → planned (Q1 P7).
      let updatedDays = programState.runDays;
      const fromStatus = getScheduledRunStatus(targetDay);
      if (fromStatus === "skipped") {
        if (!transitionStatus(fromStatus, "planned")) {
          logger.warn(
            `[markManualComplete] invalid transition ${fromStatus} → planned for runDay ${targetDay.id}; skipping`
          );
          return;
        }
        updatedDays = programState.runDays.slice();
        updatedDays[targetIndex] = {
          ...targetDay,
          status: "planned" as ScheduledRunStatus,
          completed: false,
        };
      }

      const updatedMap: Record<string, ManualCompletion> = {
        ...(programState.manualCompletions ?? {}),
        [runDayId]: { completedAt: new Date() },
      };

      const updated: ProgramState = {
        ...programState,
        runDays: updatedDays,
        manualCompletions: updatedMap,
      };
      await saveProgram(updated);
    },
    [programState, user, saveProgram]
  );

  /**
   * PR-J Q2 P11 — Undo a manual mark-complete.
   *
   * Drops the map key. Per Q7 P96 the UI surfaces a separate toast
   * ("Marked as planned again") from the saved-run-deletion toast
   * — DayActionSheet wires the copy.
   */
  const unmarkManualComplete = useCallback(
    async (runDayId: string) => {
      if (!programState?.manualCompletions || !user) return;
      if (!(runDayId in programState.manualCompletions)) return;
      const next = { ...programState.manualCompletions };
      delete next[runDayId];
      const updated: ProgramState = {
        ...programState,
        manualCompletions: next,
      };
      await saveProgram(updated);
    },
    [programState, user, saveProgram]
  );

  // P1-3: Skip a run day (planned → skipped). Same id-or-index
  // overload as completeRunDay so the Week tab's overflow menu can
  // dispatch either way. Transition is gated by transitionStatus,
  // so a no-op call against a terminal-state runDay logs and exits
  // without writing.
  const skipRunDay = useCallback(
    async (idOrDayIndex: string | number) => {
      if (!programState?.runDays || !user) return;

      const targetIndex =
        typeof idOrDayIndex === "string"
          ? programState.runDays.findIndex((rd) => rd.id === idOrDayIndex)
          : programState.runDays.findIndex(
              (rd) => rd.dayIndex === idOrDayIndex
            );
      if (targetIndex === -1) {
        logger.warn(
          `[skipRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return;
      }
      const targetDay = programState.runDays[targetIndex];
      // PR-0b-iii: legacy-completed-aware status read via the
      // central helper. A pre-status doc with completed: true +
      // status: undefined resolves to "completed_exact" (not
      // "planned"), so transitionStatus refuses the
      // completed_exact → completed_exact illegal transition and
      // we skip + log instead of double-completing.
      const fromStatus = getScheduledRunStatus(targetDay);
      const toStatus: ScheduledRunStatus = "skipped";
      if (!transitionStatus(fromStatus, toStatus)) {
        logger.warn(
          `[skipRunDay] invalid transition ${fromStatus} → ${toStatus} for runDay ${targetDay.id ?? targetDay.dayIndex}; skipping`
        );
        return;
      }

      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        // `completed` stays false — skipped is distinct from
        // completed. The Week tab + status-derived analytics need
        // to tell the two states apart.
        status: toStatus,
      };
      await saveProgram({ ...programState, runDays: updatedDays });
    },
    [programState, user, saveProgram]
  );

  // SESSION-RESTORE-01: a skip is a reversible decision. Restore a
  // skipped run slot (or a race_no_show) back to `planned` — a pure
  // status reversal, NOT a completion or an implicit start. It creates
  // no activity record, progression stimulus, streak day, share, Circle
  // event, or manual-completion key. Template, date, stable id, override,
  // race identity (`type`), move metadata, and the manualCompletions map
  // are all untouched. The transition gate (`skipped → planned`,
  // `race_no_show → planned`) is the sole legality check — any other
  // status (planned / completed_*) is refused with a log, so a
  // completed run can never be silently reopened.
  const restoreRunDay = useCallback(
    async (idOrDayIndex: string | number) => {
      if (!programState?.runDays || !user) return;
      const targetIndex =
        typeof idOrDayIndex === "string"
          ? programState.runDays.findIndex((rd) => rd.id === idOrDayIndex)
          : programState.runDays.findIndex(
              (rd) => rd.dayIndex === idOrDayIndex
            );
      if (targetIndex === -1) {
        logger.warn(
          `[restoreRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return;
      }
      const targetDay = programState.runDays[targetIndex];
      const fromStatus = getScheduledRunStatus(targetDay);
      // Only skipped / race_no_show restore to planned; the gate refuses
      // planned (nothing to restore) and terminal completed_* states.
      if (!transitionStatus(fromStatus, "planned")) {
        logger.warn(
          `[restoreRunDay] invalid transition ${fromStatus} → planned for runDay ${targetDay.id ?? targetDay.dayIndex}; skipping`
        );
        return;
      }
      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        status: "planned" as ScheduledRunStatus,
        completed: false,
      };
      await saveProgram({ ...programState, runDays: updatedDays });
    },
    [programState, user, saveProgram]
  );

  // SESSION-RESTORE-01 (lift half): clear `skipped` on a lift day,
  // reversing a skip back to a plannable session. Only reverses a
  // genuine skip on a NON-completed day — a completed day is never
  // reopened, and a non-skipped day is a no-op. No stats, streak, or
  // social side effect (mirrors skipWorkoutDay's write shape).
  const restoreWorkoutDay = useCallback(
    async (dayIndex: number) => {
      if (!programState || !user) return;
      const day = programState.workouts[dayIndex];
      if (!day || !day.skipped || day.completed) return;
      const updated: ProgramState = {
        ...programState,
        workouts: programState.workouts.map((d, i) =>
          i === dayIndex ? { ...d, skipped: false } : d
        ),
      };
      await saveProgram(updated);
    },
    [programState, user, saveProgram]
  );

  // RUN-RESCHEDULE-01: one-off move of a planned run to another day WITHIN
  // its generated Sunday-start week. Moves the plan, not the goalposts — the
  // stable id, template, override, status, completion truth, race identity,
  // and manualCompletions map all survive; only `date`/`dayIndex` and the
  // truthful clash metadata change (see runReschedule.computeRunMove).
  // Guards mirror overrideRunDay: a race is immovable (its date is the
  // event, RUN-RACE-GUARD-01) and only an editable/planned slot moves.
  // `weekSchedule` isn't mutated, and the plan isn't regenerated.
  const moveRunDay = useCallback(
    async (idOrDayIndex: string | number, targetDayIndex: number) => {
      if (!programState?.runDays || !user) return;
      const target = programState.runDays.find((rd) =>
        typeof idOrDayIndex === "string"
          ? rd.id === idOrDayIndex
          : rd.dayIndex === idOrDayIndex
      );
      if (!target) {
        logger.warn(
          `[moveRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return;
      }
      if (!canRescheduleRun(target)) {
        logger.warn(
          `[moveRunDay] runDay ${target.id ?? target.dayIndex} is not reschedulable (race or non-planned); skipping`
        );
        return;
      }
      if (targetDayIndex === target.dayIndex) return; // no-op: same day
      // Integrity guard: never double-book a day (the UI already blocks
      // occupied days, but two runs sharing a dayIndex corrupts the week).
      if (
        programState.runDays.some(
          (rd) => rd.id !== target.id && rd.dayIndex === targetDayIndex
        )
      ) {
        logger.warn(
          `[moveRunDay] dayIndex=${targetDayIndex} already occupied; skipping`
        );
        return;
      }
      const patch = computeRunMove(
        target,
        targetDayIndex,
        profile?.weekSchedule ?? []
      );
      if (!patch) {
        logger.warn(
          `[moveRunDay] could not resolve a date for dayIndex=${targetDayIndex}; skipping`
        );
        return;
      }
      const updatedDays = programState.runDays.map((rd) => {
        if (rd.id !== target.id) return rd;
        // Rebuild the day so a snap-back-to-origin can DROP the move markers
        // (setting them undefined would leave stale values on the array).
        const next: ScheduledRunDay = {
          ...rd,
          date: patch.date,
          dayIndex: patch.dayIndex,
          clashesWithLift: patch.clashesWithLift,
        };
        if (patch.movedFromDate) next.movedFromDate = patch.movedFromDate;
        else delete next.movedFromDate;
        if (patch.movedToDate) next.movedToDate = patch.movedToDate;
        else delete next.movedToDate;
        return next;
      });
      await saveProgram({ ...programState, runDays: updatedDays });
    },
    [programState, user, profile?.weekSchedule, saveProgram]
  );

  // Override a run day template. Refuses to write when the target
  // runDay is already in a terminal status (completed_*, skipped,
  // race_no_show) — the UI is expected to disable the template
  // dropdown in those cases, and this is the defence-in-depth gate
  // for any caller that slips past. Without this, swapping a
  // template on a skipped/completed runDay would silently update
  // the dropdown but leave the day terminal, surfacing as "the
  // change didn't take" from the user's perspective.
  //
  // The "re-engage a skipped run" use case isn't covered here on
  // purpose — that requires an explicit status reset and the
  // current state-machine map (P0-A) treats `skipped` as terminal.
  // If product wants un-skip, add `skipped → planned` to
  // LEGAL_TRANSITIONS and surface an "un-skip" button in the
  // Week tab overflow instead of overloading override semantics.
  // PR-1: id-preferring overload. Same shape as completeRunDay /
  // skipRunDay — string = runDay.id, number = legacy dayIndex.
  // V2 docs have stable IDs (PR-0b-i); future surfaces (Home
  // DayActionSheet) need to address a specific runDay across weeks,
  // not "whichever runDay happens to match this dayIndex". The
  // dayIndex fallback stays for legacy callers (Programme Run tab
  // row select, Week-tab template select) that still pass dow.
  const overrideRunDay = useCallback(
    async (idOrDayIndex: string | number, templateId: string) => {
      if (!programState?.runDays) return;
      const target =
        typeof idOrDayIndex === "string"
          ? programState.runDays.find((rd) => rd.id === idOrDayIndex)
          : programState.runDays.find((rd) => rd.dayIndex === idOrDayIndex);
      if (!target) {
        logger.warn(
          `[overrideRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return;
      }
      // RUN-RACE-GUARD-01: a scheduled race's identity is immutable.
      // Swapping its template to an easy run (then completing it as an
      // ordinary run) would erase the race — refuse by the immutable
      // `type: "race"` signal, which an override never changes.
      if (isScheduledRaceRunDay(target)) {
        logger.warn(
          `[overrideRunDay] refusing to swap a scheduled race (id=${target.id ?? target.dayIndex}); race identity is immutable`
        );
        return;
      }

      // PR-0b-iii: editability gate via the central helper.
      // Only `planned` qualifies for in-place template swap.
      // race_completed_unlinked (reconciliation) is now excluded
      // — its only outgoing path is via a future linking UI, not
      // the shared template editor.
      const status = getScheduledRunStatus(target);
      if (!isScheduledRunEditable(status)) {
        logger.warn(
          `[overrideRunDay] refusing to swap template on non-editable runDay (status="${status}", id=${target.id ?? target.dayIndex}); use Configure Plan to rebuild instead`
        );
        return;
      }

      // Match against the resolved target's id when present
      // (id-preferring), falling back to dayIndex. Without this
      // a multi-week V2 runDays array could double-overwrite
      // (multiple rows with the same dayIndex).
      const updated: ProgramState = {
        ...programState,
        runDays: programState.runDays.map((rd) =>
          (target.id && rd.id === target.id) ||
          (!target.id && rd.dayIndex === target.dayIndex)
            ? { ...rd, templateId, userOverride: templateId }
            : rd
        ),
      };

      await saveProgram(updated);
      // No success toast — the schedule UI shows the new run-day state.
    },
    [programState, saveProgram]
  );

  // Log exercise performance with auto-progression
  const logExercise = useCallback(
    async (
      dayIndex: number,
      exerciseIndex: number,
      actualReps: number,
      actualWeight: number,
      actualRpe?: number
    ) => {
      if (!programState) return;

      const settings = programState.settings ?? {
        autoProgression: true,
        microloading: true,
      };
      const exercise =
        programState.workouts[dayIndex]?.exercises[exerciseIndex];
      if (!exercise) return;

      // Blk2: an "easing back in" block holds load for its first two weeks,
      // so a returning lifter's numbers cannot go backwards while they find
      // their feet and a miss cannot be read as a stall. Deliberately NOT
      // done by flipping `settings.autoProgression` — that is a switch the
      // user owns in Programme settings, and a block must not silently move
      // someone's setting. Unlike the autoProgression:false branch below,
      // this one still APPENDS to performanceHistory: the sessions happened
      // and the user should see them.
      const held = isProgressionHeld(
        programState.trainingBlock,
        programState.trainingBlock
          ? blockWeekOf(programState.trainingBlock, localDateString())
          : null
      );

      let updatedExercise: ProgramExercise;
      if (held) {
        updatedExercise = {
          ...exercise,
          lastAttemptedWeight: actualWeight,
          lastPerformance: {
            sets: exercise.sets,
            reps: actualReps,
            weight: actualWeight,
            completed: actualReps >= exercise.reps,
          },
          performanceHistory: [
            ...(exercise.performanceHistory ?? []),
            {
              date: localDateString(),
              weight: actualWeight,
              repsCompleted: actualReps,
              repsTarget: exercise.reps,
            },
            // D2: one cap across all three sites. Was 20 here and 10 in the
            // engine, so a lifter under an active block silently kept twice
            // the history of one who was not.
          ].slice(-PERFORMANCE_HISTORY_CAP),
        };
      } else if (settings.autoProgression) {
        updatedExercise = applyProgression(
          exercise,
          actualReps,
          actualWeight,
          programState.goal,
          settings.microloading,
          actualRpe
        );
      } else {
        updatedExercise = {
          ...exercise,
          lastAttemptedWeight: actualWeight,
          lastPerformance: {
            sets: exercise.sets,
            reps: actualReps,
            weight: actualWeight,
            completed: actualReps >= exercise.reps,
          },
        };
      }

      if (
        updatedExercise.plateauCount > 0 &&
        updatedExercise.plateauCount !== exercise.plateauCount
      ) {
        toast("Plateau detected — variation may rotate", { icon: "⚠️" });
      }

      const updatedWorkouts = programState.workouts.map((day, di) => {
        if (di !== dayIndex) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex, ei) =>
            ei === exerciseIndex ? updatedExercise : ex
          ),
        };
      });

      await saveProgram({ ...programState, workouts: updatedWorkouts });
    },
    [programState, saveProgram]
  );

  // Update exercise manually (weight override)
  const updateExercise = useCallback(
    async (
      dayIndex: number,
      exerciseIndex: number,
      updates: Partial<ProgramExercise>
    ) => {
      if (!programState) return;

      const updatedWorkouts = programState.workouts.map((day, di) => {
        if (di !== dayIndex) return day;
        return {
          ...day,
          exercises: day.exercises.map((ex, ei) =>
            ei === exerciseIndex ? { ...ex, ...updates } : ex
          ),
        };
      });

      await saveProgram({ ...programState, workouts: updatedWorkouts });
    },
    [programState, saveProgram]
  );

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<ProgramSettings>) => {
      if (!programState) return;
      const current = programState.settings ?? {
        autoProgression: true,
        microloading: true,
      };
      const newSettings = { ...current, ...updates };
      await saveProgram({ ...programState, settings: newSettings });
    },
    [programState, saveProgram]
  );

  // Regenerate program (goal or split change).
  //
  // `overrides` lets callers pass FRESH state directly instead of
  // relying on `profile` having already round-tripped through the
  // hook. Settings → Apply schedule changes used to call
  // `regenerateProgram(undefined, pendingLiftDays)` and then
  // `updateProfile({ weekSchedule: ... })` — so the regenerate ran
  // against the OLD schedule (liftIndices were computed from
  // `profile.weekSchedule` before the new schedule was saved). The
  // resulting run schedule didn't reflect the layout the user just
  // confirmed. Passing schedule + run target via `overrides` makes
  // the regenerate correct on the first call.
  const regenerateProgram = useCallback(
    async (
      goalOverride?: string,
      weeklyTargetOverride?: number,
      overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number }
    ) => {
      if (!profile) return;

      const goal = (goalOverride ??
        programState?.goal ??
        profile.program?.goal ??
        "recomp") as ProgramState["goal"];
      const weeklyTarget =
        weeklyTargetOverride ?? profile.weeklyWorkoutsTarget ?? 4;
      // Prefer programState's persisted primaryGoal (set at onboarding),
      // falling back to the profile value. Regenerate with goal-aware reps.
      const primaryGoal = programState?.primaryGoal ?? profile.primaryGoal;
      const { splitType, workouts } = generateProgram(
        goal,
        weeklyTarget,
        programState?.workouts,
        primaryGoal,
        loadContextFrom(profile),
        overrides?.weekSchedule ?? profile.weekSchedule,
        toExperience(profile.experience)
      );

      // Regenerate run schedule. PR-0b-ii: V2 writers. Full regen
      // resets currentWeek to 0 and trusts V2's fresh totalWeeks
      // (caller intent is "rebuild this plan from scratch").
      let runDays: ScheduledRunDay[] | undefined;
      let runPlan: ProgramState["runPlan"];
      if (profile.runMode && profile.runMode !== "freeform") {
        const runTarget =
          overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
        const effectiveSchedule =
          overrides?.weekSchedule ?? profile.weekSchedule ?? [];
        const weekStart = localWeekKey();
        if (profile.runMode === "race_prep" && profile.raceGoal) {
          ({ runDays, runPlan } = regenerateRacePlan({
            tuning: runTuningFromProfile(profile),
            raceGoal: profile.raceGoal,
            weekSchedule: effectiveSchedule,
            weeklyRunDays: runTarget,
            currentDate: localDateString(),
            weekStart,
          }));
        } else {
          // RUN-M: structured retired — a non-race state is freeform.
          runDays = [];
          runPlan = undefined;
        }
      }

      const newState: ProgramState = {
        goal,
        // Persist primaryGoal across regenerate. Without this, the
        // engine USED primaryGoal to pick rep ranges when generating
        // the new workouts (line above), but the saved state lost
        // the field — so the Program header's "Built for {goal}" line
        // (Program.tsx:381 → primaryGoalLabel) silently fell back to
        // "General Fitness" after every Goal change / Refresh, even
        // for a hypertrophy or strength user.
        ...(primaryGoal !== undefined && { primaryGoal }),
        currentPhase: "base",
        weekNumber: 1,
        splitType,
        workouts,
        fatigueScore: programState?.fatigueScore ?? 0,
        updatedAt: Date.now(),
        settings: programState?.settings ?? {
          autoProgression: true,
          microloading: true,
        },
        weekHistory: [],
        // PR-0b-ii: explicit schema version on regenerate so the
        // freshly-rebuilt state matches the current contract. Pre-
        // PR-0b-ii this was inherited from the prior doc (or
        // missing), which is exactly the V1-shape-in-current-
        // version footgun PR-0b-i's shape-aware migration repairs.
        programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
        // D1: `saveProgram` is a no-merge full replace, so a field this
        // literal does not name is DELETED — the trap that has already cost
        // this codebase the training block once. A regenerate resets to week 1,
        // so the honest anchor is the current calendar week: the rebuilt
        // programme belongs to the week the user is standing in.
        liftWeekKey: localWeekKey(),
        ...(runDays !== undefined && { runDays }),
        ...(runPlan !== undefined && { runPlan }),
      };

      await saveProgram(newState);
      // Sync goal to profile so Settings Training Phase stays in sync
      await updateProfile({
        program: {
          goal,
          startWeight: profile.program?.startWeight ?? profile.weightKg ?? 70,
          currentPhase: "base",
        },
      });
      setViewingHistoryIndex(null);
      toast.success("Program regenerated");
    },
    [profile, programState, saveProgram, updateProfile]
  );

  // Refresh run schedule without resetting program (called when
  // weekSchedule changes). PR-0b-ii: V2 writers + optional
  // overrides to avoid stale-closure reads of profile.weekSchedule.
  // Editor apply path passes the freshly-confirmed schedule
  // through explicitly so we never use the pre-`updateProfile`
  // value.
  const refreshRunSchedule = useCallback(
    async (overrides?: RefreshRunScheduleOverrides) => {
      if (!programState || !profile) return;
      if (!profile.runMode || profile.runMode === "freeform") return;

      const weekSchedule =
        overrides?.weekSchedule ?? profile.weekSchedule ?? [];
      const runTarget =
        overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
      const weekStart = localWeekKey();
      let runDays: ScheduledRunDay[];
      let runPlan = programState.runPlan;

      // PR-F: snapshot per-day userOverrides BEFORE regenerating.
      // Pre-PR-F, refreshRunSchedule called the generator (which
      // builds fresh runDays via buildRunDayV2 with no userOverride
      // field) and wrote the result directly — silently destroying
      // any per-day template overrides the user had set via the
      // inline <select> in ProgrammeRunSection's per-day list.
      // Snapshot dayIndex → userOverride map; restore after the
      // generator runs but only for days still scheduled as
      // run/both (orphan overrides on a day that became rest get
      // dropped).
      const overrideSnapshot: Record<number, string> = {};
      for (const rd of programState.runDays ?? []) {
        if (rd.userOverride) {
          overrideSnapshot[rd.dayIndex] = rd.userOverride;
        }
      }

      // PR-E: recovery phase takes precedence over the runMode
      // branches. When the user just completed a race and is
      // mid-recovery (runPlan.phase === "recovery" + not yet
      // expired), emit all easy_30 templates regardless of mode.
      // runMode stays at race_prep during recovery; the phase flag
      // does the differentiation. PR-D writes the phase on race
      // completion; this generator consumes it on subsequent
      // refreshes (e.g. mid-week schedule edits while recovering).
      const inRecovery = isInRecoveryOn(
        programState.runPlan,
        localDateString()
      );

      if (inRecovery) {
        runDays = scheduleRecoveryWeekV2({ weekSchedule, weekStart });
        runPlan = { ...programState.runPlan! };
      } else if (
        profile.runMode === "race_prep" &&
        profile.raceGoal &&
        // R3: don't regenerate a race-prep plan for a race that has already
        // passed. Recovery has ended here (else `inRecovery` is true), but the
        // server clears profile.raceGoal only at recoveryEndDate + 7d; in that
        // window an elapsed race must fall through to freeform, NOT spawn a
        // fresh plan dated in the past (regenerateRacePlan with a past target
        // produced a 2-week phantom block). Local string compare = date compare.
        localDateString() <= profile.raceGoal.targetDate
      ) {
        // Refresh preserves currentWeek + totalWeeks so the user's
        // race-strip position stays put across mid-week schedule
        // edits. Only `compressed` updates (V2 may flip it if the
        // schedule change pushed run count below race-config
        // thresholds). PR-E: also clear any stale recovery phase
        // — if user has aged out of recovery (recoveryEndDate
        // passed) and we're re-rendering race_prep, drop phase
        // and recoveryEndDate.
        ({ runDays, runPlan } = regenerateRacePlan({
          tuning: overrides?.tuning ?? runTuningFromProfile(profile),
          raceGoal: profile.raceGoal,
          weekSchedule,
          weeklyRunDays: runTarget,
          currentDate: localDateString(),
          weekStart,
          carry: {
            currentWeek: programState.runPlan?.currentWeek,
            totalWeeks: programState.runPlan?.totalWeeks,
            completedRaces: programState.runPlan?.completedRaces,
          },
        }));
      } else {
        // RUN-M: structured retired — a non-race state is freeform.
        runDays = [];
        runPlan = undefined;
      }

      // Re-apply preserved overrides. The generator emits entries
      // keyed by dayIndex; we re-key the snapshot the same way so
      // a user's "Monday=tempo" intent survives weeklyRunDays
      // edits, schedule reshuffles, and mode flips (via the chip
      // row's handleModeChange path). Templates that are no longer
      // scheduled drop silently (snapshot lookup misses; original
      // generator template wins).
      runDays = runDays.map((rd) => {
        const preserved = overrideSnapshot[rd.dayIndex];
        return preserved
          ? { ...rd, userOverride: preserved, templateId: preserved }
          : rd;
      });

      await saveProgram({ ...programState, runDays, runPlan });
    },
    [programState, profile, saveProgram]
  );

  // PR-C: skip-recovery-early writer. Atomic phase clear + mode
  // flip + run-schedule regenerate. Called from the post-race
  // card when the user opts out of the soft window. Race is past,
  // raceGoal preserved (R1 GATED), but the user wants normal
  // training back NOW instead of waiting for the 7-day grace to
  // elapse and the recovery-exit effect to fire.
  //
  // Why a dedicated writer instead of composing skipRecovery +
  // handleModeChange + refresh: refreshRunSchedule reads
  // `programState.runPlan.phase` from its closure. If we cleared
  // phase via saveProgram and then called refresh, the closure
  // would lag and refresh would still emit easy_30. By doing the
  // whole transition in one saveProgram call, we sidestep the
  // closure-lag problem.
  const skipRecoveryEarly = useCallback(async () => {
    if (!programState || !profile) return;
    if (programState.runPlan?.phase !== "recovery") return;

    // Run9 ENG(j) + R3-cycle/backtoback: exiting recovery returns the user to
    // FREEFORM (the race is done — it's recorded in completedRaces), UNLESS a
    // newer race was set during the recovery window, which must be preserved.
    // `resolveRecoveryExit` is the single source of that rule (unit-tested in
    // runModeResolution.test.ts); the patch it returns always co-writes the
    // materialized `runMode` so the invariant can't be violated here.
    const completedRaceGoal =
      programState.runPlan?.raceGoal ?? profile.raceGoal ?? null;
    const exit = resolveRecoveryExit({
      currentRaceGoal: profile.raceGoal ?? null,
      completedRaceGoal,
    });

    if (exit.runMode === "freeform") {
      // Single race done → freeform: drop the runPlan + runDays. saveProgram
      // does a full setDoc, so omitting `runPlan` (undefined → stripped)
      // removes it from the doc. Run9 3a-ii: the `raceGoal: null` clear that
      // resolveRecoveryExit returns is now applied explicitly (the profile type
      // was widened to allow it), so the materialized runMode and the goal can
      // never disagree — no more left-over goal under freeform. The cast
      // bridges the pure core's loose `distance: string` to the narrow union.
      logger.log("[skipRecoveryEarly] race done → freeform; clearing plan");
      await Promise.all([
        updateProfile(exit as Partial<UserProfile>),
        saveProgram({ ...programState, runDays: [], runPlan: undefined }),
      ]);
      return;
    }

    // Back-to-back: a newer future race was set during recovery → stay
    // race_prep, just clear the recovery phase. The race-plan load/regenerate
    // path rebuilds runDays for the new race; we don't regenerate here.
    logger.log(
      "[skipRecoveryEarly] newer race set during recovery → exit recovery, keep race_prep"
    );
    const nextRunPlan = { ...programState.runPlan } as Record<string, unknown>;
    delete nextRunPlan.phase;
    delete nextRunPlan.recoveryEndDate;
    await Promise.all([
      updateProfile({ runMode: "race_prep" }),
      saveProgram({
        ...programState,
        runPlan: nextRunPlan as unknown as RunPlan,
      }),
    ]);
  }, [programState, profile, saveProgram, updateProfile]);

  // ── Run9 phase-3 (Slice DE): one-tap Realign ─────────────────
  //
  // The pre-Run9 fell-behind sheet offered three actions (shift +7d /
  // compress / skip). The redesign collapses the two plan-changing actions
  // into ONE primary "Realign" (keep the race date, re-plan the remaining
  // weeks from today) plus a "my race moved →" route to /settings/training
  // (a UI navigate, not a writer — the +7d auto-shift guess is retired). The
  // skip path stays as `dismissFellBehindPrompt` above.

  /** Q24 (i) — dismiss the prompt without changing the plan. */
  const dismissFellBehindPrompt = useCallback(async () => {
    if (!programState) return;
    if (!programState.pendingFellBehindPrompt) return;
    const next = { ...programState };
    delete next.pendingFellBehindPrompt;
    logger.log("[fellBehind] dismissed without plan change");
    await saveProgram(next);
  }, [programState, saveProgram]);

  /** PROGRAM-DELOAD-01 — apply/revert the deload week via the server
   *  `applyProgramCommand` transaction (the packet-18 command boundary;
   *  these are its first client consumers). The server owns the
   *  mutation — the deload transform, the not-already-deloaded /
   *  snapshot-present preconditions, and the receipt-based idempotency
   *  all run in one transaction — so on success we REFETCH the
   *  authoritative doc rather than re-deriving locally (the
   *  tested-copy-vs-running-copy rule). Requires network: unlike the
   *  offline-queued setDocGuarded writers, a callable can't replay,
   *  and a week-load mutation is not something to apply blind. */
  const sendDeloadCommand = useCallback(
    async (kind: "applyDeloadWeek" | "revertDeloadWeek"): Promise<boolean> => {
      if (!user || !programState) return false;
      const command = {
        kind,
        // Reuses the bounded safe-alphabet id generator (UUID with a
        // non-crypto fallback) — both shapes satisfy the callable's
        // COMMAND_ID_RE.
        commandId: generateInstanceId(),
        expectedWeekNumber: programState.weekNumber,
      };
      try {
        await sendProgramCommand(command);
        const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const normalized = normalizeProgramState(
            snap.data() as ProgramState,
            { primaryGoal: profile?.primaryGoal }
          );
          setProgramState(migrateProgramState(normalized, localWeekKey()));
        }
        return true;
      } catch (err) {
        // P6: a transport failure is queued for replay rather than lost. The
        // server dedupes on `commandId` inside the transaction, so a command
        // that actually landed before the timeout cannot double-apply on
        // reconnect — which is the property that makes queuing safe at all.
        //
        // A SERVER rejection is not queued: it would fail identically on every
        // flush forever. `failed-precondition` is the live case here — the week
        // may already be deloaded by the time the queue drains.
        if (isTransportFailure(err)) {
          enqueueCommand(user.uid, command);
          logger.log(`[useProgram] ${kind} queued — offline`);
        } else {
          logger.error(`[useProgram] ${kind} failed`, err);
        }
        return false;
      }
    },
    [user, profile, programState]
  );

  /* ─── Training blocks (Blk2) ─────────────────────────────────────
     A block owns the lift prescription for its duration. Start and
     release are ONE `saveProgram` each, because the block, the focus and
     the workouts all live on the same document — Firestore's own
     single-document guarantee replaces a transaction, and two active
     blocks are structurally impossible rather than merely guarded.

     Neither writer touches the profile. `profile.primaryGoal` holds the
     user's STANDING focus, which is what `goalBefore` restores from — so
     the mirror rule is satisfied by having no mirror to go stale, not by
     keeping two copies in step. And neither writes
     `profile.weeklyWorkoutsTarget`: it feeds `expectedDayCount`, so a
     block target of 2 on a 4-day plan would send the user's next
     unrelated settings save down the REBUILD branch with
     `liftDaysChanged` false, silently regenerating a 2-day programme
     with no loss-disclosing confirm. ── */

  const startTrainingBlock = useCallback(
    async (input: {
      focus: PrimaryGoal;
      pace: BlockPace;
      durationWeeks: BlockDurationWeeks;
      startDate: string;
      anchorExerciseIds?: string[];
      why?: string;
    }): Promise<boolean> => {
      if (!programState || programState.trainingBlock) return false;
      // A run-only athlete has no prescription for a block to own.
      if (programState.workouts.length === 0) return false;
      const goalBefore =
        profile?.primaryGoal ?? programState.primaryGoal ?? "general";
      const now = Date.now();
      const block: ActiveTrainingBlock = {
        id: makeBlockId(input.startDate, now),
        owned: true,
        focus: input.focus,
        pace: input.pace,
        durationWeeks: input.durationWeeks,
        startDate: input.startDate,
        goalBefore,
        // Amnesty only where early misses are expected: the targets just
        // moved, or the user is deliberately under-reaching.
        amnestyWeeksLeft:
          input.focus !== goalBefore || input.pace === "easing"
            ? BLOCK_AMNESTY_WEEKS
            : 0,
        weeklyLiftTarget: programState.workouts.length,
        anchorExerciseIds: (input.anchorExerciseIds ?? []).slice(0, 3),
        why: input.why ?? "",
        createdAt: now,
        schemaVersion: 1,
      };
      try {
        await saveProgram({
          ...programState,
          primaryGoal: input.focus,
          workouts: represcribeWorkouts(
            programState.workouts,
            input.focus,
            toExperience(profile?.experience)
          ),
          trainingBlock: block,
        });
        return true;
      } catch {
        return false; // saveProgram has already surfaced the failure
      }
    },
    [programState, profile, saveProgram]
  );

  /**
   * End the active block and hand the prescription back to the user's
   * standing focus. Applying the same transform with `goalBefore` IS the
   * inverse — there is no snapshot to restore, so a slot added, removed or
   * swapped mid-block needs no special case.
   *
   * Loads are deliberately NOT rewound. By release the progression engine
   * has been climbing from the stepped-down weight for weeks, so the
   * current load is the truth; `scaleLoadForReps` re-applies only if the
   * restored target is HIGHER.
   */
  const releaseTrainingBlock = useCallback(async (): Promise<boolean> => {
    const block = programState?.trainingBlock;
    if (!programState || !block) return false;
    try {
      await saveProgram({
        ...programState,
        primaryGoal: block.goalBefore,
        // A legacy block adopted at deploy never represcribed anything, so
        // releasing it must not retroactively rewrite a prescription it
        // never owned.
        workouts: block.owned
          ? represcribeWorkouts(
              programState.workouts,
              block.goalBefore,
              toExperience(profile?.experience)
            )
          : programState.workouts,
        trainingBlock: undefined,
      });
      return true;
    } catch {
      return false;
    }
  }, [programState, profile, saveProgram]);

  /**
   * End the block but KEEP its focus as the user's programme focus — the
   * review's "keep this focus, no block" outcome. The prescription stays
   * exactly as the block left it, so there is nothing to re-derive.
   */
  const keepTrainingBlockFocus = useCallback(async (): Promise<boolean> => {
    if (!programState?.trainingBlock) return false;
    try {
      await saveProgram({ ...programState, trainingBlock: undefined });
      return true;
    } catch {
      return false;
    }
  }, [programState, saveProgram]);

  const applyDeloadWeek = useCallback(
    () => sendDeloadCommand("applyDeloadWeek"),
    [sendDeloadCommand]
  );

  const revertDeloadWeek = useCallback(
    () => sendDeloadCommand("revertDeloadWeek"),
    [sendDeloadCommand]
  );

  /** Run9 phase-3 (Slice DE) — re-anchor the race plan to today, keeping the
   *  race date. Regenerates from today so the weeks-to-race delta (shrinking
   *  as time passes) drives the generator: a tight gap yields `compressed`,
   *  below the taper-safe floor it yields the finish-safely shape (belowFloor).
   *  Carries terminal status + re-keys manualCompletions (Slice A) so the
   *  current week's completions survive the regen. Clears the server-written
   *  fell-behind flag if present — but works WITHOUT it too, since the in-tab
   *  Realign banner can be triggered any time the user feels behind. Returns
   *  the timing + totalWeeks so the caller can toast the right copy. */
  const realignRacePlan = useCallback(async (): Promise<{
    timing: RaceTiming;
    totalWeeks: number;
  }> => {
    if (!programState || !profile) return { timing: "healthy", totalWeeks: 0 };
    if (profile.runMode !== "race_prep" || !profile.raceGoal)
      return { timing: "healthy", totalWeeks: 0 };
    // RUN-H1: realign re-plans race-training weeks; it is meaningless during an
    // active recovery window (the race is done) and would regenerate a race
    // plan that drops the recovery phase. The fell-behind prompt that triggers
    // realign is already suppressed during recovery, but guard explicitly so
    // recovery exit stays a deliberate decision (resolveRecoveryExit).
    if (isInRecoveryOn(programState.runPlan, localDateString())) {
      return { timing: "healthy", totalWeeks: 0 };
    }
    // R3: a race that has already passed (recovery ended, raceGoal not yet
    // server-cleared at recoveryEndDate + 7d) must not be realigned —
    // regenerating would produce a phantom plan dated in the past. Leave it for
    // the freeform transition, same as refreshRunSchedule / the rollovers.
    if (localDateString() > profile.raceGoal.targetDate) {
      return { timing: "healthy", totalWeeks: 0 };
    }
    const prevRunPlan = programState.runPlan;
    const { runDays, runPlan, manualCompletions } = regenerateRacePlan({
      tuning: runTuningFromProfile(profile),
      raceGoal: profile.raceGoal,
      weekSchedule: profile.weekSchedule ?? [],
      weeklyRunDays: getWeeklyRunTarget(profile) || 3,
      currentDate: localDateString(),
      weekStart: localWeekKey(),
      carry: {
        currentWeek: prevRunPlan?.currentWeek,
        completedRaces: prevRunPlan?.completedRaces,
      },
      prior: {
        runDays: programState.runDays ?? [],
        manualCompletions: programState.manualCompletions,
      },
    });
    const next = { ...programState, runDays, runPlan, manualCompletions };
    delete next.pendingFellBehindPrompt;
    const timing: RaceTiming = runPlan.belowFloor
      ? "below-floor"
      : runPlan.compressed
        ? "compressible"
        : "healthy";
    logger.log(
      `[realign] re-anchored race plan from today — timing=${timing}, ` +
        `totalWeeks=${runPlan.totalWeeks}, belowFloor=${!!runPlan.belowFloor}`
    );
    await saveProgram(next);
    return { timing, totalWeeks: runPlan.totalWeeks ?? 0 };
  }, [programState, profile, saveProgram]);

  // Week navigation
  const viewWeek = useCallback((historyIndex: number | null) => {
    setViewingHistoryIndex(historyIndex);
  }, []);

  const viewedWorkouts =
    viewingHistoryIndex !== null
      ? (programState?.weekHistory?.[viewingHistoryIndex]?.workouts ?? null)
      : null;

  const viewedWeekNumber =
    viewingHistoryIndex !== null
      ? (programState?.weekHistory?.[viewingHistoryIndex]?.weekNumber ?? null)
      : null;

  const prescription = programState
    ? generateWeekPrescription(programState.weekNumber)
    : null;

  return {
    programState,
    prescription,
    loading,
    completeWorkoutDay,
    skipWorkoutDay,
    setNextWorkout,
    advanceToNextWeek,
    logExercise,
    updateExercise,
    updateSettings,
    regenerateProgram,
    saveProgram,
    markManualComplete,
    unmarkManualComplete,
    skipRunDay,
    restoreRunDay,
    restoreWorkoutDay,
    moveRunDay,
    overrideRunDay,
    refreshRunSchedule,
    skipRecoveryEarly,
    dismissFellBehindPrompt,
    startTrainingBlock,
    releaseTrainingBlock,
    keepTrainingBlockFocus,
    applyDeloadWeek,
    revertDeloadWeek,
    realignRacePlan,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  };
}
