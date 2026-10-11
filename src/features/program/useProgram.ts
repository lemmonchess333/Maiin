import {
  commitProgramTransition,
  commitProgramUpdate,
  type ProgramUpdater,
} from "./programTransition";
import { ProgrammeConflictError, sameStoredValue } from "./stateTransition";
import {
  raceAwaitsItsEnding,
  raceWeekNeedsBuilding,
  weekRolloverAnchor,
} from "./programMaintenance";
import { raceRestSkips } from "./raceRest";
import {
  markDayDone,
  type ProgrammeCompletionContext,
} from "@/lib/workoutCompletion";
import {
  completeLift,
  liftSessionDay,
  liftWorkoutId,
} from "@/lib/liftCompletion";
import {
  applySessionProgression,
  toSessionProgression,
  type SessionPrescription,
} from "./sessionCompletion";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { captureError } from "@/lib/errorReporting";
import { doc, getDoc, getDocFromCache, onSnapshot } from "firebase/firestore";
import {
  hasPendingProgrammeCompletion,
  queuedWritesVersion,
  subscribeQueuedWrites,
  workoutCompletionDayIdentity,
} from "@/lib/offlineQueue";
import {
  isLiftSessionOpen,
  liftSessionVersion,
  subscribeLiftSession,
} from "./openLiftSession";
import { describeRejection, stripCallablePrefix } from "@/lib/callableErrors";
import { auth, db } from "@/lib/firebase";
import { useAuth, type UserProfile } from "@/lib/auth";
import type {
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
import { represcribeWorkouts } from "./represcribe";
import { legacyToActiveBlock, type TrainingBlock } from "./trainingBlock";
import {
  DEFAULT_PROGRAM_SETTINGS,
  normalizeProgramState,
  transitionStatus,
} from "./programTypes";
import { resolveRecoveryExit } from "./runModeResolution";
import { fetchRecentLayoff } from "./fetchRecentLayoff";
import type { LayoffClass } from "./layoffDetection";
import { workoutDayPrecondition } from "./programCommandPrecondition";
import {
  migrateProgramState,
  backfillWeekScheduleIfMissing,
} from "./migrations";
import {
  generateProgram,
  advanceWeek,
  easeBackIn,
  shouldAdvanceWeek,
} from "./programEngine";
import { generateWeekPrescription } from "./weekPrescription";
import {
  nextRunWeek,
  regenerateRacePlan,
  rollLiftWeeks,
  rollRunWeeks,
} from "./weekRollover";
import { loadContextFrom, weightAfterExerciseSwap } from "./startingLoads";
import { showsRpeByDefault, toExperience } from "./experienceModel";
import { sessionMinutesFor } from "./sessionFit";
import { logger } from "@/lib/logger";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";

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
  prescription?: SessionPrescription;
  programmeContext?: ProgrammeCompletionContext;
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
  sessionVariant?: "express45" | "express30" | "easier_today" | "time_budget";
  /**
   * Free-text notes the lifter typed against an exercise during the
   * session, keyed by its index in the day's exercise list.
   *
   * These were held in session state and written to the resume draft, so
   * they survived closing and reopening a session and were then dropped
   * on Finish — the one moment the user would expect them to be kept.
   * "Level 8, 6.0 incline" is exactly the setting they want back next
   * week, and the draft is deleted the moment the workout commits.
   *
   * Optional and additive on the workout doc; older documents simply have
   * no notes, and nothing derives a number from them.
   */
  exerciseNotes?: Record<number, string>;
  /** Lift3 — when the session STARTED (ms). The workout doc is dated by its
   *  start, not by the Finish tap: a session begun at 23:30 and finished at
   *  00:20 belongs to the day it began (streak, active day, PI window and
   *  Home's "today" burn all read `date`). Older drafts omit it → finish
   *  time, the pre-Lift3 behaviour. */
  startedAt?: number;
  /** Lift4 (14): a long or hard run finished in the 24 hours before the
   *  session started (`useHardRunBefore`). Recorded on the workout, and a
   *  leg miss counts half (Lift4 (7)). */
  afterHardRun?: boolean;
}
import type { RaceTiming } from "./runPlanTiming";
import { scheduleRecoveryWeekV2, type RunTuning } from "./runScheduler";
import { localWeekKey, localDateString, addLocalDays } from "@/lib/dateHelpers";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import { planDeloadWeek, type DeloadSwap } from "@/lib/planDeloadWeek";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "./programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";
import { isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import { canRescheduleRun, computeRunMove } from "@/lib/runReschedule";
import { toast } from "@/lib/toast";
import { generateInstanceId, normalizeExercise } from "./programTypes";
import { enqueueCommand, isTransportFailure } from "./commandOutbox";
import { repUnitForExerciseId } from "./repUnits";
import { getExerciseById } from "@/lib/exercises";
import { sendProgramCommand } from "./programCommandClient";
import {
  APPLIED,
  FAILED,
  QUEUED,
  changeStands,
  declined,
  type ProgramOutcome,
  type RealignOutcome,
} from "./programOutcome";

const PROGRAM_DOC = "current";

interface RefreshRunScheduleOverrides {
  profileUpdates?: Partial<UserProfile>;
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

/** "Couldn't add that." + the reason when there is one fit to show. With
 *  none, the plan is being re-read, and the toast says so. */
function rejectedToast(base: string, reason: string | null): void {
  toast.error(reason ? `${base} ${reason}` : `${base} Refreshing.`);
}

/** A change refused on a rule this phone can check itself, such as a race
 *  being completed by hand: said once, with the rule. */
function declineWithReason(base: string, reason: string): ProgramOutcome {
  rejectedToast(base, reason);
  return declined(reason);
}

/** What "next week" says when it opens a lighter week, naming which of a
 *  race's final weeks it is (Lift4 (10)). */
function lighterWeekStarted(raceWeek: ProgramState["raceWeek"]): string {
  if (raceWeek === "race")
    return "Race week: one short session, with nothing heavy for your legs";
  if (raceWeek === "taper")
    return "A lighter week before your race: half the sets, at the same weights";
  if (raceWeek === "after")
    return "A lighter week after your race: half the sets, at the same weights";
  return "A lighter week: half the sets, at the same weights";
}

/** See `readiness` on the hook's return. */
export type ProgramReadiness = "pending" | "ready" | "failed";

/** A finish the week rollover must wait for: a programme session open on
 *  this device, or a finished one still waiting to sync. */
function finishOutstanding(uid: string | undefined): boolean {
  return isLiftSessionOpen() || (!!uid && hasPendingProgrammeCompletion(uid));
}

export function useProgram() {
  const { user, profile, updateProfile, refreshProfile } = useAuth();
  const [programState, setProgramState] = useState<ProgramState | null>(null);
  /**
   * Run15 — how long the runner has been away, resolved once per session and
   * consumed by every race-plan regen below.
   *
   * Held as state rather than fetched per regen because all seven regen sites
   * need the same answer and several are synchronous user actions. Seeded
   * "none", which is the pre-Run15 behaviour: a regen that fires before the
   * read lands rebuilds exactly as it always did, and the next one is
   * correct. Failing toward the old behaviour is the safe direction — the
   * opposite seed would drop a trained runner into a re-entry week on every
   * cold start.
   *
   * Stored WITH the uid it was read for, and matched rather than reset on
   * change. On an account switch the effect refires, but the old value would
   * still be readable until the new read lands — long enough for a
   * regeneration to hand user B user A's layoff. Pairing the two makes that
   * structurally impossible instead of merely unlikely, which is the shape
   * CLAUDE.md's account-switch rule asks for.
   */
  const [layoffRead, setLayoffRead] = useState<{
    uid: string | null;
    cls: LayoffClass;
  }>({ uid: null, cls: "none" });
  const recentLayoff: LayoffClass =
    layoffRead.uid && layoffRead.uid === user?.uid ? layoffRead.cls : "none";
  const [loading, setLoading] = useState(true);
  /**
   * The mirror's gate — deliberately NOT `loading`.
   *
   * `loading` is a UI state, and it is false in two states the mirror
   * must not subscribe in: after the load effect's early return while the
   * profile is still hydrating, and across a profile change while the
   * loader re-reads. Gated on `loading`, the mirror subscribed in the
   * first of those and handed the effects the RAW server document before
   * the loader had migrated it. On a pre-Monday document that is a
   * Sunday-keyed anchor beside a Monday-keyed today, so the lift rollover
   * read it as last week, advanced the week and wrote it — and the
   * loader's migration commit then conflicted and gave up, leaving the
   * document at the old schema with a week it never had.
   * `mondayWeekMigration.auth.spec.ts` lost that race about half the
   * time in CI and most of the time locally.
   *
   * True only once the loader has read the document for this user and
   * committed whatever migration it needed; false again the moment a
   * fresh load starts. The mirror subscribes and unsubscribes with it.
   */
  const [mirrorReady, setMirrorReady] = useState(false);
  /** The load failed for this account: `mirrorReady` will not come. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(
    null
  );

  // Load program from Firestore (with backward-compat normalize)
  useEffect(() => {
    let cancelled = false;
    const loadProgram = async () => {
      setMirrorReady(false);
      setLoadFailed(false);
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
        let next = migrateProgramState(
          normalizeProgramState(raw, {
            primaryGoal: profile.primaryGoal,
          }),
          localWeekKey()
        );
        const today = localDateString();
        const thisWeek = localWeekKey();
        const weekSchedule = profile.weekSchedule ?? [];
        const runTarget = getWeeklyRunTarget(profile) || 3;
        if (profile.runMode === "structured") {
          next = { ...next, runDays: [] };
          delete next.runPlan;
        } else if (
          profile.raceGoal &&
          // Earlier weeks belong to auto-rollover, which archives their
          // history. Only this week's runs are built here, inline with load,
          // so a second effect cannot race the rollover writer.
          raceWeekNeedsBuilding(next, profile, today)
        ) {
          // A cold load must use the same returning-runner evidence as rollover.
          const layoff = await fetchRecentLayoff(user.uid, today);
          if (cancelled || auth.currentUser?.uid !== user.uid) return;
          const runs = regenerateRacePlan({
            recentLayoff: layoff,
            profile,
            raceGoal: profile.raceGoal,
            weekSchedule,
            weeklyRunDays: runTarget,
            currentDate: today,
            weekStart: thisWeek,
            carry: next.runPlan
              ? {
                  currentWeek: next.runPlan.currentWeek,
                  totalWeeks: next.runPlan.totalWeeks,
                  completedRaces: next.runPlan.completedRaces,
                }
              : undefined,
            prior: next.runDays
              ? {
                  runDays: next.runDays,
                  manualCompletions: next.manualCompletions,
                }
              : undefined,
          });
          next = {
            ...next,
            runDays: runs.runDays,
            runPlan: runs.runPlan,
            ...(runs.manualCompletions
              ? { manualCompletions: runs.manualCompletions }
              : {}),
          };
        }
        if (cancelled || auth.currentUser?.uid !== user.uid) return;
        if (!sameStoredValue(next, raw) || profile.runMode === "structured") {
          try {
            next = await commitProgramTransition(
              db,
              user.uid,
              raw,
              next,
              profile.runMode === "structured"
                ? { base: profile, patch: { runMode: "freeform" } }
                : undefined
            );
            if (profile.runMode === "structured") await refreshProfile?.();
          } catch (error) {
            if (!(error instanceof ProgrammeConflictError)) throw error;
            // A user action won the race. Paint that state; never retry an old
            // migration or generation over it.
            const latest = await getDoc(ref);
            if (!latest.exists()) return;
            // Raw, not re-normalised: the winner's state IS the store, and
            // the base every later write commits against must equal it.
            next = latest.data() as ProgramState;
          }
        }
        if (!cancelled && auth.currentUser?.uid === user.uid)
          setProgramState(next);
      } else {
        const goal = profile.program?.goal ?? "recomp";
        const weeklyTarget = profile.weeklyWorkoutsTarget ?? 4;
        // Thread primaryGoal through so the procedural engine reps track
        // what the user asked for. Pre-W1a this call dropped primaryGoal
        // entirely and hypertrophy-rep defaults leaked into every goal.
        const { splitType, workouts } = generateProgram(
          weeklyTarget,
          undefined,
          profile.primaryGoal,
          loadContextFrom(profile),
          // Backlog #10 (M6): the week's SHAPE, so back-to-back days aren't
          // the two that load the same lower back. Read-only — this does not
          // date-pin lifts (ADR-0002).
          profile.weekSchedule,
          toExperience(profile.experience),
          sessionMinutesFor(profile.liftTimeBudgetMinutes),
          // Lift4 (11): the person's equipment and injuries, as a plan
          // built from settings honours them.
          {
            equipment: profile.equipment,
            injuries: profile.injuries,
            barbellAtHome: profile.barbellAtHome,
          }
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
            recentLayoff,
            profile,
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
          // Lift4 (5): the session length the workouts were fitted to.
          sessionMinutes: sessionMinutesFor(profile.liftTimeBudgetMinutes),
          currentPhase: "base",
          weekNumber: 1,
          splitType,
          workouts,
          fatigueScore: 0,
          updatedAt: Date.now(),
          settings: DEFAULT_PROGRAM_SETTINGS,
          weekHistory: [],
          // PR-0b-ii: explicit schema version on initial creation so
          // PR-0b-i's shape-aware migration sees a current doc on
          // next read. Without this, the doc would migrate (no-op)
          // on every cold open until the next saveProgram.
          programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
          ...(runDays !== undefined && { runDays }),
          ...(runPlan !== undefined && { runPlan }),
        };

        if (cancelled || auth.currentUser?.uid !== user.uid) return;
        try {
          const saved = await commitProgramTransition(
            db,
            user.uid,
            null,
            initial,
            profile.runMode === "structured"
              ? { base: profile, patch: { runMode: "freeform" } }
              : undefined
          );
          if (profile.runMode === "structured") await refreshProfile?.();
          if (!cancelled) setProgramState(saved);
        } catch (error) {
          if (!(error instanceof ProgrammeConflictError)) throw error;
          const latest = await getDoc(ref);
          if (!cancelled && latest.exists())
            setProgramState(
              migrateProgramState(
                normalizeProgramState(latest.data() as ProgramState),
                localWeekKey()
              )
            );
        }
      }

      if (!cancelled) setMirrorReady(true);
      setLoading(false);
    };

    loadProgram().catch((err) => {
      logger.error("Failed to load program:", err);
      if (!cancelled) setLoadFailed(true);
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

  // The load effect above reads the document ONCE, and that read is the
  // `base` every user action commits against. Anything else moving the
  // document — the auto-rollover below, `onRunCreated`'s recovery entry,
  // the daily race sweep, a second device — left this client stale for as
  // long as the user stayed on the page, and the next overlapping action
  // failed `mergeChangedFields` with "Your programme changed while you
  // were editing." They were not editing. Pinned in
  // useProgramWriters.test.ts: one out-of-band change to `runDays`, and
  // the very next `realignRacePlan` must commit rather than be refused.
  //
  // Mirror server-acknowledged changes into `programState`. Deliberately a
  // MIRROR, not a second loader: the load effect stays the sole writer
  // (migration, regeneration, initial creation) and this never writes.
  // `fromCache` snapshots are skipped because the load effect owns the
  // cache-first paint, and `hasPendingWrites` ones because a local write
  // not yet acknowledged is not a state to build a base on. `mirrorReady`
  // gates the subscription so it cannot interleave with the load's own
  // migration commit — see its declaration for why `loading` could not;
  // `sameStoredValue` keeps a same-state echo from re-rendering.
  //
  // The snapshot is set RAW, not normalised — and that is load-bearing.
  // Every writer commits with `programState` as its `base`, and
  // `mergeChangedFields` refuses when a key it changes differs between
  // base and store. `normalizeProgramState` adds defaults the store need
  // not carry (`skipped: false` on a workout day, for one), so a
  // normalised mirror left base ≠ store on `workouts` and the very next
  // rollover conflicted, refetched, re-normalised, and conflicted again —
  // 442 times in one test. The loader can normalise because it COMMITS
  // the normalised form; a mirror cannot write, so it must hold exactly
  // what the store holds, which is also what `setProgramState(saved)`
  // after every write already does.
  //
  // What this alone does not close: a user action that starts while the
  // rollover's own transaction is in flight is a closure over the
  // pre-rollover state, so its proposal was computed from it. That half
  // is `saveProgram`'s updater form, which computes the proposal inside
  // the transaction from the live document.
  // `refetchProgramState` and both conflict paints hold this same
  // invariant by setting raw too.
  useEffect(() => {
    if (!user || !mirrorReady) return;
    const uid = user.uid;
    const ref = doc(db, "users", uid, "programState", PROGRAM_DOC);
    const unsubscribe = onSnapshot(
      ref,
      // A write it skipped as pending (another tab's, say) is confirmed by
      // a change to metadata alone, which Firestore delivers only to a
      // listener that asks for metadata changes; without it the mirror
      // kept the state from before that write until the next one.
      { includeMetadataChanges: true },
      (snap) => {
        if (auth.currentUser?.uid !== uid) return;
        if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) return;
        const next = snap.data() as ProgramState;
        setProgramState((prev) =>
          prev && sameStoredValue(prev, next) ? prev : next
        );
      },
      (err) => {
        logger.warn(
          "[useProgram] programme mirror failed; base may go stale until the next load",
          err
        );
      }
    );
    return unsubscribe;
  }, [user, mirrorReady]);

  // Save program to Firestore.
  //
  // Two forms. A plain state is a proposal built from the `programState`
  // the caller rendered, committed against it as the base: the form for
  // the rollover effects, whose refusal refetches and whose effect then
  // recomputes on the refreshed state and fires again. An updater is a
  // proposal built INSIDE the transaction from what the store holds now:
  // the form for a user action, which is a closure over the state it was
  // rendered with and can be a write behind the store by the time it
  // commits — the rollover's own transaction still in flight, a server
  // trigger, a second device. Committed plain, such an action was refused
  // with "Your programme changed while you were editing" for an edit the
  // user never made; computed live, it lands on top of the change.
  //
  // Resolves to the store's state afterwards, or null when the updater
  // declined and nothing was written — the caller decides what a decline
  // means for its own toast.
  const saveProgram = useCallback(
    async (
      proposal: ProgramState | ProgramUpdater,
      profilePatch?: Partial<UserProfile>
    ): Promise<ProgramState | null> => {
      if (!user) throw new Error("Sign in again to save your programme.");
      try {
        const profileChange = profilePatch
          ? { base: profile ?? {}, patch: profilePatch }
          : undefined;
        const { state: saved, written } =
          typeof proposal === "function"
            ? await commitProgramUpdate(db, user.uid, proposal, profileChange)
            : {
                state: await commitProgramTransition(
                  db,
                  user.uid,
                  programState,
                  proposal,
                  profileChange
                ),
                written: true,
              };
        if (auth.currentUser?.uid === user.uid) setProgramState(saved);
        if (profilePatch && written) {
          try {
            await refreshProfile?.();
          } catch (error) {
            logger.warn("[Program] Saved; profile refresh failed", error);
            window.location.reload();
          }
        }
        return written ? saved : null;
      } catch (error) {
        logger.error("[Program] Save failed:", error);
        if (error instanceof ProgrammeConflictError) {
          const latest = await getDoc(
            doc(db, "users", user.uid, "programState", PROGRAM_DOC)
          ).catch(() => null);
          // Raw — see refetchProgramState. A normalised paint here is what
          // turned one refused rollover into an endless loop of them.
          if (auth.currentUser?.uid === user.uid && latest?.exists())
            setProgramState(latest.data() as ProgramState);
        }
        toast.error(
          error instanceof ProgrammeConflictError
            ? error.message
            : "Couldn't save your changes. Try again."
        );
        throw error;
      }
    },
    [user, profile, programState, refreshProfile]
  );

  /**
   * Re-read the authoritative programme document.
   *
   * Every command path needs this and for the same reason: the server may have
   * applied more than the client modelled, so re-deriving the result locally is
   * the tested-copy-vs-running-copy mistake. Extracted once three callers
   * wanted it — success, a rejected remove/add, and the deload command.
   *
   * Returns what it read (undefined when there was nothing to read) so a
   * caller that must ACT on the server's result can do so without waiting a
   * render for `programState` to catch up. `applyEaseWeek` needs it to count
   * how many runs the server actually changed; every other caller ignores
   * the value and just wants the state refreshed.
   */
  const refetchProgramState = useCallback(async (): Promise<
    ProgramState | undefined
  > => {
    if (!user) return undefined;
    const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);
    const snap = await getDoc(ref);
    if (!snap.exists()) return undefined;
    // RAW, for the same reason the mirror is raw: `programState` must be
    // byte-for-byte what the store holds, because it is the `base` every
    // writer commits against. A normalising refetch adds `skipped: false`
    // to a workout day the store does not carry, so the next write that
    // changes `workouts` after ANY applied command finds base ≠ store and
    // is refused. The loader is the one place that may
    // normalise, because it commits what it normalised.
    const raw = snap.data() as ProgramState;
    setProgramState(raw);
    return raw;
  }, [user]);

  /**
   * Run a programme command through the server boundary, optimistically.
   *
   * ── The seam the boundary migration needs (P6) ─────────────────────────
   *
   * There are 32 `saveProgram` call sites against one command-boundary
   * caller, and the reason is not neglect: a `setDoc` rides Firestore's
   * `persistentLocalCache` and replays offline, while a callable does not, and
   * a callable also costs a round trip where `setDoc` resolves from cache
   * instantly. Dragging an exercise and waiting 300ms for the list to settle
   * is a worse app.
   *
   * This closes both gaps at once. The optimistic transform applies locally
   * first, so the UI is as fast as it was; the command goes to the server,
   * which is the sole authority; a transport failure QUEUES the command
   * (`commandOutbox`) and keeps the optimistic state, because the command is
   * durable and will replay; and only a server REJECTION rolls back, because
   * that is the one case where the intent will never be applied.
   *
   * On success it refetches rather than trusting the local transform. The
   * server may have applied more than the client modelled — and re-deriving
   * the result locally is the tested-copy-vs-running-copy mistake.
   *
   * Returns what happened as a `ProgramOutcome`, not a boolean: callers
   * need to tell "declined" from "queued", and a `false` meaning both is the
   * shape that made the first version of this wrong. Writers hand the
   * outcome on, so the screen that asked can tell a refusal from a success.
   *
   * A refusal is handled HERE, whole: the state rolls back, the person is
   * told once (`declinedMessage` plus the server's reason, when it gave one
   * fit to show), and the plan is re-read, because a refusal usually means
   * this phone's copy is stale. Handled in one place, no writer can leave a
   * refused change to undo itself on screen without a word. Pass `null`
   * only for a writer that answers a refusal itself (the reorder writes
   * directly instead).
   */
  const runProgramCommand = useCallback(
    async (
      command: { kind: string; commandId: string } & Record<string, unknown>,
      optimistic: (state: ProgramState) => ProgramState,
      declinedMessage: string | null
    ): Promise<ProgramOutcome> => {
      if (!user || !programState) return FAILED;
      const before = programState;
      setProgramState(optimistic(before));
      try {
        await sendProgramCommand(command);
      } catch (err) {
        if (isTransportFailure(err)) {
          // Durable: it replays on reconnect, and the server dedupes on
          // commandId. Keeping the optimistic state is correct — the intent
          // stands, it just has not landed yet.
          enqueueCommand(user.uid, command);
          logger.log(`[useProgram] ${command.kind} queued — offline`);
          return QUEUED;
        }
        // The server considered it and said no. This is the only case where
        // the user's change is genuinely not happening, so it is the only
        // case that rolls back.
        setProgramState(before);
        logger.error(`[useProgram] ${command.kind} rejected`, err);
        const reason = describeRejection(err);
        captureError(
          err instanceof Error ? err : new Error(String(err)),
          "error",
          {
            command: command.kind,
            code: String((err as { code?: unknown })?.code ?? ""),
            reason: reason ?? "",
          }
        );
        if (declinedMessage !== null) rejectedToast(declinedMessage, reason);
        try {
          await refetchProgramState();
        } catch (refetchError) {
          // The rollback above already shows the state before the change.
          logger.warn(
            `[useProgram] ${command.kind}: re-read after refusal failed`,
            refetchError
          );
        }
        return declined(reason);
      }
      await refetchProgramState();
      return APPLIED;
    },
    [user, programState, refetchProgramState]
  );

  /**
   * Refuse a change this phone can already see will not work: the day is
   * gone, or is no longer in a state that allows it (the screen was showing
   * an older copy of the plan). Said once, the plan re-read so the screen
   * catches up, and reported, so nothing announces it as done.
   */
  const declineStale = useCallback(
    async (message: string): Promise<ProgramOutcome> => {
      rejectedToast(message, null);
      try {
        await refetchProgramState();
      } catch (error) {
        logger.warn("[useProgram] re-read after a stale change failed", error);
      }
      return declined(null);
    },
    [refetchProgramState]
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

  // Both rollovers below wait while a finished session is still on its way
  // to the server, or one is open on this device: a finish lands only on the
  // week it was started in (`commitWorkoutCompletion`), so rolling first
  // drops its progression and leaves its day undone. They re-run when the
  // queue or the open session changes.
  const queuedWrites = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const openSessions = useSyncExternalStore(
    subscribeLiftSession,
    liftSessionVersion,
    liftSessionVersion
  );

  // PR-G: auto week-rollover effect. When the user opens the app
  // and the calendar week has advanced past the week their
  // runDays were generated for, automatically rotate forward to
  // catch up. Mirrors what the user-tapped "Start next week"
  // button does on the Lift tab, but driven by calendar instead
  // of lift completion.
  //
  // Ordering: this effect is declared AFTER PR-D's auto-transition
  // and PR-E's recovery-exit so they run first. Without that
  // ordering, the rollover would archive a planned race-day
  // runDay into weekHistory BEFORE the auto-transition writes
  // `race_no_show` to it, losing the inferred state.
  //
  // Detection: `programState.runDays[0]?.weekKey` is the first day of
  // the week the runDays were last generated for. If that's
  // before `localWeekKey()`, the user is ≥1 week stale.
  //
  // The move itself is `rollRunWeeks` (weekRollover.ts), a pure function
  // a simulator can call too; this effect decides only when the app may
  // write it.
  //
  // Skips: freeform users (no runDays to rotate); users whose
  // runDays is empty (no signal to compare).
  useEffect(() => {
    if (!programState || !profile) return;
    // Not before the loader has read the document from the server and
    // committed what it changed. Until then `programState` can be the
    // cache-first paint, normalised from the cached copy, which the store
    // does not hold: a plan written by `completeOnboarding` has no
    // exercise instanceIds until the loader's first commit adds them. A
    // rollover built on that paint was refused on `workouts` ("Your
    // programme changed while you were editing"), in red, on a new
    // person's first Monday, and its retry from the refetched document
    // was refused again once the loader's commit landed.
    if (!mirrorReady) return;
    // A document the loader has not migrated yet is not one to roll: its
    // week keys are in the OLD vocabulary, and comparing them with today's
    // reads a week that has not passed as one that has. The loader owns
    // migration and commits it; the effect re-runs on the result.
    if (programState.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION)
      return;
    if (!profile.runMode || profile.runMode === "freeform") return;
    // RUN-EV-03: the layoff classification is a REGENERATION DEPENDENCY.
    // The plan paints from the IndexedDB cache in ~ms while
    // fetchRecentLayoff needs the network, so pre-fix this effect rolled a
    // returning runner's stale week forward with recentLayoff "none" —
    // writing a full build week (quality + ramping long run) — and the
    // weekKey guard below then made the wrong week permanent for up to 7
    // days. Wait for the read to resolve for THIS uid (it never rejects —
    // every failure path settles as "none"), and re-run when it lands via
    // the layoffRead dep. Same pattern as the lift rollover's
    // wait-for-migration early-return.
    if (user && layoffRead.uid !== user.uid) return;
    if (finishOutstanding(user?.uid)) return;

    const rollover = weekRolloverAnchor(programState, profile);
    if (rollover?.side !== "run") return;
    const runDayWeekKey = rollover.weekKey;

    const todayKeyG = localWeekKey();
    if (runDayWeekKey >= todayKeyG) return;

    // Moves up to MAX_ROLLOVER_WEEKS weeks without writing; the one
    // saveProgram below writes them all, and a plan further behind moves
    // again when this effect runs on the saved plan.
    const { state: rolling, weeks } = rollRunWeeks(
      programState,
      profile,
      todayKeyG,
      recentLayoff
    );
    if (weeks === 0) return;

    logger.log(
      `[auto-rollover] advanced ${weeks} week${weeks > 1 ? "s" : ""} (from ${runDayWeekKey} to ${rolling.runDays?.[0]?.weekKey ?? "?"})`
    );

    // Said nothing on purpose (Lift4: silent by default). Train's week row
    // names the week, and a count of the calendar weeks caught up is not the
    // programme's: a week with no training holds the week number.
    //
    // saveProgram sets state only after its awaited write, never
    // synchronously: the rule counts any call that reaches a setter.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    saveProgram(rolling).catch((err) => {
      logger.warn("[auto-rollover] save failed", err);
    });
  }, [
    programState,
    profile,
    saveProgram,
    layoffRead,
    recentLayoff,
    user,
    mirrorReady,
    queuedWrites,
    openSessions,
  ]);

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
  /* Resolve the layoff once the user is known. Bounded one-shot read — see
     `fetchRecentLayoff` for why this is not a subscription. Race-prep only: a freeform runner has no plan for a layoff to
     reshape, so the read is not worth making for them. */
  useEffect(() => {
    if (!user?.uid) return;
    if (!profile?.runMode || profile.runMode === "freeform") return;
    let cancelled = false;
    const uid = user.uid;
    void fetchRecentLayoff(uid, localDateString(new Date())).then((cls) => {
      if (!cancelled) setLayoffRead({ uid, cls });
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, profile?.runMode]);

  useEffect(() => {
    if (!programState || !profile) return;
    // Same waits as the run-side effect: never roll the cache-first paint
    // before the loader's server read, and never an unmigrated document.
    if (!mirrorReady) return;
    if (programState.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION)
      return;
    if (finishOutstanding(user?.uid)) return;

    // The run-side effect acts on a "run" anchor and this one on a "lift"
    // anchor, so exactly one of the two can act on any given state. No
    // anchor means a pre-D1 document that `migrateProgramState` has not
    // repaired yet. Do nothing — seeding here would race the migration, and
    // treating absent as stale would roll a returning user forward by the
    // whole iteration cap on first open.
    const rollover = weekRolloverAnchor(programState, profile);
    if (rollover?.side !== "lift") return;
    const anchor = rollover.weekKey;

    const todayKey = localWeekKey();
    if (anchor >= todayKey) return;

    // As the run side: one write per MAX_ROLLOVER_WEEKS weeks at most.
    const { state: rolling, weeks } = rollLiftWeeks(
      programState,
      profile,
      todayKey
    );
    if (weeks === 0) return;

    logger.log(
      `[auto-rollover:lift] advanced ${weeks} week${weeks > 1 ? "s" : ""} (from ${anchor} to ${rolling.liftWeekKey ?? "?"})`
    );

    // As the run rollover above: silent, and saveProgram sets state after
    // its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    saveProgram(rolling).catch((err) => {
      logger.warn("[auto-rollover:lift] save failed", err);
    });
  }, [
    programState,
    profile,
    saveProgram,
    mirrorReady,
    user,
    queuedWrites,
    openSessions,
  ]);

  /* The race's rest days (Lift4 (10)): from two days before a race, and on
     race day, a lift session not done yet is skipped (`raceRestSkips`), so
     race week's session is at least three days before the race. Through
     the same command as a skip the person makes, one session per run (the
     optimistic skip re-runs this for the next), and silently: Train's
     banner says why. Each session is tried once, so a refusal can't loop.
     The same waits as the rollovers above, and after them: a week still to
     roll over is theirs to move first. */
  const raceRestTried = useRef(new Set<string>());
  useEffect(() => {
    if (!programState || !profile) return;
    if (!mirrorReady) return;
    if (programState.programSchemaVersion !== CURRENT_PROGRAM_SCHEMA_VERSION)
      return;
    if (finishOutstanding(user?.uid)) return;
    const rollover = weekRolloverAnchor(programState, profile);
    if (rollover && rollover.weekKey < localWeekKey()) return;
    for (const dayIndex of raceRestSkips(programState, localDateString())) {
      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) continue;
      const key = `${precondition.expectedWeekNumber}:${dayIndex}:${precondition.expectedDaySignature}`;
      if (raceRestTried.current.has(key)) continue;
      raceRestTried.current.add(key);
      void runProgramCommand(
        {
          kind: "skipWorkoutDay",
          commandId: generateInstanceId(),
          ...precondition,
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex ? { ...d, skipped: true } : d
          ),
        }),
        null
      );
      return;
    }
  }, [
    programState,
    profile,
    mirrorReady,
    user,
    queuedWrites,
    openSessions,
    runProgramCommand,
  ]);

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
      if (!programState || !user || auth.currentUser?.uid !== user.uid) {
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

      const workoutId = liftWorkoutId("programme", sessionData.completionId);

      // The exercises the session ran: its prescription, or (a day marked
      // done without one) the day's, at the baseline this completion's
      // progression started from.
      const ran =
        sessionData.prescription?.exercises ??
        day.exercises.map((ex) =>
          ex.sessionProgression?.id === sessionData.completionId
            ? ex.sessionProgression.baseline
            : ex
        );

      const dayIdentity = workoutCompletionDayIdentity(day);
      const savedContext =
        sessionData.programmeContext ??
        (dayIdentity
          ? {
              weekNumber: programState.weekNumber,
              dayIndex,
              dayIdentity,
              trainingBlockId: programState.trainingBlock?.id,
            }
          : undefined);
      const progression = toSessionProgression({
        ...sessionData,
        date: liftSessionDay(sessionData.startedAt),
      });
      const completionContext = savedContext
        ? { ...savedContext, ...(progression ? { progression } : {}) }
        : undefined;
      const matchesCurrentDay =
        completionContext?.weekNumber === programState.weekNumber &&
        completionContext.dayIndex === dayIndex &&
        completionContext.dayIdentity === dayIdentity &&
        completionContext.trainingBlockId === programState.trainingBlock?.id &&
        !(day.completed && day.completedWorkoutId !== workoutId);
      // The plan as the save's transaction leaves it: the session's
      // progression, then the day marked done.
      let committedState: ProgramState | null = matchesCurrentDay
        ? markDayDone(
            completionContext?.progression
              ? applySessionProgression(
                  programState,
                  dayIndex,
                  completionContext.progression
                )
              : programState,
            dayIndex,
            workoutId
          )
        : programState;

      // ── CORE persistence boundary: the workout and the plan in one
      // transaction (`commitWorkoutCompletion`, through `completeLift`).
      // Pre-packet-15 the plan was saved and the workout written after it
      // inside a log-only catch, so a failed workout write left the day
      // done with no workout behind it. The id is deterministic
      // (programme-<completionId>), so a retried Finish writes the same
      // workout rather than a second one. A failure throws to the workout
      // screen, which keeps the session and says so.
      const { committed, ...receipt } = await completeLift({
        uid: user.uid,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
        source: "programme",
        completionId: sessionData.completionId,
        startedAt: sessionData.startedAt,
        ran,
        setLogs: sessionData.setLogs,
        exerciseNotes: sessionData.exerciseNotes,
        durationMinutes: sessionData.durationMinutes,
        bodyweightKg: profile?.weightKg ?? 0,
        title: day.dayName,
        notes: `${sessionData.prescription?.dayName ?? day.dayName} — Programme Week ${sessionData.programmeContext?.weekNumber ?? programState.weekNumber}`,
        extra: {
          sessionVariant: sessionData.sessionVariant,
          ...(sessionData.afterHardRun ? { afterHardRun: true } : {}),
          // D2: session-level provenance for any per-set RPE. Helms p139
          // keeps novices on %1RM rather than RPE for their first month,
          // and p73 claims accuracy only for lifters who are advanced AND
          // RPE-familiar AND near failure, so a later reader must be able
          // to tell whose number it holds. Once per session: it cannot
          // vary within one.
          rpeProvenance: {
            experience: profile?.experience,
            shownByDefault: showsRpeByDefault(
              toExperience(profile?.experience)
            ),
          },
        },
        completion: completionContext,
      });
      if (receipt.syncStatus === "synced") committedState = committed ?? null;
      else
        void receipt.sync.then((status) => {
          if (status === "failed" && auth.currentUser?.uid === user.uid)
            void refetchProgramState();
        });
      // Optimistic while offline; the receipt carries the difference.
      if (auth.currentUser?.uid === user.uid) {
        if (committedState) setProgramState(committedState);
        else await refetchProgramState();
      }
      return receipt;
    },
    [programState, user, profile, refetchProgramState]
  );

  // Skip a workout day (no stats, no social post)
  const skipWorkoutDay = useCallback(
    async (dayIndex: number): Promise<ProgramOutcome> => {
      if (!programState || !user) return FAILED;
      // P6: through the boundary. Equivalent — the reducer sets the same one
      // flag on the same day.
      const skipPrecondition = workoutDayPrecondition(programState, dayIndex);
      if (!skipPrecondition) return declineStale("Couldn't skip that session.");
      return runProgramCommand(
        {
          kind: "skipWorkoutDay",
          commandId: generateInstanceId(),
          ...skipPrecondition,
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex ? { ...d, skipped: true } : d
          ),
        }),
        "Couldn't skip that session."
      );
    },
    [programState, user, runProgramCommand, declineStale]
  );

  // Set a specific day as the next workout (override default progression),
  // or null to follow programme order again. PROGRAM-SESSION-ORDER-01: a
  // cursor change only — layout, loads, history and fatigue are untouched.
  // The writer accepts only an in-range, unfinished day; terminal or
  // malformed selections are refused, with the plan re-read (the derive-time
  // guard in Program.tsx already falls back, but a bad override must not
  // persist either).
  // `undefined` is stripped by the guarded write path, so a reset removes
  // the field rather than storing a stale value.
  const setNextWorkout = useCallback(
    async (dayIndex: number | null): Promise<ProgramOutcome> => {
      if (!programState) return FAILED;
      // P6: BOTH branches go through the boundary. The clear needed its own
      // kind — `setNextWorkout`'s `dayIndex` is part of the day precondition,
      // so it cannot express "no day" — and adding it is what let this migrate
      // whole rather than leaving set and reset on two write paths.
      if (dayIndex === null) {
        if (programState.nextWorkoutOverride == null) return APPLIED;
        return runProgramCommand(
          { kind: "clearNextWorkout", commandId: generateInstanceId() },
          (state) => {
            const { nextWorkoutOverride: _cleared, ...rest } = state;
            return rest as ProgramState;
          },
          "Couldn't go back to programme order."
        );
      }
      const day = programState.workouts[dayIndex];
      const nextPrecondition =
        Number.isInteger(dayIndex) && day && !day.completed && !day.skipped
          ? workoutDayPrecondition(programState, dayIndex)
          : null;
      if (!nextPrecondition)
        return declineStale("Couldn't make that your next session.");
      return runProgramCommand(
        {
          kind: "setNextWorkout",
          commandId: generateInstanceId(),
          ...nextPrecondition,
        },
        (state) => ({ ...state, nextWorkoutOverride: dayIndex }),
        "Couldn't make that your next session."
      );
    },
    [programState, runProgramCommand, declineStale]
  );

  // Manually advance to next week (called from UI)
  const advanceToNextWeek = useCallback(async () => {
    if (!programState) return;
    if (!shouldAdvanceWeek(programState.workouts)) return;

    // Backlog #8: the deload recipe follows training age (Helms H4).
    // Backlog #9: plus the joint plateau x recovery adjustment rule.
    // D1 (revised 2026-08-04): stamp the NEXT calendar week, so a manual
    // advance BUYS a week rather than borrowing the rest of this one.
    //
    // The original stamped `localWeekKey()` — the current week — reasoning
    // that a user finishing early is still inside it. But the rollover fires
    // on `anchor < localWeekKey()`, so the current-week anchor is already
    // stale at the next week rollover: advance on Wednesday and the automatic
    // rollover fires four days later, on top of the advance the user just
    // asked for. The new week got four days instead of seven, and for anyone
    // who habitually finishes early the whole periodization compresses —
    // deloads arriving every ~2 calendar weeks instead of every 4th
    // programme week, which is a training defect, not a display one.
    //
    // Anchoring to the next week key means the automatic rollover stays
    // quiet through that week and fires at the following rollover, so the week the
    // user just advanced into is never silently cut short. If they finish
    // early again they simply advance again — which is the whole point of
    // the button.
    //
    // Built against the live document, with the gate re-checked there: an
    // advance that overlaps the rollover's own transaction — which has just
    // advanced the week — declines rather than advancing a second time.
    const saved = await saveProgram((base) => {
      if (!shouldAdvanceWeek(base.workouts)) return null;
      // Refresh run days for new week. PR-0b-ii: V2 writers + next-
      // week date vantage so the saved runDays carry next-week
      // dates / weekKey. `currentWeek` increments to track week-
      // since-plan-start; `totalWeeks` preserved from prev so the
      // race-strip "Week N of M" display stays consistent. First, so the
      // lift side knows whether next week is the run plan's step-back week.
      const nextRunDate = addLocalDays(new Date(), 7);
      const runs =
        profile?.runMode && profile.runMode !== "freeform"
          ? nextRunWeek(
              base,
              {
                weekStart: localWeekKey(nextRunDate),
                date: localDateString(nextRunDate),
              },
              profile,
              recentLayoff
            )
          : null;
      const advanced = advanceWeek(
        base,
        profile?.experience,
        localWeekKey(addLocalDays(new Date(), 7)),
        runs?.raceBlock ?? null,
        { raceLegTrim: profile?.raceLegTrim === true }
      );
      if (runs) {
        advanced.runDays = runs.runDays;
        advanced.runPlan = runs.runPlan;
      }
      return advanced;
    });
    if (!saved) return;

    if (saved.currentPhase === "deload") {
      toast.info(lighterWeekStarted(saved.raceWeek));
    } else {
      toast.success(`Week ${saved.weekNumber} started`);
    }
  }, [programState, profile, saveProgram, recentLayoff]);

  /**
   * "Ease back in" on Home's Welcome back sheet (Lift4 (11)): the plan's
   * loads `share` lighter, a set fewer this week and the miss counts reset
   * (`easeBackIn`). Built against the live document, as the rollover is:
   * lowering a lift reads its equipment's steps, which `functions/` has no
   * copy of (ADR-0011). Resolves whether it was saved; a failed save has
   * said so already (`saveProgram`).
   */
  const easeBackInAfterBreak = useCallback(
    async (share: number): Promise<boolean> => {
      try {
        const saved = await saveProgram((base) =>
          base.workouts.length > 0 ? easeBackIn(base, share) : null
        );
        return saved !== null;
      } catch {
        return false;
      }
    },
    [saveProgram]
  );

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
    async (runDayId: string): Promise<ProgramOutcome> => {
      if (!programState?.runDays || !user) return FAILED;
      const targetIndex = programState.runDays.findIndex(
        (rd) => rd.id === runDayId
      );
      if (targetIndex === -1) {
        logger.warn(
          `[markManualComplete] no runDay matched id=${runDayId}; skipping`
        );
        return declineStale("Couldn't mark that complete.");
      }
      const targetDay = programState.runDays[targetIndex];

      // RUN-RACE-GUARD-01: a race completes only via a logged run
      // (RunSummary reconciliation), never a manual mark — otherwise a
      // race overridden to easy + manual-completed silently erases the
      // race. Gate on the immutable race identity. Said, not just logged:
      // the run finish screen offers this on an off-plan save and reports
      // whatever comes back.
      if (isScheduledRaceRunDay(targetDay)) {
        logger.warn(
          `[markManualComplete] refusing to manually complete a scheduled race (id=${targetDay.id}); a race completes via a logged run`
        );
        return declineWithReason(
          "Couldn't mark that complete.",
          "A race is complete once you log it as a run."
        );
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
          return declineStale("Couldn't mark that complete.");
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

      return runProgramCommand(
        {
          kind: "setManualRunCompletion",
          commandId: generateInstanceId(),
          runDayId,
          completed: true,
        },
        (state) => ({
          ...state,
          runDays: updatedDays,
          manualCompletions: updatedMap,
        }),
        "Couldn't mark that complete."
      );
    },
    [programState, user, runProgramCommand, declineStale]
  );

  /**
   * PR-J Q2 P11 — Undo a manual mark-complete.
   *
   * Drops the map key. Per Q7 P96 the UI surfaces a separate toast
   * ("Marked as planned again") from the saved-run-deletion toast
   * — DayActionSheet wires the copy.
   */
  const unmarkManualComplete = useCallback(
    async (runDayId: string): Promise<ProgramOutcome> => {
      if (!programState || !user) return FAILED;
      // Not marked: nothing to undo.
      if (
        !programState.manualCompletions ||
        !(runDayId in programState.manualCompletions)
      )
        return APPLIED;
      const next = { ...programState.manualCompletions };
      delete next[runDayId];

      return runProgramCommand(
        {
          kind: "setManualRunCompletion",
          commandId: generateInstanceId(),
          runDayId,
          completed: false,
        },
        (state) => ({ ...state, manualCompletions: next }),
        "Couldn't undo that."
      );
    },
    [programState, user, runProgramCommand]
  );

  // P1-3: Skip a run day (planned → skipped). Same id-or-index
  // overload as completeRunDay so the Week tab's overflow menu can
  // dispatch either way. Transition is gated by transitionStatus,
  // so a no-op call against a terminal-state runDay logs and exits
  // without writing.
  const skipRunDay = useCallback(
    async (idOrDayIndex: string | number): Promise<ProgramOutcome> => {
      if (!programState?.runDays || !user) return FAILED;

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
        return declineStale("Couldn't skip that run.");
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
        return declineStale("Couldn't skip that run.");
      }

      // The command addresses the slot by STABLE ID, so the dayIndex overload
      // has to resolve to one first. It always can: `migrateRunDay` assigns
      // `id` on read and the load path persists the repaired doc, so a
      // legacy id-less runDay is healed before any command runs.
      if (!targetDay.id) {
        logger.warn(
          `[skipRunDay] runDay at dayIndex=${targetDay.dayIndex} has no stable id; skipping`
        );
        return declineStale("Couldn't skip that run.");
      }

      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        // `completed` stays false — skipped is distinct from
        // completed. The Week tab + status-derived analytics need
        // to tell the two states apart.
        status: toStatus,
      };
      return runProgramCommand(
        {
          kind: "transitionRunDay",
          commandId: generateInstanceId(),
          runDayId: targetDay.id,
          to: toStatus,
        },
        (state) => ({ ...state, runDays: updatedDays }),
        "Couldn't skip that run."
      );
    },
    [programState, user, runProgramCommand, declineStale]
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
    async (idOrDayIndex: string | number): Promise<ProgramOutcome> => {
      if (!programState?.runDays || !user) return FAILED;
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
        return declineStale("Couldn't restore that run.");
      }
      const targetDay = programState.runDays[targetIndex];
      const fromStatus = getScheduledRunStatus(targetDay);
      // Only skipped / race_no_show restore to planned; the gate refuses
      // planned (nothing to restore) and terminal completed_* states.
      if (!transitionStatus(fromStatus, "planned")) {
        logger.warn(
          `[restoreRunDay] invalid transition ${fromStatus} → planned for runDay ${targetDay.id ?? targetDay.dayIndex}; skipping`
        );
        return declineStale("Couldn't restore that run.");
      }
      if (!targetDay.id) {
        logger.warn(
          `[restoreRunDay] runDay at dayIndex=${targetDay.dayIndex} has no stable id; skipping`
        );
        return declineStale("Couldn't restore that run.");
      }

      const updatedDays = programState.runDays.slice();
      updatedDays[targetIndex] = {
        ...targetDay,
        status: "planned" as ScheduledRunStatus,
        completed: false,
      };
      return runProgramCommand(
        {
          kind: "transitionRunDay",
          commandId: generateInstanceId(),
          runDayId: targetDay.id,
          to: "planned",
        },
        (state) => ({ ...state, runDays: updatedDays }),
        "Couldn't restore that run."
      );
    },
    [programState, user, runProgramCommand, declineStale]
  );

  // SESSION-RESTORE-01 (lift half): clear `skipped` on a lift day,
  // reversing a skip back to a plannable session. Only reverses a
  // genuine skip on a NON-completed day — a completed day is never
  // reopened, and a non-skipped day is a no-op. No stats, streak, or
  // social side effect (mirrors skipWorkoutDay's write shape).
  const restoreWorkoutDay = useCallback(
    async (dayIndex: number): Promise<ProgramOutcome> => {
      if (!programState || !user) return FAILED;
      const day = programState.workouts[dayIndex];
      // A planned day has nothing to restore.
      if (day && !day.skipped && !day.completed) return APPLIED;
      const precondition =
        day && !day.completed
          ? workoutDayPrecondition(programState, dayIndex)
          : null;
      if (!precondition) return declineStale("Couldn't restore that session.");
      return runProgramCommand(
        {
          kind: "restoreWorkoutDay",
          commandId: generateInstanceId(),
          ...precondition,
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex ? { ...d, skipped: false } : d
          ),
        }),
        "Couldn't restore that session."
      );
    },
    [programState, user, runProgramCommand, declineStale]
  );

  // RUN-RESCHEDULE-01: one-off move of a planned run to another day WITHIN
  // its generated week. Moves the plan, not the goalposts — the
  // stable id, template, override, status, completion truth, race identity,
  // and manualCompletions map all survive; only `date`/`dayIndex` and the
  // truthful clash metadata change (see runReschedule.computeRunMove).
  // Guards mirror overrideRunDay: a race is immovable (its date is the
  // event, RUN-RACE-GUARD-01) and only an editable/planned slot moves.
  // `weekSchedule` isn't mutated, and the plan isn't regenerated.
  const moveRunDay = useCallback(
    async (
      idOrDayIndex: string | number,
      targetDayIndex: number
    ): Promise<ProgramOutcome> => {
      if (!programState?.runDays || !user) return FAILED;
      const target = programState.runDays.find((rd) =>
        typeof idOrDayIndex === "string"
          ? rd.id === idOrDayIndex
          : rd.dayIndex === idOrDayIndex
      );
      if (!target) {
        logger.warn(
          `[moveRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return declineStale("Couldn't move that run.");
      }
      if (!canRescheduleRun(target)) {
        logger.warn(
          `[moveRunDay] runDay ${target.id ?? target.dayIndex} is not reschedulable (race or non-planned); skipping`
        );
        return declineStale("Couldn't move that run.");
      }
      if (targetDayIndex === target.dayIndex) return APPLIED; // same day
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
        return declineStale("Couldn't move that run.");
      }
      if (!target.id) {
        logger.warn(
          `[moveRunDay] runDay at dayIndex=${target.dayIndex} has no stable id; skipping`
        );
        return declineStale("Couldn't move that run.");
      }
      // Computed here for the OPTIMISTIC paint only. The command sends just
      // the run id and the target day: the date, the move markers and the
      // clash flag are all re-derived server-side from the run's own week
      // anchor, so a client cannot place a run outside its week — the one
      // thing this feature is defined not to do. Same shared rule both
      // sides, pinned by runReschedule.cross.test.ts.
      const patch = computeRunMove(
        target,
        targetDayIndex,
        profile?.weekSchedule ?? []
      );
      if (!patch) {
        logger.warn(
          `[moveRunDay] could not resolve a date for dayIndex=${targetDayIndex}; skipping`
        );
        return declineStale("Couldn't move that run.");
      }
      const targetId = target.id;
      return runProgramCommand(
        {
          kind: "moveRunDay",
          commandId: generateInstanceId(),
          runDayId: targetId,
          targetDayIndex,
        },
        (state) => ({
          ...state,
          runDays: (state.runDays ?? []).map((rd) => {
            if (rd.id !== targetId) return rd;
            // Rebuild the day so a snap-back-to-origin can DROP the move
            // markers (setting them undefined would leave stale values).
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
          }),
        }),
        "Couldn't move that run."
      );
    },
    [programState, user, profile?.weekSchedule, runProgramCommand, declineStale]
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
    /* Returns whether the swap actually landed. AdjustWeekSheet applies a
       whole week of these at once and has to tell the athlete the truth
       about how many took — it used to fire them unawaited and claim
       success unconditionally. DayActionSheet ignores the value; a
       single swap already reports itself through the UI. */
    async (
      idOrDayIndex: string | number,
      templateId: string
    ): Promise<boolean> => {
      if (!programState?.runDays) return false;
      const target =
        typeof idOrDayIndex === "string"
          ? programState.runDays.find((rd) => rd.id === idOrDayIndex)
          : programState.runDays.find((rd) => rd.dayIndex === idOrDayIndex);
      if (!target) {
        logger.warn(
          `[overrideRunDay] no runDay matched ${typeof idOrDayIndex === "string" ? "id" : "dayIndex"}=${idOrDayIndex}; skipping`
        );
        return false;
      }
      // RUN-RACE-GUARD-01: a scheduled race's identity is immutable.
      // Swapping its template to an easy run (then completing it as an
      // ordinary run) would erase the race — refuse by the immutable
      // `type: "race"` signal, which an override never changes.
      if (isScheduledRaceRunDay(target)) {
        logger.warn(
          `[overrideRunDay] refusing to swap a scheduled race (id=${target.id ?? target.dayIndex}); race identity is immutable`
        );
        return false;
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
        return false;
      }

      if (!target.id) {
        logger.warn(
          `[overrideRunDay] runDay at dayIndex=${target.dayIndex} has no stable id; skipping`
        );
        return false;
      }

      // Match against the resolved target's id — the dayIndex fallback that
      // used to sit here is gone with the id guard above, and it was the
      // riskier branch anyway (a multi-week V2 runDays array can hold several
      // rows with the same dayIndex, so it could double-overwrite).
      const targetId = target.id;
      const outcome = await runProgramCommand(
        {
          kind: "overrideRunDay",
          commandId: generateInstanceId(),
          runDayId: targetId,
          templateId,
        },
        (state) => ({
          ...state,
          runDays: (state.runDays ?? []).map((rd) =>
            rd.id === targetId
              ? { ...rd, templateId, userOverride: templateId }
              : rd
          ),
        }),
        "Couldn't change that run."
      );
      // No success toast — the schedule UI shows the new run-day state.
      return changeStands(outcome);
    },
    [programState, runProgramCommand]
  );

  /* `updateExercise` (manual sets/reps/weight override) was DELETED here
   * rather than migrated. It had zero consumers: defined, returned from the
   * hook, and referenced by no component, page or test anywhere in `src`.
   * Migrating it would have been work to make dead code go through the
   * boundary, and the boundary's own reachability gate can't see it — the
   * symbol gate checks module exports, and this was a property of the hook's
   * return object. Same call as `epley1RM` in P4.
   *
   * The server's `updateExercise` command KIND stays. It is a validated
   * branch inside `applyProgramCommand`, not a separately-deployed endpoint,
   * so the "stale container still serving" hazard that retired
   * `askGeminiText` does not apply — and a manual-override UI is a plausible
   * future caller for it. It now has no client caller; that is the note, not
   * a defect.
   */

  // Update settings
  const updateSettings = useCallback(
    async (updates: Partial<ProgramSettings>): Promise<ProgramOutcome> => {
      if (!programState) return FAILED;
      const current = programState.settings ?? DEFAULT_PROGRAM_SETTINGS;
      const newSettings = { ...current, ...updates };
      // P6: the MERGE stays client-side and the full result is sent: the
      // validator requires auto-progression, and the reducer writes both.
      return runProgramCommand(
        {
          kind: "setProgramSettings",
          commandId: generateInstanceId(),
          settings: {
            autoProgression: newSettings.autoProgression,
            smallPlates: newSettings.smallPlates,
          },
        },
        (state) => ({ ...state, settings: newSettings }),
        "Couldn't save that setting."
      );
    },
    [programState, runProgramCommand]
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
      overrides?: {
        weekSchedule?: ScheduleDay[];
        weeklyRunDaysTarget?: number;
        profileUpdates?: Partial<UserProfile>;
      }
    ) => {
      if (!profile) return;
      // Null before the server has answered means the programme has not
      // loaded, not that there is none. Rebuilt from nothing then, the
      // plan was committed against no document while one exists, and
      // refused as a conflict: the weekly-layout sheet's restructure
      // reached it from Settings while the programme loaded. Refused here
      // as `refreshRunSchedule` refuses. Once `mirrorReady`, null does
      // mean there is none, and the rebuild below creates it.
      if (!programState && !mirrorReady)
        throw new Error("Wait for your programme to load, then try again.");

      const goal = (goalOverride ??
        programState?.goal ??
        profile.program?.goal ??
        "recomp") as ProgramState["goal"];
      const weeklyTarget =
        weeklyTargetOverride ?? profile.weeklyWorkoutsTarget ?? 4;
      // Prefer programState's persisted primaryGoal (set at onboarding),
      // falling back to the profile value. Regenerate with goal-aware reps.
      const build = (base: ProgramState | null): ProgramState => {
        const primaryGoal = base?.primaryGoal ?? profile.primaryGoal;
        const { splitType, workouts } = generateProgram(
          weeklyTarget,
          base?.workouts,
          primaryGoal,
          loadContextFrom(profile),
          overrides?.weekSchedule ?? profile.weekSchedule,
          toExperience(profile.experience),
          sessionMinutesFor(profile.liftTimeBudgetMinutes),
          // Lift4 (11): a reset keeps the person's equipment and injuries.
          {
            equipment: profile.equipment,
            injuries: profile.injuries,
            barbellAtHome: profile.barbellAtHome,
          }
        );

        // Regenerate run schedule. PR-0b-ii: V2 writers. Full regen
        // resets currentWeek to 0 and trusts V2's fresh totalWeeks
        // (caller intent is "rebuild this plan from scratch").
        let runDays: ScheduledRunDay[] | undefined;
        let runPlan: ProgramState["runPlan"];
        if (profile.runMode && profile.runMode !== "freeform") {
          const runTarget =
            overrides?.weeklyRunDaysTarget ??
            (getWeeklyRunTarget(profile) || 3);
          const effectiveSchedule =
            overrides?.weekSchedule ?? profile.weekSchedule ?? [];
          const weekStart = localWeekKey();
          if (profile.runMode === "race_prep" && profile.raceGoal) {
            ({ runDays, runPlan } = regenerateRacePlan({
              recentLayoff,
              profile,
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
          // the field — so Train named the general focus after every
          // Goal change / Refresh, even for a hypertrophy or strength
          // user.
          ...(primaryGoal !== undefined && { primaryGoal }),
          // Lift4 (5): the session length the workouts were fitted to.
          sessionMinutes: sessionMinutesFor(profile.liftTimeBudgetMinutes),
          currentPhase: "base",
          weekNumber: 1,
          splitType,
          workouts,
          fatigueScore: base?.fatigueScore ?? 0,
          updatedAt: Date.now(),
          settings: base?.settings ?? DEFAULT_PROGRAM_SETTINGS,
          weekHistory: [],
          // Blk2 / H1. `saveProgram` is a no-merge full replace and this
          // literal spreads nothing from `programState`, so an unnamed field
          // is DELETED. Without this line a lift-day change from the weekly
          // layout sheet — an ordinary two-tap edit, not a reset — destroys
          // the active block while leaving its rep prescription and focus in
          // force, with no `goalBefore` left to release to.
          //
          // `planBuilder.ts` carries the block through the SAME hazard and
          // says so in a comment; the fix was never carried to this sibling
          // path. Regenerating under a block is coherent because the engine
          // re-authors from `primaryGoal`, which during a block IS the
          // block's focus — so the rebuild is already in the block's terms.
          ...(base?.trainingBlock ? { trainingBlock: base.trainingBlock } : {}),
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
        return newState;
      };

      const profilePatch = {
        ...overrides?.profileUpdates,
        program: {
          goal,
          startWeight: profile.program?.startWeight ?? profile.weightKg ?? 70,
          currentPhase: "base",
        },
      };
      // The goal, weekly layout and generated programme become visible
      // together. Built against the live document when there is one — a
      // regenerate moves `workouts`, the key the rollover moves too, so it
      // is the write most likely to overlap one. A first-ever programme has
      // nothing to read, and creates.
      await saveProgram(programState ? build : build(null), profilePatch);
      setViewingHistoryIndex(null);
      toast.success("Program regenerated");
    },
    [profile, programState, mirrorReady, saveProgram, recentLayoff]
  );

  // Refresh run schedule without resetting program (called when
  // weekSchedule changes). PR-0b-ii: V2 writers + optional
  // overrides to avoid stale-closure reads of profile.weekSchedule.
  // Editor apply path passes the freshly-confirmed schedule
  // through explicitly so we never use the pre-`updateProfile`
  // value.
  const refreshRunSchedule = useCallback(
    async (overrides?: RefreshRunScheduleOverrides) => {
      if (!programState || !profile) {
        if (overrides?.profileUpdates)
          throw new Error("Wait for your programme to load, then try again.");
        return;
      }
      if (!profile.runMode || profile.runMode === "freeform") return;

      const weekSchedule =
        overrides?.weekSchedule ?? profile.weekSchedule ?? [];
      const runTarget =
        overrides?.weeklyRunDaysTarget ?? (getWeeklyRunTarget(profile) || 3);
      const weekStart = localWeekKey();
      // Built against the live document: the overrides snapshot, the
      // recovery check and the carried week position all read the state
      // the store holds at commit, not the render the tap happened on.
      await saveProgram((base) => {
        let runDays: ScheduledRunDay[];
        let runPlan = base.runPlan;

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
        for (const rd of base.runDays ?? []) {
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
        const inRecovery = isInRecoveryOn(base.runPlan, localDateString());

        if (inRecovery) {
          runDays = scheduleRecoveryWeekV2({ weekSchedule, weekStart });
          runPlan = { ...base.runPlan! };
        } else if (
          profile.runMode === "race_prep" &&
          profile.raceGoal &&
          // R3: don't regenerate a race-prep plan for a race that has already
          // passed. Recovery has ended here (else `inRecovery` is true), but the
          // server clears profile.raceGoal only at recoveryEndDate + 7d; in that
          // window an elapsed race must wait for its own ending (the next
          // branch), NOT spawn a fresh plan dated in the past (regenerateRacePlan
          // with a past target produced a 2-week phantom block). Local string
          // compare = date compare.
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
            recentLayoff,
            profile,
            tuning: overrides?.tuning,
            raceGoal: profile.raceGoal,
            weekSchedule,
            weeklyRunDays: runTarget,
            currentDate: localDateString(),
            weekStart,
            carry: {
              currentWeek: base.runPlan?.currentWeek,
              totalWeeks: base.runPlan?.totalWeeks,
              completedRaces: base.runPlan?.completedRaces,
            },
          }));
        } else if (
          raceAwaitsItsEnding(base.runPlan, profile, localDateString())
        ) {
          // The race has passed: race prep is the race lifecycle's to end,
          // from the plan and its race day, so both stay as they are.
          runDays = base.runDays ?? [];
          runPlan = base.runPlan;
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

        return { ...base, runDays, runPlan };
      }, overrides?.profileUpdates);
    },
    [programState, profile, saveProgram, recentLayoff]
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
  const skipRecoveryEarly = useCallback(async (): Promise<ProgramOutcome> => {
    if (!programState || !profile) return FAILED;
    // Already out of recovery: nothing to end.
    if (programState.runPlan?.phase !== "recovery") return APPLIED;

    // P6: ONE command, replacing `Promise.all([updateProfile, saveProgram])`.
    //
    // That pair was two independent writes to two documents, and either could
    // land without the other — leaving `profile.runMode` disagreeing with
    // `runPlan.phase`, which is precisely the invariant the code above it
    // claimed to protect. The reducer now resolves the exit and writes both
    // halves inside one transaction, so they commit together or not at all.
    //
    // The command carries NO payload: `resolveRecoveryExit` runs server-side
    // over the transaction-current profile and runPlan, so who the user
    // returns to is never something this client asserts. The optimistic patch
    // below therefore has to reproduce the same decision locally, and it does
    // it by calling the same shared function.
    const completedRaceGoal =
      programState.runPlan?.raceGoal ?? profile.raceGoal ?? null;
    const exit = resolveRecoveryExit({
      currentRaceGoal: profile.raceGoal ?? null,
      completedRaceGoal,
    });

    const outcome = await runProgramCommand(
      { kind: "skipRecoveryEarly", commandId: generateInstanceId() },
      (state) => {
        if (exit.runMode === "freeform") {
          const next = { ...state, runDays: [] };
          delete next.runPlan;
          return next;
        }
        const nextRunPlan = { ...state.runPlan } as Record<string, unknown>;
        delete nextRunPlan.phase;
        delete nextRunPlan.recoveryEndDate;
        return { ...state, runPlan: nextRunPlan as unknown as RunPlan };
      },
      "Couldn't end recovery."
    );

    if (!changeStands(outcome)) return outcome;
    // The profile half landed SERVER-side, so the local copy is stale until
    // it is re-read. Without this the recovery hero would linger on a plan
    // that no longer has a recovery phase.
    await refreshProfile();
    logger.log(`[skipRecoveryEarly] exited recovery → ${exit.runMode}`);
    return outcome;
  }, [programState, profile, runProgramCommand, refreshProfile]);

  // ── Run9 phase-3 (Slice DE): one-tap Realign ─────────────────
  //
  // The pre-Run9 fell-behind sheet offered three actions (shift +7d /
  // compress / skip). The redesign collapses the two plan-changing actions
  // into ONE primary "Realign" (keep the race date, re-plan the remaining
  // weeks from today) plus a "my race moved →" route to /settings/training
  // (a UI navigate, not a writer — the +7d auto-shift guess is retired). The
  // skip path stays as `dismissFellBehindPrompt` above.

  /** Q24 (i) — dismiss the prompt without changing the plan. */
  const dismissFellBehindPrompt =
    useCallback(async (): Promise<ProgramOutcome> => {
      if (!programState) return FAILED;
      if (!programState.pendingFellBehindPrompt) return APPLIED;
      logger.log("[fellBehind] dismissed without plan change");
      return runProgramCommand(
        { kind: "dismissFellBehindPrompt", commandId: generateInstanceId() },
        (state) => {
          const next = { ...state };
          delete next.pendingFellBehindPrompt;
          return next;
        },
        "Couldn't dismiss that."
      );
    }, [programState, runProgramCommand]);

  /**
   * Reorder one day's exercises through the command boundary — the first
   * writer migrated off `saveProgram` (P6).
   *
   * Chosen first because it is the only exercise edit that is PROVABLY
   * equivalent to its server reducer: a pure permutation by `instanceId`, no
   * load calibration, no catalog rebuild, no undo partner. The reducer refuses
   * anything but an exact permutation of the day's current ids, so a stale
   * client cannot silently drop or duplicate a slot.
   *
   * ── The legacy-document case, and why the obvious guard does not work ──
   *
   * `instanceId` is assigned LAZILY by `normalizeExercise` on READ, so a
   * document written before the field existed carries none until some save
   * rewrites it. The first version of this checked "do all the exercises have
   * ids?" before sending — which is DEAD, because normalisation has already
   * filled them in by the time any of this runs. The client always sees ids;
   * the server's copy is what may not have them, and the client cannot see
   * that. A test caught the guard never firing.
   *
   * So the fallback is on the REJECTION instead: if the reducer refuses the
   * permutation, write directly, which both honours the reorder and persists
   * the ids so the next one goes through the boundary. It self-heals in one
   * use.
   *
   * The cost is honest and bounded: a genuinely stale client also lands here
   * and gets last-write-wins, which is the pre-boundary behaviour for this
   * exact operation rather than a new hazard. A reorder is a permutation of
   * slots the user is looking at, so the blast radius is one day's ordering —
   * not the load-bearing state the boundary exists to protect.
   */
  const reorderDayExercises = useCallback(
    async (
      dayIndex: number,
      orderedInstanceIds: string[]
    ): Promise<boolean> => {
      if (!programState) return false;
      const day = programState.workouts[dayIndex];
      if (!day || orderedInstanceIds.length !== day.exercises.length) {
        return false;
      }

      const permute = (state: ProgramState): ProgramState => {
        const target = state.workouts[dayIndex];
        if (!target) return state;
        const byId = new Map(
          target.exercises.map((ex) => [ex.instanceId, ex] as const)
        );
        const reordered = orderedInstanceIds.map((id) => byId.get(id));
        if (reordered.some((ex) => ex === undefined)) return state;
        return {
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex
              ? { ...d, exercises: reordered as ProgramExercise[] }
              : d
          ),
        };
      };

      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) return false;
      // No decline message: a refusal here is answered with the direct write
      // below, not a toast.
      const outcome = await runProgramCommand(
        {
          kind: "reorderExercises",
          commandId: generateInstanceId(),
          ...precondition,
          orderedInstanceIds,
        },
        permute,
        null
      );

      if (outcome.status === "declined") {
        logger.log(
          "[useProgram] reorder rejected — writing directly, which also persists the instanceIds"
        );
        await saveProgram((base) => {
          const next = permute(base);
          return next === base ? null : next;
        });
      }
      // Applied, queued, or written directly — the user's reorder stuck in all
      // three. Only a bail (nothing loaded, signed out) returns false.
      return outcome.status !== "failed";
    },
    [programState, runProgramCommand, saveProgram]
  );

  /**
   * Remove one exercise from a day, through the boundary.
   *
   * Migrated because it is equivalent: the reducer is a pure removal by
   * `instanceId`, exactly what the client did by index. Note this is the
   * remove with NO undo partner — the other one offers an undo that
   * re-inserts the exercise WITH its history and load, and the server's
   * `addExercises` rebuilds from the catalog and can restore neither, so
   * migrating that half while its undo stays a direct write would leave
   * precisely the mixed-mode clobbering the boundary exists to remove.
   *
   * A rejection here means "it is already gone" — the client's view is stale,
   * so it REFETCHES rather than rolling back to a state now known to be wrong.
   * That is a different recovery from the reorder's, and deliberately so: you
   * cannot repair a stale removal by forcing it.
   */
  const removeExerciseFromDay = useCallback(
    async (dayIndex: number, instanceId: string): Promise<boolean> => {
      if (!programState) return false;
      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) return false;
      const outcome = await runProgramCommand(
        {
          kind: "removeExercise",
          commandId: generateInstanceId(),
          ...precondition,
          exerciseInstanceId: instanceId,
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  exercises: d.exercises.filter(
                    (ex) => ex.instanceId !== instanceId
                  ),
                }
              : d
          ),
        }),
        "Couldn't remove that."
      );
      return changeStands(outcome);
    },
    [programState, runProgramCommand]
  );

  /**
   * Append exercises to a day, through the boundary.
   *
   * Equivalent because both sides start an added movement UNCALIBRATED: the
   * reducer's own comment says it matches "the client add default (3×10×0)",
   * and it does. That is what separates this from `replaceExercise`, where the
   * client calibrates against the profile and the server deliberately does not
   * — migrating that one would regress every swap to 0 kg.
   *
   * The server derives the name and category from the catalog rather than
   * trusting a client-supplied exercise object, which is the boundary's whole
   * security stance, so only ids cross the wire.
   */
  const addExercisesToDayCmd = useCallback(
    async (dayIndex: number, exerciseIds: string[]): Promise<boolean> => {
      if (!programState || exerciseIds.length === 0) return false;
      const commandId = generateInstanceId();
      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) return false;
      const outcome = await runProgramCommand(
        {
          kind: "addExercises",
          commandId,
          ...precondition,
          exercises: exerciseIds.map((exerciseId) => ({ exerciseId })),
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  exercises: [
                    ...d.exercises,
                    ...exerciseIds.map((exerciseId, n) => {
                      const repUnit = repUnitForExerciseId(exerciseId);
                      return normalizeExercise({
                        name: getExerciseById(exerciseId)?.name ?? exerciseId,
                        exerciseId,
                        // Mirror the reducer's deterministic ids so the
                        // optimistic rows and the refetched ones are the same
                        // rows — otherwise React remounts every added item.
                        instanceId: `cmd-${commandId}-${n}`,
                        sets: 3,
                        reps: repUnit === "seconds" ? 30 : 10,
                        weight: 0,
                        ...(repUnit !== undefined ? { repUnit } : {}),
                      });
                    }),
                  ],
                }
              : d
          ),
        }),
        "Couldn't add that."
      );
      return changeStands(outcome);
    },
    [programState, runProgramCommand]
  );

  /**
   * Undo the last removal, through the boundary (P6).
   *
   * Carries no payload beyond the precondition: WHAT to restore is server
   * state. That is the point of the soft delete — the client cannot rebuild a
   * removed exercise's logged history or calibrated load, so an undo that
   * reconstructed it from the catalog would hand back a different exercise
   * wearing the same name. The reducer stashed the original verbatim.
   *
   * No optimistic transform. Restoring locally would mean reconstructing the
   * exercise the client just dropped — exactly the thing it cannot do
   * faithfully — so this one waits for the refetch. An undo tap is rare and
   * deliberate, unlike a drag.
   */
  const restoreRemovedExercise = useCallback(
    async (dayIndex: number): Promise<boolean> => {
      if (!programState) return false;
      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) return false;
      const outcome = await runProgramCommand(
        {
          kind: "restoreExercise",
          commandId: generateInstanceId(),
          ...precondition,
        },
        (state) => state,
        "Couldn't undo that."
      );
      return changeStands(outcome);
    },
    [programState, runProgramCommand]
  );

  /**
   * Swap one exercise for another, through the boundary.
   *
   * The load is calibrated HERE and sent as a bounded scalar. That is the
   * decision that unblocked this site: the reducer previously hard-coded
   * `weight: 0` because it has no profile context, so routing the swap through
   * the boundary would have silently downgraded every replacement to
   * uncalibrated. The alternative was a 15th TS↔JS mirror carrying the
   * variation bank's loadFactor table — data edited twice in this arc alone.
   * The reducer's own note records the reasoning in full.
   *
   * Only the load crosses as a number. The replacement's NAME and CATEGORY are
   * still derived server-side from the catalog, which is the part the
   * boundary's security stance is actually about.
   *
   * A rejection refetches rather than rolling back: "that exercise is no longer
   * in this workout" means the client's view is stale, and re-reading is the
   * only honest answer to that.
   */
  const replaceExerciseInDay = useCallback(
    async (
      dayIndex: number,
      oldInstanceId: string,
      replacementExerciseId: string
    ): Promise<boolean> => {
      if (!programState) return false;
      const day = programState.workouts[dayIndex];
      const old = day?.exercises.find((ex) => ex.instanceId === oldInstanceId);
      if (!old) return false;

      const calibrated = weightAfterExerciseSwap(
        old,
        replacementExerciseId,
        loadContextFrom(profile)
      );
      const commandId = generateInstanceId();
      const replacementRepUnit = repUnitForExerciseId(replacementExerciseId);
      const unitChanged =
        (old.repUnit === "seconds") !== (replacementRepUnit === "seconds");
      const replacementReps = unitChanged
        ? replacementRepUnit === "seconds"
          ? 30
          : 10
        : old.reps;

      const precondition = workoutDayPrecondition(programState, dayIndex);
      if (!precondition) return false;
      const outcome = await runProgramCommand(
        {
          kind: "replaceExercise",
          commandId,
          ...precondition,
          oldInstanceId,
          replacementExerciseId,
          replacementWeight: calibrated.weight,
        },
        (state) => ({
          ...state,
          workouts: state.workouts.map((d, i) =>
            i === dayIndex
              ? {
                  ...d,
                  exercises: d.exercises.map((ex) =>
                    ex.instanceId === oldInstanceId
                      ? normalizeExercise({
                          name:
                            getExerciseById(replacementExerciseId)?.name ??
                            replacementExerciseId,
                          exerciseId: replacementExerciseId,
                          // The reducer's deterministic id, so the refetch does
                          // not remount the row.
                          instanceId: `cmd-${commandId}`,
                          sets: old.sets,
                          reps: replacementReps,
                          weight: calibrated.weight,
                          movementCategory: calibrated.movementCategory,
                          baseReps: unitChanged
                            ? replacementReps
                            : old.baseReps,
                          progressionType: old.progressionType,
                          ...(!unitChanged && old.repRangeMax !== undefined
                            ? { repRangeMax: old.repRangeMax }
                            : {}),
                          ...(replacementRepUnit !== undefined
                            ? { repUnit: replacementRepUnit }
                            : {}),
                          ...(old.baseSets !== undefined
                            ? { baseSets: old.baseSets }
                            : {}),
                          ...(old.restSeconds !== undefined
                            ? { restSeconds: old.restSeconds }
                            : {}),
                          ...(old.isAccessory !== undefined
                            ? { isAccessory: old.isAccessory }
                            : {}),
                        })
                      : ex
                  ),
                }
              : d
          ),
        }),
        "Couldn't swap that."
      );
      return changeStands(outcome);
    },
    [programState, profile, runProgramCommand]
  );

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
      /**
       * P1d pin 1 — the run half, computed HERE because the template
       * ladders live in RUN_TEMPLATES and `functions/` cannot import it
       * (`raceTemplateIds.js` says so outright). The same division already
       * governs `overrideRunDay`. The server re-checks everything that
       * matters: the day exists, is editable, and is not a race.
       *
       * Sent only on apply — revert restores from the snapshot and needs
       * no payload. Omitted entirely when there is nothing to step down
       * (lift-only users, or a week already at the ladder floors), which
       * is also the shape an older client sends.
       */
      const runSwaps =
        kind === "applyDeloadWeek"
          ? planDeloadWeek(
              programState.runDays ?? [],
              localDateString(new Date())
            ).map((s: DeloadSwap) => ({
              runDayId: String(s.key),
              templateId: s.toTemplateId,
            }))
          : [];
      const command = {
        kind,
        // Reuses the bounded safe-alphabet id generator (UUID with a
        // non-crypto fallback) — both shapes satisfy the callable's
        // COMMAND_ID_RE.
        commandId: generateInstanceId(),
        expectedWeekNumber: programState.weekNumber,
        ...(runSwaps.length > 0 ? { runSwaps } : {}),
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

  /**
   * RUN-EASE-01 — apply the easier week as ONE command, and report how many
   * runs it actually changed.
   *
   * This was N sequential `overrideRunDay` calls from AdjustWeekSheet. Two
   * problems, both fixed by making it one command: a half-eased week was a
   * reachable state, and there was no route back after the 8-second toast,
   * because that reducer overwrites `templateId` as well as `userOverride`
   * — the client's in-memory list was the only surviving record of what
   * each day had been. `applyEaseWeek` snapshots the pre-ease `runDays`
   * server-side instead, so Undo survives a reload, a sign-out, and a
   * second device.
   *
   * The count is DERIVED from the refetched document rather than assumed
   * from the payload, because the server silently skips a day that has
   * become a race, been completed, or been skipped since the client planned
   * against its cached week. Counting the request would overstate exactly
   * when the athlete is least able to check.
   *
   * Returns the number of runs eased, or null if the command failed (the
   * caller has nothing truthful to say in that case).
   */
  const applyEaseWeek = useCallback(
    async (
      swaps: ReadonlyArray<{ key: string | number; toTemplateId: string }>
    ): Promise<number | null> => {
      if (!user || !programState || swaps.length === 0) return null;
      const before = programState.runDays ?? [];
      const command = {
        kind: "applyEaseWeek" as const,
        commandId: generateInstanceId(),
        expectedWeekNumber: programState.weekNumber,
        runSwaps: swaps.map((s) => ({
          runDayId: String(s.key),
          templateId: s.toTemplateId,
        })),
      };
      try {
        await sendProgramCommand(command);
        const next = await refetchProgramState();
        const after = next?.runDays ?? before;
        // A day counts as eased when its template now matches what we asked
        // for AND it did not already. `runDayId` is the id when present and
        // the dayIndex otherwise — the same key `applyDeloadRunSwaps` builds
        // its map from, so the two sides agree on identity.
        const byKey = new Map(
          after.map((rd) => [
            rd.id != null ? String(rd.id) : String(rd.dayIndex),
            rd,
          ])
        );
        const wasByKey = new Map(
          before.map((rd) => [
            rd.id != null ? String(rd.id) : String(rd.dayIndex),
            rd,
          ])
        );
        let landed = 0;
        for (const s of command.runSwaps) {
          const now = byKey.get(s.runDayId);
          const was = wasByKey.get(s.runDayId);
          if (
            now?.templateId === s.templateId &&
            was?.templateId !== s.templateId
          ) {
            landed += 1;
          }
        }
        return landed;
      } catch (err) {
        // Deliberately NOT queued for replay, unlike the deload commands.
        // An easier week is planned against the week the athlete is looking
        // at; replaying it after a rollover would step down a week they
        // never asked about, and the server's week-cursor guard would only
        // catch that once the week number had actually moved.
        logger.error("[useProgram] applyEaseWeek failed", err);
        return null;
      }
    },
    [user, programState, refetchProgramState]
  );

  /** RUN-EASE-01 — restore the pre-ease week from the server snapshot. */
  const revertEaseWeek = useCallback(async (): Promise<{
    ok: boolean;
    message?: string;
  }> => {
    if (!user || !programState) return { ok: false };
    try {
      await sendProgramCommand({
        kind: "revertEaseWeek" as const,
        commandId: generateInstanceId(),
        expectedWeekNumber: programState.weekNumber,
      });
      await refetchProgramState();
      return { ok: true };
    } catch (err) {
      logger.error("[useProgram] revertEaseWeek failed", err);
      /* Hand the server's own sentence back, when it wrote one.
         `failed-precondition` here is not a fault — it is the ordering
         rule declining a step and saying which one to take instead
         ("Undo the deload week first, then the easier week."). Reporting
         that as a generic "couldn't undo" would hide the one piece of
         information that makes the refusal actionable, which is the same
         dishonest-copy failure the rest of this feature exists to remove.
         Every other failure keeps the caller's generic message. */
      const code = (err as { code?: string } | null)?.code;
      const message = (err as { message?: string } | null)?.message;
      if (
        typeof code === "string" &&
        code.endsWith("failed-precondition") &&
        typeof message === "string" &&
        message.trim().length > 0
      ) {
        return { ok: false, message: stripCallablePrefix(message) };
      }
      return { ok: false };
    }
  }, [user, programState, refetchProgramState]);

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
      // P6: through the boundary. Only the user's actual CHOICES cross the
      // wire — the block's id, `goalBefore`, amnesty counter,
      // `weeklyLiftTarget` and `createdAt` are all derived by the reducer
      // from server-read state, so a client cannot grant itself amnesty
      // weeks or claim a `goalBefore` that was never its focus. The
      // represcribe runs server-side too (functions/lib/represcribe.js,
      // pinned by represcribe.cross.test.ts) — sending the represcribed
      // workouts would be the whole-document write the boundary refuses.
      const outcome = await runProgramCommand(
        {
          kind: "startTrainingBlock",
          commandId: generateInstanceId(),
          focus: input.focus,
          pace: input.pace,
          durationWeeks: input.durationWeeks,
          startDate: input.startDate,
          ...(input.anchorExerciseIds?.length
            ? { anchorExerciseIds: input.anchorExerciseIds.slice(0, 3) }
            : {}),
          ...(input.why === undefined ? {} : { why: input.why }),
        },
        // Optimistic: the same transform, from the same shared rule. The
        // block object itself is left to the refetch — its id embeds the
        // server's `now`, and inventing a local one would show a value that
        // is about to be replaced. A block with the focus the week already
        // has changes nothing (Lift4), as in the reducer.
        (state) => ({
          ...state,
          primaryGoal: input.focus,
          workouts:
            input.focus === (state.primaryGoal ?? "general")
              ? state.workouts
              : represcribeWorkouts(
                  state.workouts,
                  input.focus,
                  toExperience(profile?.experience)
                ),
        }),
        "Couldn't start that block."
      );
      return changeStands(outcome);
    },
    [programState, profile, runProgramCommand]
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
    const outcome = await runProgramCommand(
      { kind: "releaseTrainingBlock", commandId: generateInstanceId() },
      // Applying the same transform with `goalBefore` IS the inverse, which
      // is why there is no snapshot to restore. A legacy un-owned block
      // never represcribed anything, so releasing it must not retroactively
      // rewrite a prescription it never owned, and a block that hands back
      // the focus it had changes nothing.
      (state) => {
        const next = {
          ...state,
          primaryGoal: block.goalBefore,
          workouts:
            block.owned &&
            block.goalBefore !== (state.primaryGoal ?? block.focus)
              ? represcribeWorkouts(
                  state.workouts,
                  block.goalBefore,
                  toExperience(profile?.experience)
                )
              : state.workouts,
        };
        delete next.trainingBlock;
        return next;
      },
      "Couldn't end that block."
    );
    return changeStands(outcome);
  }, [programState, profile, runProgramCommand]);

  /**
   * End the block but KEEP its focus as the user's programme focus — the
   * review's "keep this focus, no block" outcome. The prescription stays
   * exactly as the block left it, so there is nothing to re-derive.
   */
  const keepTrainingBlockFocus = useCallback(async (): Promise<boolean> => {
    if (!programState?.trainingBlock) return false;
    const outcome = await runProgramCommand(
      { kind: "endTrainingBlockKeepingFocus", commandId: generateInstanceId() },
      (state) => {
        const next = { ...state };
        delete next.trainingBlock;
        return next;
      },
      "Couldn't end that block."
    );
    return changeStands(outcome);
  }, [programState, runProgramCommand]);

  /**
   * Adopt a pre-Blk2 block that was still open when Blk2 shipped.
   *
   * Idempotent by construction: gated on there being no live block, so a
   * second call after the first write is a no-op. Writes `owned: false`,
   * which is what stops the adopted block ever represcribing anything —
   * on adoption or on release.
   */
  const adoptLegacyTrainingBlock = useCallback(
    async (legacy: TrainingBlock): Promise<boolean> => {
      if (!programState || programState.trainingBlock) return false;
      if (programState.workouts.length === 0) return false;
      try {
        const saved = await saveProgram((base) => {
          if (base.trainingBlock || base.workouts.length === 0) return null;
          return {
            ...base,
            trainingBlock: legacyToActiveBlock(
              legacy,
              base.primaryGoal ?? profile?.primaryGoal ?? "general"
            ),
          };
        });
        return saved !== null;
      } catch {
        return false;
      }
    },
    [programState, profile, saveProgram]
  );

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
   *  Realign banner can be triggered any time the user feels behind.
   *
   *  Returns what happened. When it landed, the timing + totalWeeks, so the
   *  caller can toast the right copy; a refusal is said here, once, and the
   *  caller says nothing. A refusal carries no timing, so no screen can
   *  announce it as a realigned plan. */
  const realignRacePlan = useCallback(async (): Promise<RealignOutcome> => {
    const refuse = (reason: string): RealignOutcome => {
      rejectedToast("Couldn't realign your plan.", reason);
      return { status: "declined", reason };
    };
    if (!programState || !profile) return { status: "failed" };
    if (profile.runMode !== "race_prep" || !profile.raceGoal)
      return refuse("There's no race on your plan.");
    // RUN-H1: realign re-plans race-training weeks; it is meaningless during an
    // active recovery window (the race is done) and would regenerate a race
    // plan that drops the recovery phase. The fell-behind prompt that triggers
    // realign is already suppressed during recovery, but guard explicitly so
    // recovery exit stays a deliberate decision (resolveRecoveryExit).
    const inRecovery = "You're in recovery after your race.";
    if (isInRecoveryOn(programState.runPlan, localDateString())) {
      return refuse(inRecovery);
    }
    // R3: a race that has already passed (recovery ended, raceGoal not yet
    // server-cleared at recoveryEndDate + 7d) must not be realigned —
    // regenerating would produce a phantom plan dated in the past. Leave it for
    // the race's own ending, as refreshRunSchedule and the rollovers do.
    if (localDateString() > profile.raceGoal.targetDate) {
      return refuse("Your race date has passed.");
    }
    // Built against the live document. A realign is a re-anchor to today,
    // and the week position it carries must be the store's: computed from
    // the render it was tapped on, a realign that overlapped the rollover
    // was refused, and repaired only by tapping again.
    const raceGoal = profile.raceGoal;
    let planned: ProgramState["runPlan"];
    let saved: ProgramState | null;
    try {
      saved = await saveProgram((base) => {
        if (isInRecoveryOn(base.runPlan, localDateString())) return null;
        const prevRunPlan = base.runPlan;
        const { runDays, runPlan, manualCompletions } = regenerateRacePlan({
          recentLayoff,
          profile,
          raceGoal,
          weekSchedule: profile.weekSchedule ?? [],
          weeklyRunDays: getWeeklyRunTarget(profile) || 3,
          currentDate: localDateString(),
          weekStart: localWeekKey(),
          carry: {
            currentWeek: prevRunPlan?.currentWeek,
            // Carried WITH currentWeek, as every other regen site does: the
            // phase of a week is currentWeek against totalWeeks, so carrying
            // the position without the block length re-derived the phase from
            // the weeks REMAINING — a realign at week 10 of 18 with 6 weeks
            // left generated a base week while the cockpit showed the carried
            // build phase.
            totalWeeks: prevRunPlan?.totalWeeks,
            completedRaces: prevRunPlan?.completedRaces,
          },
          prior: {
            runDays: base.runDays ?? [],
            manualCompletions: base.manualCompletions,
          },
        });
        planned = runPlan;
        const next = { ...base, runDays, runPlan, manualCompletions };
        delete next.pendingFellBehindPrompt;
        return next;
      });
    } catch {
      // saveProgram has already said what went wrong.
      return { status: "failed" };
    }
    // Not written: the live plan went into recovery since this screen drew.
    if (!saved || !planned) return refuse(inRecovery);
    const timing: RaceTiming = planned.belowFloor
      ? "below-floor"
      : planned.compressed
        ? "compressible"
        : "healthy";
    logger.log(
      `[realign] re-anchored race plan from today — timing=${timing}, ` +
        `totalWeeks=${planned.totalWeeks}, belowFloor=${!!planned.belowFloor}`
    );
    return { status: "applied", timing, totalWeeks: planned.totalWeeks ?? 0 };
  }, [programState, profile, saveProgram, recentLayoff]);

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
    /** Whether the plan can be acted on. `loading` turns false on the
     *  cached copy, which is right to show but can be behind the server, so
     *  a write built on it may be refused. "ready" once the server's copy
     *  has been read and migrated for this account (`mirrorReady`, which
     *  the week rollovers wait on too); "failed" if that read failed. */
    readiness: (mirrorReady
      ? "ready"
      : loadFailed
        ? "failed"
        : "pending") as ProgramReadiness,
    completeWorkoutDay,
    skipWorkoutDay,
    setNextWorkout,
    advanceToNextWeek,
    easeBackIn: easeBackInAfterBreak,
    updateSettings,
    regenerateProgram,
    saveProgram,
    reorderDayExercises,
    removeExerciseFromDay,
    addExercisesToDayCmd,
    replaceExerciseInDay,
    restoreRemovedExercise,
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
    adoptLegacyTrainingBlock,
    releaseTrainingBlock,
    keepTrainingBlockFocus,
    applyDeloadWeek,
    revertDeloadWeek,
    applyEaseWeek,
    revertEaseWeek,
    realignRacePlan,
    /** Run15 packet — exposed so the FellBehindSheet copy can match the
     *  plan realign will actually produce (the SAME uid-paired value every
     *  regen site consumes; never a second read). */
    recentLayoff,
    viewWeek,
    viewingHistoryIndex,
    viewedWorkouts,
    viewedWeekNumber,
  };
}
