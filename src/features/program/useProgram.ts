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
  ManualCompletion,
  ProgramState,
  ProgramSettings,
  ProgramExercise,
  RunPlan,
  ScheduledRunDay,
  ScheduledRunStatus,
} from "./programTypes";
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
import { loadContextFrom } from "./startingLoads";
import { toExperience } from "./experienceModel";
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
   *  activity-feed payload below â€” the variant (and any recovery
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
import type { ScheduleDay } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunEditable,
} from "@/lib/scheduledRunStatus";
import { isScheduledRaceRunDay } from "@/lib/workoutTemplates";
import { canRescheduleRun, computeRunMove } from "@/lib/runReschedule";
import { toast } from "@/lib/toast";
import { getFunctions, httpsCallable } from "firebase/functions";
import { generateInstanceId } from "./programTypes";

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
 * `compressed` always trusts V2's fresh output â€” config changes
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
 * Eight call sites previously repeated the same sequence â€” build
 * generator args â†’ call `generateRacePlanV2` â†’ slice `weeks[0]` for
 * runDays â†’ wrap in `makeRunPlanRecord` â†’ optionally re-attach
 * `completedRaces[]`. Drift across sites was the symptom: PR-L L4's
 * shift/compress writers landed without the `currentWeek` carry
 * that `refreshRunSchedule` already used, and without the
 * `completedRaces` re-attach that multi-race plans need.
 *
 * The helper accepts everything explicitly so callers stay in
 * control of which week / schedule / target they feed in (varies
 * per site â€” load uses today, week-advance uses next-week start,
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
  /** Pgm6 knobs â€” REQUIRED here (unlike the generator's optional
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
     *  (resolveRecoveryExit) â€” callers that intend to exit simply don't pass
     *  them. */
    phase?: "recovery";
    recoveryEndDate?: string;
  };
  /** Run9 phase-3 Slice A â€” when a regen rewrites the CURRENT week with
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
  /** Re-keyed map â€” present only when `prior` was supplied; callers that pass
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
  // to 3 â†’ "Week 5 of 3" surfaces in the race-strip and downstream
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
  /** Confirmed week schedule from the editor's apply path â€”
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
  // read â€” the rule is only consulted on a week advance, so this is the
  // cheapest way to have the answer in hand when that happens. Resolves to
  // "unknown" (â‡’ hold) with no doc, a legacy doc, or too little baseline
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
      // throwOnError so we own failure handling â€” without it, a
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
      // is migrated to freeform INLINE here â€” not via a separate effect â€” so
      // the migration can't race the runDays generation below (the load effect
      // is the one place that generates run days). `effectiveRunMode` makes the
      // rest of this load behave as freeform immediately; the persisted
      // runMode write is fire-and-forget (idempotent: once freeform, the next
      // load skips this). The orphaned structured runDays/runPlan are wiped in
      // the existing-doc branch below.
      const effectiveRunMode =
        profile.runMode === "structured" ? "freeform" : profile.runMode;
      if (profile.runMode === "structured") {
        logger.log("[Run9] migrating legacy structured user â†’ freeform");
        updateProfile({ runMode: "freeform" }).catch((e) =>
          logger.warn("[Run9] structuredâ†’freeform migration write failed", e)
        );
      }

      const ref = doc(db, "users", user.uid, "programState", PROGRAM_DOC);

      // Cache-first paint. Firestore persistence is enabled (firebase.ts),
      // but a plain getDoc is server-first when online â€” it only falls back
      // to IndexedDB when offline. So on every cold open a returning user
      // waits a full network round-trip even though a fresh copy is already
      // cached locally. Read that cached copy first and paint it immediately
      // while the authoritative server read below runs and reconciles.
      //
      // Safe by construction: normalize/migrate are pure (no writes), the
      // whole block is wrapped so a cache miss (first-ever load, eviction,
      // or persistence unavailable) just falls through to the server read
      // exactly as before, and the server path below remains the sole writer
      // and source of truth â€” it overwrites this paint within the same load.
      // `cancelled` guards against a superseded run (e.g. account switch)
      // flashing stale cached state after the effect re-ran.
      try {
        const cachedSnap = await getDocFromCache(ref);
        i×ÎºòÚ$z{-®éÜj×RĞ¢÷fW'&–FW3òçvVVµ66†VGVÆRóò&öf–ÆRçvVVµ66†VGVÆRóòµÓ°¢6öç7B'VåF&vWBĞ¢÷fW'&–FW3òçvVV¶Ç•'VäF—5F&vWBóò†vWEvVV¶Ç•'VåF&vWB‡&öf–ÆR’ÇÂ2“°¢6öç7BvVVµ7F'BÒÆö6ÅvVV´¶W’‚“°¢ÆWB'VäF—3¢66†VGVÆVE'VäF•µÓ°¢ÆWB'VåÆâÒ&öw&Õ7FFRç'VåÆã° ¢òò"Ôc¢6æ6†÷BW"ÖF’W6W$÷fW'&–FW2$Tdõ$R&VvVæW&F–ærà¢òò&RÕ"ÔbÂ&Vg&W6…'Vå66†VGVÆR6ÆÆVBF†RvVæW&F÷"‡v†–6€¢òò'V–ÆG2g&W6‚'VäF—2f–'V–ÆE'VäF•c"v—F‚æòW6W$÷fW'&–FP¢òòf–VÆB’æBw&÷FRF†R&W7VÇBF—&V7FÇ’(	B6–ÆVçFÇ’FW7G&÷––æp¢òòç’W"ÖF’FV×ÆFR÷fW'&–FW2F†RW6W"†B6WBf–F†P¢òò–æÆ–æRÇ6VÆV7Câ–â&öw&ÖÖU'Vå6V7F–öâw2W"ÖF’Æ—7Bà¢òò6æ6†÷BF”–æFW‚(i"W6W$÷fW'&–FRÖ²&W7F÷&RgFW"F†P¢òòvVæW&F÷"'Vç2'WBöæÇ’f÷"F—27F–ÆÂ66†VGVÆVB0¢òò'Vâö&÷F‚†÷'†â÷fW'&–FW2öâF’F†B&V6ÖR&W7BvW@¢òòG&÷VB’à¢6öç7B÷fW'&–FU6æ6†÷C¢&V6÷&CÆçVÖ&W"Â7G&–æsâÒ·Ó°¢f÷"†6öç7B&Böb&öw&Õ7FFRç'VäF—2óòµÒ’°¢–b‡&BçW6W$÷fW'&–FR’°¢÷fW'&–FU6æ6†÷E·&BæF”–æFW…ÒÒ&BçW6W$÷fW'&–FS°¢Ğ¢Ğ ¢òò"ÔS¢&V6÷fW'’†6RF¶W2&V6VFVæ6R÷fW"F†R'VäÖöFP¢òò'&æ6†W2âv†VâF†RW6W"§W7B6ö×ÆWFVB&6RæB—0¢òòÖ–B×&V6÷fW'’‡'VåÆâç†6RÓÓÒ'&V6÷fW'’"²æ÷B–W@¢òòW‡—&VB’ÂVÖ—BÆÂV7•ó3FV×ÆFW2&Vv&FÆW72öbÖöFRà¢òò'VäÖöFR7F—2B&6U÷&WGW&–ær&V6÷fW'“²F†R†6RfÆp¢òòFöW2F†RF–ffW&VçF–F–öââ"ÔBw&—FW2F†R†6Röâ&6P¢òò6ö×ÆWF–öã²F†—2vVæW&F÷"6öç7VÖW2—Böâ7V'6WVVç@¢òò&Vg&W6†W2†RærâÖ–B×vVV²66†VGVÆRVF—G2v†–ÆR&V6÷fW&–ær’à¢6öç7B–å&V6÷fW'’Ò—4–å&V6÷fW'”öâ€¢&öw&Õ7FFRç'VåÆâÀ¢Æö6ÄFFU7G&–ær‚¢“° ¢–b†–å&V6÷fW'’’°¢'VäF—2Ò66†VGVÆU&V6÷fW'•vVVµc"‡²vVVµ66†VGVÆRÂvVVµ7F'BÒ“°¢'VåÆâÒ²ââç&öw&Õ7FFRç'VåÆâÓ°¢ÒVÇ6R–b€¢&öf–ÆRç'VäÖöFRÓÓÒ'&6U÷&W"b`¢&öf–ÆRç&6TvöÂb`¢òò#3¢FöâwB&VvVæW&FR&6R×&WÆâf÷"&6RF†B†2Ç&VG¢òò76VBâ&V6÷fW'’†2VæFVB†W&R†VÇ6R–å&V6÷fW'–—2G'VR’Â'WBF†P¢òò6W'fW"6ÆV'2&öf–ÆRç&6TvöÂöæÇ’B&V6÷fW'”VæDFFR²vC²–âF†@¢òòv–æF÷râVÆ6VB&6R×W7BfÆÂF‡&÷Vv‚Fòg&VVf÷&ÒÂäõB7vâ¢òòg&W6‚ÆâFFVB–âF†R7B‡&VvVæW&FU&6UÆâv—F‚7BF&vW@¢òò&öGV6VB"×vVV²†çFöÒ&Æö6²’âÆö6Â7G&–ær6ö×&RÒFFR6ö×&Rà¢Æö6ÄFFU7G&–ær‚’ÃÒ&öf–ÆRç&6TvöÂçF&vWDFFP¢’°¢òò&Vg&W6‚&W6W'fW27W'&VçEvVV²²F÷FÅvVV·26òF†RW6W"w0¢òò&6R×7G&—÷6—F–öâ7F—2WB7&÷72Ö–B×vVV²66†VGVÆP¢òòVF—G2âöæÇ’6ö×&W76VFWFFW2…c"Ö’fÆ——B–bF†P¢òò66†VGVÆR6†ævRW6†VB'Vâ6÷VçB&VÆ÷r&6RÖ6öæf–p¢òòF‡&W6†öÆG2’â"ÔS¢Ç6ò6ÆV"ç’7FÆR&V6÷fW'’†6P¢òò(	B–bW6W"†2vVB÷WBöb&V6÷fW'’‡&V6÷fW'”VæDFFP¢òò76VB’æBvRw&R&R×&VæFW&–ær&6U÷&WÂG&÷†6P¢òòæB&V6÷fW'”VæDFFRà¢‡²'VäF—2Â'VåÆâÒÒ&VvVæW&FU&6UÆâ‡°¢GVæ–æs¢÷fW'&–FW3òçGVæ–æróò'VåGVæ–ætg&öÕ&öf–ÆR‡&öf–ÆR’À¢&6TvöÃ¢&öf–ÆRç&6TvöÂÀ¢vVVµ66†VGVÆRÀ¢vVV¶Ç•'VäF—3¢'VåF&vWBÀ¢7W'&VçDFFS¢Æö6ÄFFU7G&–ær‚’À¢vVVµ7F'BÀ¢6''“¢°¢7W'&VçEvVV³¢&öw&Õ7FFRç'VåÆãòæ7W'&VçEvVV²À¢F÷FÅvVV·3¢&öw&Õ7FFRç'VåÆãòçF÷FÅvVV·2À¢6ö×ÆWFVE&6W3¢&öw&Õ7FFRç'VåÆãòæ6ö×ÆWFVE&6W2À¢ÒÀ¢Ò’“°¢ÒVÇ6R°¢òò%TâÔÓ¢7G'V7GW&VB&WF—&VB(	Bæöâ×&6R7FFR—2g&VVf÷&Òà¢'VäF—2ÒµÓ°¢'VåÆâÒVæFVf–æVC°¢Ğ ¢òò&RÖÇ’&W6W'fVB÷fW'&–FW2âF†RvVæW&F÷"VÖ—G2VçG&–W0¢òò¶W–VB'’F”–æFWƒ²vR&RÖ¶W’F†R6æ6†÷BF†R6ÖRv’6ğ¢òòW6W"w2$ÖöæF“×FV×ò"–çFVçB7W'f—fW2vVV¶Ç•'VäF—0¢òòVF—G2Â66†VGVÆR&W6‡VffÆW2ÂæBÖöFRfÆ—2‡f–F†R6†— ¢òò&÷rw2†æFÆTÖöFT6†ævRF‚’âFV×ÆFW2F†B&RæòÆöævW ¢òò66†VGVÆVBG&÷6–ÆVçFÇ’‡6æ6†÷BÆöö·WÖ—76W3²÷&–v–æÀ¢òòvVæW&F÷"FV×ÆFRv–ç2’à¢'VäF—2Ò'VäF—2æÖ‚‡&B’Óâ°¢6öç7B&W6W'fVBÒ÷fW'&–FU6æ6†÷E·&BæF”–æFW…Ó°¢&WGW&â&W6W'fV@¢ò²ââç&BÂW6W$÷fW'&–FS¢&W6W'fVBÂFV×ÆFT–C¢&W6W'fVBĞ¢¢&C°¢Ò“° ¢v—B6fU&öw&Ò‡²ââç&öw&Õ7FFRÂ'VäF—2Â'VåÆâÒ“°¢ÒÀ¢·&öw&Õ7FFRÂ&öf–ÆRÂ6fU&öw&ÕĞ¢“° ¢òò"Ô3¢6¶—×&V6÷fW'’ÖV&Ç’w&—FW"âFöÖ–2†6R6ÆV"²ÖöFP¢òòfÆ—²'Vâ×66†VGVÆR&VvVæW&FRâ6ÆÆVBg&öÒF†R÷7B×&6P¢òò6&Bv†VâF†RW6W"÷G2÷WBöbF†R6ögBv–æF÷râ&6R—27BÀ¢òò&6TvöÂ&W6W'fVB…#tDTB’Â'WBF†RW6W"vçG2æ÷&ÖÀ¢òòG&–æ–ær&6²äõr–ç7FVBöbv—F–ærf÷"F†RrÖF’w&6RFğ¢òòVÆ6RæBF†R&V6÷fW'’ÖW†—BVffV7BFòf—&Rà¢òğ¢òòv‡’FVF–6FVBw&—FW"–ç7FVBöb6ö×÷6–ær6¶—&V6÷fW'’°¢òò†æFÆTÖöFT6†ævR²&Vg&W6ƒ¢&Vg&W6…'Vå66†VGVÆR&VG0¢òò&öw&Õ7FFRç'VåÆâç†6Vg&öÒ—G26Æ÷7W&Râ–bvR6ÆV&V@¢òò†6Rf–6fU&öw&ÒæBF†Vâ6ÆÆVB&Vg&W6‚ÂF†R6Æ÷7W&P¢òòv÷VÆBÆræB&Vg&W6‚v÷VÆB7F–ÆÂVÖ—BV7•ó3â'’Fö–ærF†P¢òòv†öÆRG&ç6—F–öâ–âöæR6fU&öw&Ò6ÆÂÂvR6–FW7FWF†P¢òò6Æ÷7W&RÖÆr&ö&ÆVÒà¢6öç7B6¶—&V6÷fW'”V&Ç’ÒW6T6ÆÆ&6²†7–æ2‚’Óâ°¢–b‚&öw&Õ7FFRÇÂ&öf–ÆR’&WGW&ã°¢–b‡&öw&Õ7FFRç'VåÆãòç†6RÓÒ'&V6÷fW'’"’&WGW&ã° ¢òò'Vã’Tär†¢’²#2Ö7–6ÆRö&6·Fö&6³¢W†—F–ær&V6÷fW'’&WGW&ç2F†RW6W"Fğ¢òòe$TTdõ$Ò‡F†R&6R—2FöæR(	B—Bw2&V6÷&FVB–â6ö×ÆWFVE&6W2’ÂTäÄU52¢òòæWvW"&6Rv26WBGW&–ærF†R&V6÷fW'’v–æF÷rÂv†–6‚×W7B&R&W6W'fVBà¢òò&W6öÇfU&V6÷fW'”W†—F—2F†R6–ævÆR6÷W&6RöbF†B'VÆR‡Væ—B×FW7FVB–à¢òò'VäÖöFU&W6öÇWF–öâçFW7BçG2“²F†RF6‚—B&WGW&ç2Çv—26ò×w&—FW2F†P¢òòÖFW&–Æ—¦VB'VäÖöFV6òF†R–çf&–çB6âwB&Rf–öÆFVB†W&Rà¢6öç7B6ö×ÆWFVE&6TvöÂĞ¢&öw&Õ7FFRç'VåÆãòç&6TvöÂóò&öf–ÆRç&6TvöÂóòçVÆÃ°¢6öç7BW†—BÒ&W6öÇfU&V6÷fW'”W†—B‡°¢7W'&VçE&6TvöÃ¢&öf–ÆRç&6TvöÂóòçVÆÂÀ¢6ö×ÆWFVE&6TvöÂÀ¢Ò“° ¢–b†W†—Bç'VäÖöFRÓÓÒ&g&VVf÷&Ò"’°¢òò6–ævÆR&6RFöæR(i"g&VVf÷&Ó¢G&÷F†R'VåÆâ²'VäF—2â6fU&öw&Ğ¢òòFöW2gVÆÂ6WDFö2Â6òöÖ—GF–ær'VåÆæ‡VæFVf–æVB(i"7G&—VB¢òò&VÖ÷fW2—Bg&öÒF†RFö2â'Vã’6Ö–“¢F†R&6TvöÃ¢çVÆÆ6ÆV"F†@¢òò&W6öÇfU&V6÷fW'”W†—B&WGW&ç2—2æ÷rÆ–VBW‡Æ–6—FÇ’‡F†R&öf–ÆRG—P¢òòv2v–FVæVBFòÆÆ÷r—B’Â6òF†RÖFW&–Æ—¦VB'VäÖöFRæBF†RvöÂ6à¢òòæWfW"F—6w&VR(	BæòÖ÷&RÆVgBÖ÷fW"vöÂVæFW"g&VVf÷&ÒâF†R67@¢òò'&–FvW2F†RW&R6÷&Rw2Æö÷6RF—7Fæ6S¢7G&–ævFòF†Ræ'&÷rVæ–öâà¢ÆövvW"æÆör‚%·6¶—&V6÷fW'”V&Ç•Ò&6RFöæR(i"g&VVf÷&Ó²6ÆV&–ærÆâ"“°¢v—B&öÖ—6RæÆÂ…°¢WFFU&öf–ÆR†W†—B2'F–ÃÅW6W%&öf–ÆSâ’À¢6fU&öw&Ò‡²ââç&öw&Õ7FFRÂ'VäF—3¢µÒÂ'VåÆã¢VæFVf–æVBÒ’À¢Ò“°¢&WGW&ã°¢Ğ ¢òò&6²×FòÖ&6³¢æWvW"gWGW&R&6Rv26WBGW&–ær&V6÷fW'’(i"7F¢òò&6U÷&WÂ§W7B6ÆV"F†R&V6÷fW'’†6RâF†R&6R×ÆâÆöB÷&VvVæW&FP¢òòF‚&V'V–ÆG2'VäF—2f÷"F†RæWr&6S²vRFöâwB&VvVæW&FR†W&Rà¢ÆövvW"æÆör€¢%·6¶—&V6÷fW'”V&Ç•ÒæWvW"&6R6WBGW&–ær&V6÷fW'’(i"W†—B&V6÷fW'’Â¶VW&6U÷&W ¢“°¢6öç7BæW‡E'VåÆâÒ²ââç&öw&Õ7FFRç'VåÆâÒ2&V6÷&CÇ7G&–ærÂVæ¶æ÷vãã°¢FVÆWFRæW‡E'VåÆâç†6S°¢FVÆWFRæW‡E'VåÆâç&V6÷fW'”VæDFFS°¢v—B&öÖ—6RæÆÂ…°¢WFFU&öf–ÆR‡²'VäÖöFS¢'&6U÷&W"Ò’À¢6fU&öw&Ò‡°¢ââç&öw&Õ7FFRÀ¢'VåÆã¢æW‡E'VåÆâ2Væ¶æ÷vâ2'VåÆâÀ¢Ò’À¢Ò“°¢ÒÂ·&öw&Õ7FFRÂ&öf–ÆRÂ6fU&öw&ÒÂWFFU&öf–ÆUÒ“° ¢òò)H)H'Vã’†6RÓ2…6Æ–6RDR“¢öæR×F&VÆ–vâ)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H)H ¢òğ¢òòF†R&RÕ'Vã’fVÆÂÖ&V†–æB6†VWBöffW&VBF‡&VR7F–öç2‡6†–gB³vBğ¢òò6ö×&W72ò6¶—’âF†R&VFW6–vâ6öÆÆ6W2F†RGvòÆâÖ6†æv–ær7F–öç0¢òò–çFòôäR&–Ö'’%&VÆ–vâ"†¶VWF†R&6RFFRÂ&R×ÆâF†R&VÖ–æ–æp¢òòvVV·2g&öÒFöF’’ÇW2&×’&6RÖ÷fVB(i""&÷WFRFò÷6WGF–æw2÷G&–æ–æp¢òò†T’æf–vFRÂæ÷Bw&—FW"(	BF†R³vBWFò×6†–gBwVW72—2&WF—&VB’âF†P¢òò6¶—F‚7F—22F—6Ö—74fVÆÄ&V†–æE&ö×F&÷fRà ¢ò¢¢#B†’’(	BF—6Ö—72F†R&ö×Bv—F†÷WB6†æv–ærF†RÆââ¢ğ¢6öç7BF—6Ö—74fVÆÄ&V†–æE&ö×BÒW6T6ÆÆ&6²†7–æ2‚’Óâ°¢–b‚&öw&Õ7FFR’&WGW&ã°¢–b‚&öw&Õ7FFRçVæF–ætfVÆÄ&V†–æE&ö×B’&WGW&ã°¢6öç7BæW‡BÒ²ââç&öw&Õ7FFRÓ°¢FVÆWFRæW‡BçVæF–ætfVÆÄ&V†–æE&ö×C°¢ÆövvW"æÆör‚%¶fVÆÄ&V†–æEÒF—6Ö—76VBv—F†÷WBÆâ6†ævR"“°¢v—B6fU&öw&Ò†æW‡B“°¢ÒÂ·&öw&Õ7FFRÂ6fU&öw&ÕÒ“° ¢ò¢¢$ôu$ÒÔDTÄôBÓ(	BÇ’÷&WfW'BF†RFVÆöBvVV²f–F†R6W'fW ¢¢Ç•&öw&Ô6öÖÖæFG&ç67F–öâ‡F†R6¶WBÓ‚6öÖÖæB&÷VæF'“°¢¢F†W6R&R—G2f—'7B6Æ–VçB6öç7VÖW'2’âF†R6W'fW"÷vç2F†P¢¢×WFF–öâ(	BF†RFVÆöBG&ç6f÷&ÒÂF†Ræ÷BÖÇ&VG’ÖFVÆöFVBğ¢¢6æ6†÷B×&W6VçB&V6öæF—F–öç2ÂæBF†R&V6V—BÖ&6VB–FV×÷FVæ7¢¢ÆÂ'Vâ–âöæRG&ç67F–öâ(	B6òöâ7V66W72vR$TdUD4‚F†P¢¢WF†÷&—FF—fRFö2&F†W"F†â&RÖFW&—f–ærÆö6ÆÇ’‡F†P¢¢FW7FVBÖ6÷’×g2×'Vææ–ærÖ6÷’'VÆR’â&WV—&W2æWGv÷&³¢VæÆ–¶RF†P¢¢öffÆ–æR×VWVVB6WDFö4wV&FVBw&—FW'2Â6ÆÆ&ÆR6âwB&WÆ’À¢¢æBvVV²ÖÆöB×WFF–öâ—2æ÷B6öÖWF†–ærFòÇ’&Æ–æBâ¢ğ¢6öç7B6VæDFVÆöD6öÖÖæBÒW6T6ÆÆ&6²€¢7–æ2†¶–æC¢&Ç”FVÆöEvVV²"Â'&WfW'DFVÆöEvVV²"“¢&öÖ—6SÆ&ööÆVãâÓâ°¢–b‚W6W"ÇÂ&öw&Õ7FFR’&WGW&âfÇ6S°¢G'’°¢6öç7B6ÆÂÒ‡GG46ÆÆ&ÆR†vWDgVæ7F–öç2‚’Â&Ç•&öw&Ô6öÖÖæB"“°¢v—B6ÆÂ‡°¢¶–æBÀ¢òò&WW6W2F†R&÷VæFVB6fRÖÇ†&WB–BvVæW&F÷"…UT”Bv—F‚¢òòæöâÖ7'—FòfÆÆ&6²’(	B&÷F‚6†W26F—6g’F†R6ÆÆ&ÆRw0¢òò4ôÔÔäEô”Eõ$Rà¢6öÖÖæD–C¢vVæW&FT–ç7Fæ6T–B‚’À¢W‡V7FVEvVV´çVÖ&W#¢&öw&Õ7FFRçvVV´çVÖ&W"À¢Ò“°¢6öç7B&VbÒFö2†F"Â'W6W'2"ÂW6W"çV–BÂ'&öw&Õ7FFR"Â$ôu$ÕôDô2“°¢6öç7B6æÒv—BvWDFö2‡&Vb“°¢–b‡6ææW†—7G2‚’’°¢6öç7Bæ÷&ÖÆ—¦VBÒæ÷&ÖÆ—¦U&öw&Õ7FFR€¢6ææFF‚’2&öw&Õ7FFRÀ¢²&–Ö'”vöÃ¢&öf–ÆSòç&–Ö'”vöÂĞ¢“°¢6WE&öw&Õ7FFR†Ö–w&FU&öw&Õ7FFR†æ÷&ÖÆ—¦VBÂÆö6ÅvVV´¶W’‚’’“°¢Ğ¢&WGW&âG'VS°¢Ò6F6‚†W'"’°¢ÆövvW"æW'&÷"†·W6U&öw&ÕÒG¶¶–æGÒf–ÆVFÂW'"“°¢&WGW&âfÇ6S°¢Ğ¢ÒÀ¢·W6W"Â&öf–ÆRÂ&öw&Õ7FFUĞ¢“° ¢6öç7BÇ”FVÆöEvVV²ÒW6T6ÆÆ&6²€¢‚’Óâ6VæDFVÆöD6öÖÖæB‚&Ç”FVÆöEvVV²"’À¢·6VæDFVÆöD6öÖÖæEĞ¢“° ¢6öç7B&WfW'DFVÆöEvVV²ÒW6T6ÆÆ&6²€¢‚’Óâ6VæDFVÆöD6öÖÖæB‚'&WfW'DFVÆöEvVV²"’À¢·6VæDFVÆöD6öÖÖæEĞ¢“° ¢ò¢¢'Vã’†6RÓ2…6Æ–6RDR’(	B&RÖæ6†÷"F†R&6RÆâFòFöF’Â¶VW–ærF†P¢¢&6RFFRâ&VvVæW&FW2g&öÒFöF’6òF†RvVV·2×Fò×&6RFVÇF‡6‡&–æ¶–æp¢¢2F–ÖR76W2’G&—fW2F†RvVæW&F÷#¢F–v‡Bv––VÆG26ö×&W76VFÀ¢¢&VÆ÷rF†RFW"×6fRfÆö÷"—B––VÆG2F†Rf–æ—6‚×6fVÇ’6†R†&VÆ÷tfÆö÷"’à¢¢6'&–W2FW&Ö–æÂ7FGW2²&RÖ¶W—2ÖçVÄ6ö×ÆWF–öç2…6Æ–6R’6òF†P¢¢7W'&VçBvVV²w26ö×ÆWF–öç27W'f—fRF†R&VvVââ6ÆV'2F†R6W'fW"×w&—GFVà¢¢fVÆÂÖ&V†–æBfÆr–b&W6VçB(	B'WBv÷&·2t•D„õUB—BFöòÂ6–æ6RF†R–â×F ¢¢&VÆ–vâ&ææW"6â&RG&–vvW&VBç’F–ÖRF†RW6W"fVVÇ2&V†–æBâ&WGW&ç0¢¢F†RF–Ö–ær²F÷FÅvVV·26òF†R6ÆÆW"6âFö7BF†R&–v‡B6÷’â¢ğ¢6öç7B&VÆ–vå&6UÆâÒW6T6ÆÆ&6²†7–æ2‚“¢&öÖ—6SÇ°¢F–Ö–æs¢&6UF–Ö–æs°¢F÷FÅvVV·3¢çVÖ&W#°¢ÓâÓâ°¢–b‚&öw&Õ7FFRÇÂ&öf–ÆR’&WGW&â²F–Ö–æs¢&†VÇF‡’"ÂF÷FÅvVV·3¢Ó°¢–b‡&öf–ÆRç'VäÖöFRÓÒ'&6U÷&W"ÇÂ&öf–ÆRç&6TvöÂ¢&WGW&â²F–Ö–æs¢&†VÇF‡’"ÂF÷FÅvVV·3¢Ó°¢òò%TâÔƒ¢&VÆ–vâ&R×Æç2&6R×G&–æ–ærvVV·3²—B—2ÖVæ–ævÆW72GW&–ærà¢òò7F—fR&V6÷fW'’v–æF÷r‡F†R&6R—2FöæR’æBv÷VÆB&VvVæW&FR&6P¢òòÆâF†BG&÷2F†R&V6÷fW'’†6RâF†RfVÆÂÖ&V†–æB&ö×BF†BG&–vvW'0¢òò&VÆ–vâ—2Ç&VG’7W&W76VBGW&–ær&V6÷fW'’Â'WBwV&BW‡Æ–6—FÇ’6ğ¢òò&V6÷fW'’W†—B7F—2FVÆ–&W&FRFV6—6–öâ‡&W6öÇfU&V6÷fW'”W†—B’à¢–b†—4–å&V6÷fW'”öâ‡&öw&Õ7FFRç'VåÆâÂÆö6ÄFFU7G&–ær‚’’’°¢&WGW&â²F–Ö–æs¢&†VÇF‡’"ÂF÷FÅvVV·3¢Ó°¢Ğ¢òò#3¢&6RF†B†2Ç&VG’76VB‡&V6÷fW'’VæFVBÂ&6TvöÂæ÷B–W@¢òò6W'fW"Ö6ÆV&VBB&V6÷fW'”VæDFFR²vB’×W7Bæ÷B&R&VÆ–væVB(	@¢òò&VvVæW&F–ærv÷VÆB&öGV6R†çFöÒÆâFFVB–âF†R7BâÆVfR—Bf÷ ¢òòF†Rg&VVf÷&ÒG&ç6—F–öâÂ6ÖR2&Vg&W6…'Vå66†VGVÆRòF†R&öÆÆ÷fW'2à¢–b†Æö6ÄFFU7G&–ær‚’â&öf–ÆRç&6TvöÂçF&vWDFFR’°¢&WGW&â²F–Ö–æs¢&†VÇF‡’"ÂF÷FÅvVV·3¢Ó°¢Ğ¢6öç7B&We'VåÆâÒ&öw&Õ7FFRç'VåÆã°¢6öç7B²'VäF—2Â'VåÆâÂÖçVÄ6ö×ÆWF–öç2ÒÒ&VvVæW&FU&6UÆâ‡°¢GVæ–æs¢'VåGVæ–ætg&öÕ&öf–ÆR‡&öf–ÆR’À¢&6TvöÃ¢&öf–ÆRç&6TvöÂÀ¢vVVµ66†VGVÆS¢&öf–ÆRçvVVµ66†VGVÆRóòµÒÀ¢vVV¶Ç•'VäF—3¢vWEvVV¶Ç•'VåF&vWB‡&öf–ÆR’ÇÂ2À¢7W'&VçDFFS¢Æö6ÄFFU7G&–ær‚’À¢vVVµ7F'C¢Æö6ÅvVV´¶W’‚’À¢6''“¢°¢7W'&VçEvVV³¢&We'VåÆãòæ7W'&VçEvVV²À¢6ö×ÆWFVE&6W3¢&We'VåÆãòæ6ö×ÆWFVE&6W2À¢ÒÀ¢&–÷#¢°¢'VäF—3¢&öw&Õ7FFRç'VäF—2óòµÒÀ¢ÖçVÄ6ö×ÆWF–öç3¢&öw&Õ7FFRæÖçVÄ6ö×ÆWF–öç2À¢ÒÀ¢Ò“°¢6öç7BæW‡BÒ²ââç&öw&Õ7FFRÂ'VäF—2Â'VåÆâÂÖçVÄ6ö×ÆWF–öç2Ó°¢FVÆWFRæW‡BçVæF–ætfVÆÄ&V†–æE&ö×C°¢6öç7BF–Ö–æs¢&6UF–Ö–ærÒ'VåÆâæ&VÆ÷tfÆö÷ ¢ò&&VÆ÷rÖfÆö÷" ¢¢'VåÆâæ6ö×&W76V@¢ò&6ö×&W76–&ÆR ¢¢&†VÇF‡’#°¢ÆövvW"æÆör€¢·&VÆ–våÒ&RÖæ6†÷&VB&6RÆâg&öÒFöF’(	BF–Ö–æsÒG·F–Ö–æwÒÂ°¢F÷FÅvVV·3ÒG·'VåÆâçF÷FÅvVV·7ÒÂ&VÆ÷tfÆö÷#ÒG²'VåÆâæ&VÆ÷tfÆö÷'Ö ¢“°¢v—B6fU&öw&Ò†æW‡B“°¢&WGW&â²F–Ö–ærÂF÷FÅvVV·3¢'VåÆâçF÷FÅvVV·2óòÓ°¢ÒÂ·&öw&Õ7FFRÂ&öf–ÆRÂ6fU&öw&ÕÒ“° ¢òòvVV²æf–vF–öà¢6öç7Bf–WuvVV²ÒW6T6ÆÆ&6²‚††—7F÷'”–æFWƒ¢çVÖ&W"ÂçVÆÂ’Óâ°¢6WEf–Wv–æt†—7F÷'”–æFW‚††—7F÷'”–æFW‚“°¢ÒÂµÒ“° ¢6öç7Bf–WvVEv÷&¶÷WG2Ğ¢f–Wv–æt†—7F÷'”–æFW‚ÓÒçVÆÀ¢ò‡&öw&Õ7FFSòçvVV´†—7F÷'“òå·f–Wv–æt†—7F÷'”–æFW…Óòçv÷&¶÷WG2óòçVÆÂ¢¢çVÆÃ° ¢6öç7Bf–WvVEvVV´çVÖ&W"Ğ¢f–Wv–æt†—7F÷'”–æFW‚ÓÒçVÆÀ¢ò‡&öw&Õ7FFSòçvVV´†—7F÷'“òå·f–Wv–æt†—7F÷'”–æFW…ÓòçvVV´çVÖ&W"óòçVÆÂ¢¢çVÆÃ° ¢6öç7B&W67&—F–öâÒ&öw&Õ7FFP¢òvVæW&FUvVVµ&W67&—F–öâ‡&öw&Õ7FFRçvVV´çVÖ&W"¢¢çVÆÃ° ¢&WGW&â°¢&öw&Õ7FFRÀ¢&W67&—F–öâÀ¢ÆöF–ærÀ¢6ö×ÆWFUv÷&¶÷WDF’À¢6¶—v÷&¶÷WDF’À¢6WDæW‡Ev÷&¶÷WBÀ¢Gfæ6UFôæW‡EvVV²À¢ÆötW†W&6—6RÀ¢WFFTW†W&6—6RÀ¢WFFU6WGF–æw2À¢&VvVæW&FU&öw&ÒÀ¢6fU&öw&ÒÀ¢Ö&´ÖçVÄ6ö×ÆWFRÀ¢VæÖ&´ÖçVÄ6ö×ÆWFRÀ¢6¶—'VäF’À¢&W7F÷&U'VäF’À¢&W7F÷&Uv÷&¶÷WDF’À¢Ö÷fU'VäF’À¢÷fW'&–FU'VäF’À¢&Vg&W6…'Vå66†VGVÆRÀ¢6¶—&V6÷fW'”V&Ç’À¢F—6Ö—74fVÆÄ&V†–æE&ö×BÀ¢Ç”FVÆöEvVV²À¢&WfW'DFVÆöEvVV²À¢&VÆ–vå&6UÆâÀ¢f–WuvVV²À¢f–Wv–æt†—7F÷'”–æFW‚À¢f–WvVEv÷&¶÷WG2À¢f–WvVEvVV´çVÖ&W"À¢Ó°§Ğ