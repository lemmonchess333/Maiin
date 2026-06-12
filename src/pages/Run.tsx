import {
  useState,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useCallback,
  useReducer,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useGPS, type GPSSignalQuality } from "../hooks/useGPS";
import { useRunTimer } from "../hooks/useRunTimer";
import { useWakeLock } from "../hooks/useWakeLock";
import { useRunVisibility } from "../hooks/useRunVisibility";
import {
  calculatePace,
  calculateSplits,
  haversine,
  paceAsNumber,
  totalElevationGain,
} from "../lib/gps";
import { getDistanceTargetMeters } from "../lib/runConfigUnits";
import { paceTableFromFitness } from "../lib/runPaces";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "../lib/scheduledRunStatus";
import RunMap from "../components/run/RunMapLazy";
import RunSetupModal, {
  type RunConfig,
  type ProgramContextStrip,
} from "../components/run/RunSetupModal";
import RunSetupSkeleton from "../components/run/RunSetupSkeleton";
import RunResumePrompt from "../components/run/RunResumePrompt";
import {
  readStoredRun,
  writeStoredRun,
  clearStoredRun,
  type StoredRun,
} from "../lib/runResumeStorage";
import { useAudioCues } from "../hooks/useAudioCues";
import { useIntervalWorkout } from "../hooks/useIntervalWorkout";
import IntervalDisplay from "../components/run/IntervalDisplay";
import TreadmillMode from "../components/run/TreadmillMode";
import PaceZoneBar from "../components/run/PaceZoneBar";
import RunBottomSheet from "../components/run/RunBottomSheet";
import BackToStartChip from "../components/run/BackToStartChip";
import GuidedRunOverlay from "../components/run/GuidedRunOverlay";
import { useGuidedRun } from "../hooks/useGuidedRun";
import { THEME } from "../lib/theme";
import { RUN_TEMPLATES } from "../lib/workoutTemplates";
import {
  isOutdoorGpsRun,
  requiresManualDistance,
  getInvalidRunReason,
} from "../lib/runGuards";
import { computeRouteQuality } from "../lib/routeQuality";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useProgram } from "../features/program/useProgram";
import {
  computePlanMetadata,
  finalisePlanMetadata,
  freeformPlanMetadata,
  type PlanMode,
  type RunPlanMetadata,
} from "../lib/runPlanMetadata";
import { logger } from "../lib/logger";
import {
  runSessionReducer,
  initialRunPhase,
} from "../features/run/runSessionReducer";
import { haptic } from "../lib/haptic";
import { formatRaceDistance } from "../lib/runLabels";
import { toast } from "../lib/toast";

/* haptic moved to the shared `../lib/haptic` implementation in
   W1f, which routes through the Capacitor Haptics plugin on the
   native iOS/Android shell. The old `navigator.vibrate`-only
   inline was a no-op on iOS Safari (the Vibrate API has never
   shipped on iOS), so the iOS path now fires correctly. */

/* Live HUD chip for GPS state during an active run.
 *
 * Phase B2: consumes `signalQuality` from useGPS directly rather
 * than re-deriving thresholds locally. Pre-B2 this component
 * duplicated the bucket logic (<10/<20/<30 vs the hook's 8/15/30)
 * which meant the chip could disagree with the rest of the system
 * about whether the signal was 'good' vs 'fair'. Single source of
 * truth lives in useGPS.getSignalQuality. */
function GPSIndicator({
  accuracy,
  isTracking,
  pointCount,
  signalQuality,
}: {
  accuracy: number | null;
  isTracking: boolean;
  pointCount: number;
  signalQuality: GPSSignalQuality;
}) {
  if (!isTracking) return null;
  if (pointCount === 0 || signalQuality === "searching") {
    return (
      <div className="flex items-center gap-2">
        <div className="size-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-xs text-yellow-400/80">Acquiring GPS...</span>
      </div>
    );
  }
  const color =
    signalQuality === "strong" || signalQuality === "good"
      ? "bg-green-400"
      : signalQuality === "fair"
        ? "bg-yellow-400"
        : "bg-red-400";
  const text =
    signalQuality === "weak"
      ? "text-red-400/80"
      : signalQuality === "fair"
        ? "text-yellow-400/80"
        : "text-green-400/80";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-end gap-0.5 h-3">
        <div className={`size-1 rounded-sm ${color}`} />
        <div
          className={`size-1.5 rounded-sm ${signalQuality !== "weak" ? color : "bg-white/20"}`}
        />
        <div
          className={`w-1 h-2 rounded-sm ${signalQuality === "strong" || signalQuality === "good" ? color : "bg-white/20"}`}
        />
        <div
          className={`w-1 h-3 rounded-sm ${signalQuality === "strong" ? color : "bg-white/20"}`}
        />
      </div>
      <span className={`text-xs ${text}`}>
        {accuracy ? `\u00B1${Math.round(accuracy)}m` : ""}
      </span>
    </div>
  );
}

/**
 * Map the metadata returned by computePlanMetadata into the
 * ProgramContextStrip shape consumed by RunSetupModal. Kept local
 * to Run.tsx because the strip-data fields are presentation-level
 * (week label, distance label, today template name) — the metadata
 * module stays purely about adherence accounting.
 *
 * Returns null when no strip should render (freeform users with
 * no plan context, missing-template fallback, or an elapsed plan
 * that the metadata module already folded into freeform metadata).
 */
function deriveStrip(
  metadata: RunPlanMetadata,
  runPlan:
    | {
        mode: "structured" | "race_prep";
        raceGoal?: { distance: string; targetDate: string };
        totalWeeks?: number;
        currentWeek?: number;
      }
    | undefined
): ProgramContextStrip | null {
  // Freeform / fallback cases get no strip.
  if (metadata.planMode === "freeform") return null;
  // Race-prep elapsed: metadata module already returned the freeform
  // shape, but planMode === 'race_prep' is preserved. The trigger
  // for the elapsed-state strip: we still have an elapsed runPlan
  // even though planSource is 'manual'.
  if (
    metadata.planMode === "race_prep" &&
    metadata.planSource === "manual" &&
    runPlan?.mode === "race_prep"
  ) {
    const elapsed =
      (typeof runPlan.currentWeek === "number" &&
        typeof runPlan.totalWeeks === "number" &&
        runPlan.currentWeek >= runPlan.totalWeeks) ||
      (runPlan.raceGoal?.targetDate &&
        new Date(runPlan.raceGoal.targetDate).getTime() < Date.now());
    if (elapsed) {
      return { kind: "race_prep_elapsed" };
    }
  }
  if (metadata.planSource === "rest_day") return { kind: "rest_day" };
  if (metadata.planSource === "completed_day") return { kind: "completed_day" };
  if (
    metadata.planSource === "today_plan" ||
    metadata.planSource === "url_template"
  ) {
    // For URL-template overrides on a freeform user, no strip
    // (no plan context to surface). For URL-template on a
    // structured/race_prep user with a planned day, fall through
    // to the planned-day strip — the user is overriding their plan
    // and we still surface the plan context.
    if (metadata.planMode === "race_prep") {
      // Need a planned day or runPlan to render this state.
      if (
        metadata.plannedRunDayIndex === null &&
        metadata.planSource === "url_template"
      ) {
        return null; // no plan today and URL is the only context
      }
      return {
        kind: "race_prep_today",
        weekLabel:
          typeof metadata.planWeekIndex === "number" &&
          typeof metadata.planTotalWeeks === "number"
            ? `Week ${metadata.planWeekIndex + 1} of ${metadata.planTotalWeeks}`
            : "",
        distanceLabel: formatRaceDistance(runPlan?.raceGoal?.distance),
        targetDate: runPlan?.raceGoal?.targetDate,
      };
    }
    if (metadata.planMode === "structured") {
      if (
        metadata.plannedRunDayIndex === null &&
        metadata.planSource === "url_template"
      ) {
        return null;
      }
      const todayTemplate = RUN_TEMPLATES.find(
        (t) => t.id === metadata.plannedTemplateId
      );
      return {
        kind: "structured_today",
        todayLabel: todayTemplate?.name,
      };
    }
  }
  return null;
}

export default function Run() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const timer = useRunTimer();
  const gps = useGPS(timer.elapsed);
  const wakeLock = useWakeLock();
  const { profile } = useAuth();
  // Phase B1: programme state drives the Run-setup prefill + context
  // strip + post-save plan reconciliation. The hook is cheap (single
  // getDoc, Firestore caches the warm reads) and runs unconditionally
  // — freeform users still load it to keep the hook order stable.
  // The loading flag is only honoured for non-freeform users; freeform
  // skips the skeleton path entirely.
  // `completeRunDay` is invoked from RunSummary post-save, not here —
  // RunSummary re-calls useProgram to access it. We only read
  // programState + loading here to drive the prefill memo.
  const { programState, loading: programLoading } = useProgram();
  const profileRunMode = (profile?.runMode ?? "freeform") as PlanMode;
  const isFreeformUser = profileRunMode === "freeform";
  const [phase, dispatch] = useReducer(runSessionReducer, initialRunPhase);
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [autoPaused, setAutoPaused] = useState(false);
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [treadmillDistance, setTreadmillDistance] = useState(0);
  const [acquiringSeconds, setAcquiringSeconds] = useState(0);
  const autoPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bgGapBanner, setBgGapBanner] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // PR H (audit P1 #9): accumulator for total time spent backgrounded
  // during the run. Summed in handleVisible from every
  // visibility-hidden window; written to the run doc via RunSummary
  // so routeQuality can compute "patchy" / "poor" labels.
  const backgroundGapMsRef = useRef(0);

  // Phase B3: interrupted-run resume.
  //
  // `resumePrompt` holds the snapshot read from localStorage on mount
  // when one exists and passes the 6h cutoff + schema guards. While
  // non-null the chooser overlays the setup modal; the three branches
  // (Resume / Start new / Discard) flip it back to null and either
  // rehydrate the run or proceed to the normal setup flow.
  const [resumePrompt, setResumePrompt] = useState<StoredRun | null>(null);
  // `startedAtRef` mirrors the timer's original-start epoch for the
  // active run so the periodic write effect can persist it without
  // racing with React state. Set on handleStart and on Resume.
  const startedAtRef = useRef<number | null>(null);
  // Suppresses the GPS-loss banner for a short window after a Resume
  // (the cold-start GPS chip won't have a fresh fix yet, and the
  // banner would flash false-positive at "10s ago" or so). Set to
  // `Date.now() + 5000` on Resume; the gap banner gate below skips
  // rendering while now < this value.
  const gapBannerSuppressUntilRef = useRef<number>(0);

  // Coordinate all subsystems on background/foreground transitions
  const handleHidden = useCallback(() => {
    if (isOutdoorGpsRun(runConfig?.activityType)) {
      gps.stop(); // Stop GPS to save battery while backgrounded
    }
  }, [gps, runConfig?.activityType]);

  const handleVisible = useCallback(
    (event: import("../hooks/useRunVisibility").VisibilityEvent) => {
      // Immediately recalculate timer (Date.now() is accurate, but the setInterval was throttled)
      timer.recalcNow();

      // Re-request wake lock (it drops when backgrounded)
      wakeLock.request();

      // Restart GPS tracking if we were actively tracking
      if (isOutdoorGpsRun(runConfig?.activityType) && phase === "active") {
        gps.start();
      }

      // PR H: accumulate ALL hidden time into the backgroundGapMs
      // counter (event.hiddenDuration is in seconds). The 5s threshold
      // below is only for the user-facing banner; we record every
      // millisecond so short, frequent gaps still surface in the route-
      // quality score.
      backgroundGapMsRef.current += Math.max(0, event.hiddenDuration) * 1000;

      // Show a brief banner if the gap was significant (> 5 seconds)
      if (event.hiddenDuration > 5) {
        const mins = Math.floor(event.hiddenDuration / 60);
        const secs = Math.floor(event.hiddenDuration % 60);
        const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setBgGapBanner(
          `App was in background for ${duration} — GPS data may have gaps`
        );
        setTimeout(() => setBgGapBanner(null), 6000);
      }
    },
    [timer, gps, wakeLock, runConfig?.activityType, phase]
  );

  useRunVisibility({
    onHidden: handleHidden,
    onVisible: handleVisible,
    enabled: phase === "active",
  });

  const guidedRun = useGuidedRun(
    runConfig?.activityType === "guided"
      ? (runConfig.guidedWorkout ?? null)
      : null,
    phase === "active"
  );

  const audioCues = useAudioCues(
    runConfig?.audioCues ?? true,
    runConfig?.audioCueFrequency ?? "every_km",
    {
      paceAlerts: runConfig?.paceAlerts ?? true,
      voiceRate: runConfig?.voiceRate ?? 0.9,
    }
  );
  const intervals = useIntervalWorkout(
    runConfig?.activityType === "intervals" ? runConfig.intervals : undefined
  );
  const intervalPhaseRef = useRef("idle");

  // ─── Phase B1: programme prefill + context strip ─────────────────
  //
  // Compute the prefill decision once per (programState, URL) tuple.
  // The memo returns metadata + a prefill payload + the strip data —
  // any change to either input recomputes (rare). The result feeds
  // savedPreferences (so RunSetupModal's init-from-props captures
  // the right starting state) AND programContext (the strip).
  //
  // Note: we explicitly DON'T watch `searchParams` for changes
  // post-mount — the URL is read once when Run.tsx mounts, matching
  // pre-B1 behaviour (useSearchParams is stable across renders for
  // the lifetime of the route).
  const urlTemplateId = searchParams.get("template");
  const urlType = searchParams.get("type");
  // P0-6: explicit scheduled-run pin from RunCTACard / Week tab /
  // missed-day flow. Resolved by computePlanMetadata into the
  // planned context regardless of today's date.
  const urlScheduledRunId = searchParams.get("scheduledRunId");
  const planDecision = useMemo(() => {
    // Freeform users skip the programme branches entirely — the
    // memo still runs (hook order) but returns trivially. This keeps
    // freeform users decoupled from useProgram's loading state.
    if (isFreeformUser && !urlTemplateId && !urlType && !urlScheduledRunId) {
      return {
        metadata: freeformPlanMetadata("freeform"),
        prefill: {} as Partial<RunConfig>,
        strip: null as ProgramContextStrip | null,
      };
    }
    const result = computePlanMetadata({
      profileRunMode,
      todayDayIndex: new Date().getDay(),
      runPlan: programState?.runPlan,
      runDays: programState?.runDays,
      urlTemplateId,
      urlType,
      urlScheduledRunId,
      // Adaptive Paces: personalize the prescribed pace from the user's
      // fitness benchmark. null (no benchmark) → template defaults.
      paceTable: paceTableFromFitness(profile?.runFitness ?? null),
    });
    // Missing URL template — surface the developer signal here,
    // not in the pure helper. The helper falls back to freeform
    // metadata silently; we log so a deploy with a bad URL becomes
    // visible in the console without spamming users with toasts.
    if (urlTemplateId && !RUN_TEMPLATES.some((t) => t.id === urlTemplateId)) {
      logger.warn(
        `[Run] URL ?template=${urlTemplateId} not in RUN_TEMPLATES; no prefill applied`
      );
    }
    // Missing programme templateId (today's plan has an unknown ID).
    // Same signal — fall back happened in the helper; we log.
    // PR-0b-iii: status-aware "today's pickable run" lookup.
    // Pre-PR-0b-iii `!d.completed` surfaced skipped runs as
    // startable. Helper restricts to `planned` only.
    const todayDay = programState?.runDays?.find(
      (d) =>
        d.dayIndex === new Date().getDay() &&
        isScheduledRunStartable(getScheduledRunStatus(d))
    );
    if (
      todayDay &&
      !RUN_TEMPLATES.some(
        (t) => t.id === (todayDay.userOverride ?? todayDay.templateId)
      )
    ) {
      logger.warn(
        `[Run] Programme runDay templateId "${todayDay.userOverride ?? todayDay.templateId}" not in RUN_TEMPLATES; no prefill applied`
      );
    }
    return {
      metadata: result.metadata,
      prefill: result.prefill as Partial<RunConfig>,
      strip: deriveStrip(result.metadata, programState?.runPlan),
    };
  }, [
    isFreeformUser,
    profileRunMode,
    programState?.runPlan,
    programState?.runDays,
    urlTemplateId,
    urlType,
    urlScheduledRunId,
    profile?.runFitness,
  ]);

  // Phase B3: restore-on-mount. Reads the persisted snapshot exactly
  // once on first render and (if anything survives the cutoff +
  // schema guards) renders the chooser. Pure read — no rehydration
  // happens until the user picks "Resume" in the chooser.
  //
  // Guarded by `phase === 'waiting'` so a re-mount mid-run (which
  // shouldn't happen with the fixed inset-0 layout but stays
  // defensive) doesn't blow away in-flight state.
  useEffect(() => {
    if (phase !== "waiting") return;
    const uid = profile?.uid;
    if (!uid) return;
    const stored = readStoredRun(uid);
    if (stored) setResumePrompt(stored);
    // Runs once the uid is available. The 6h cutoff is enforced inside
    // readStoredRun, and we want a snapshot of "what was there when
    // /run opened", not a reactive view of localStorage — so phase is
    // intentionally excluded from the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  // 100ms threshold for the skeleton — programme reads usually return
  // from cache faster than this, so the skeleton only shows on cold
  // loads. Freeform users skip the threshold entirely.
  const [skeletonThresholdElapsed, setSkeletonThresholdElapsed] =
    useState(false);
  useEffect(() => {
    if (isFreeformUser || !programLoading) return;
    const t = setTimeout(() => setSkeletonThresholdElapsed(true), 100);
    return () => clearTimeout(t);
  }, [isFreeformUser, programLoading]);
  const showSkeleton =
    !isFreeformUser && programLoading && skeletonThresholdElapsed;

  const handleStart = async (config: RunConfig) => {
    audioCues.prime();
    await wakeLock.request();
    // Phase B1: finalise plan metadata against the user's actual
    // activityType (chooser may have diverged from the prefill).
    // RunSetupModal carries the prefill snapshot on config.planMetadata;
    // here we recompute the four user-dependent fields and persist.
    const finalisedMetadata = finalisePlanMetadata(
      config.planMetadata,
      config.activityType
    );
    const finalConfig: RunConfig = {
      ...config,
      planMetadata: finalisedMetadata,
    };
    setRunConfig(finalConfig);
    // Phase B3: capture the original-start epoch so the periodic
    // write effect persists it in every snapshot. Resume re-uses
    // the stored value (see handleResumeFromPrompt below).
    startedAtRef.current = Date.now();
    if (requiresManualDistance(finalConfig.activityType)) {
      dispatch({ type: "START_MANUAL" });
      timer.start();
      haptic("heavy");
      return;
    }
    dispatch({ type: "START_GPS" });
    gps.preWarm();
    gps.start();
  };

  // ─── Phase B3: persistence write + restore handlers ─────────────
  //
  // `writeSnapshot` is called from two places:
  //   1. The periodic-write interval (every 5s while active/paused).
  //   2. The visibilitychange→hidden handler (immediate write before
  //      the OS suspends the page).
  //
  // It's a no-op when there's no run in flight (runConfig null, or
  // phase is waiting/acquiring/countdown/finished). The write itself
  // is best-effort — writeStoredRun returns false on quota / private
  // mode but never throws.
  const writeSnapshot = useCallback(() => {
    if (!runConfig) return;
    if (phase !== "active" && phase !== "paused") return;
    if (startedAtRef.current === null) return;
    const uid = profile?.uid;
    if (!uid) return;
    const snapshot: StoredRun = {
      v: 1,
      config: runConfig,
      startedAt: startedAtRef.current,
      accumulatedSeconds: timer.getAccumulatedSeconds(),
      isRunning: timer.isRunning,
      points: gps.getPoints(),
      lastWriteAt: Date.now(),
      phase: phase === "paused" ? "paused" : "active",
    };
    writeStoredRun(uid, snapshot);
  }, [runConfig, phase, timer, gps, profile?.uid]);

  // Periodic write: every 5s while a run is in flight. The interval
  // re-arms whenever the deps change (e.g. pause flips phase) so the
  // closure captures fresh state.
  useEffect(() => {
    if (phase !== "active" && phase !== "paused") return;
    const id = setInterval(writeSnapshot, 5000);
    // Fire one immediate write so the snapshot exists even if the
    // user immediately backgrounds the tab before the first tick.
    writeSnapshot();
    return () => clearInterval(id);
  }, [phase, writeSnapshot]);

  // visibilitychange→hidden: write immediately so a backgrounded tab
  // that the OS may suspend at any moment has the freshest possible
  // snapshot persisted. Distinct from useRunVisibility's onHidden
  // (which manages GPS/wake-lock); this one is purely persistence.
  // writeSnapshot wrapped in useEffectEvent so the listener stays
  // subscribed for the whole active/paused window instead of
  // re-binding on every writeSnapshot identity change.
  const visibilityWriteSnapshot = useEffectEvent(writeSnapshot);
  useEffect(() => {
    if (phase !== "active" && phase !== "paused") return;
    const handler = () => {
      if (document.visibilityState === "hidden") visibilityWriteSnapshot();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [phase]);

  // Chooser branches:
  //   - Resume: rehydrate timer + GPS, set start/suppress refs, jump
  //     to the stored phase, restart wake-lock + GPS if appropriate.
  //   - Start new: clear storage, dismiss the prompt → setup modal.
  //   - Discard: clear storage, dismiss → navigate home.
  const handleResumeFromPrompt = useCallback(async () => {
    if (!resumePrompt) return;
    audioCues.prime();
    await wakeLock.request();
    setRunConfig(resumePrompt.config);
    startedAtRef.current = resumePrompt.startedAt;
    timer.rehydrate({
      accumulatedSeconds: resumePrompt.accumulatedSeconds,
      isRunning: resumePrompt.isRunning,
    });
    if (resumePrompt.points.length > 0) {
      gps.appendPoints(resumePrompt.points);
    }
    // 5s suppression window: the cold-start GPS chip won't fire its
    // first fix for a few seconds, and the existing gap-banner gate
    // would otherwise display "GPS recovering · last fix Xs ago"
    // using the stale lastFixAt from the restored trail.
    gapBannerSuppressUntilRef.current = Date.now() + 5000;
    dispatch({ type: "RESUME_SNAPSHOT", phase: resumePrompt.phase });
    setResumePrompt(null);
    // Restart GPS for outdoor runs that were active. Paused runs
    // get GPS back on user-driven Resume (handleResume below); we
    // only re-arm here when the snapshot itself was active.
    if (
      isOutdoorGpsRun(resumePrompt.config.activityType) &&
      resumePrompt.phase === "active"
    ) {
      gps.start();
    }
    haptic("medium");
  }, [resumePrompt, timer, gps, audioCues, wakeLock]);

  const handleStartNewFromPrompt = useCallback(() => {
    if (profile?.uid) clearStoredRun(profile.uid);
    setResumePrompt(null);
  }, [profile?.uid]);

  const handleDiscardFromPrompt = useCallback(() => {
    if (profile?.uid) clearStoredRun(profile.uid);
    setResumePrompt(null);
    navigate("/");
  }, [navigate, profile?.uid]);

  // Auto-start without GPS if permission denied or geolocation unavailable
  useEffect(() => {
    if (phase === "acquiring" && gps.error) {
      const transition = () => {
        dispatch({ type: "GPS_FAILED" });
        setCountdown(3);
      };
      transition();
    }
  }, [phase, gps.error]);

  // Count seconds spent in acquiring phase
  useEffect(() => {
    if (phase !== "acquiring") {
      const reset = () => {
        setAcquiringSeconds(0);
      };
      reset();
      return;
    }
    const t = setInterval(() => setAcquiringSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Transition from acquiring to countdown when we get a GPS point
  useEffect(() => {
    if (phase === "acquiring" && gps.points.length > 0) {
      const transition = () => {
        dispatch({ type: "GPS_ACQUIRED" });
        setCountdown(3);
      };
      transition();
    }
  }, [phase, gps.points.length]);

  // Side-effects at "GO!" — wrapped in an effect event so the countdown
  // effect below can depend ONLY on [phase, countdown]. Previously `timer`
  // and `audioCues` were deps; both return fresh object references each
  // render, so every re-render (and GPS fixes stream in during the countdown)
  // cleared + restarted the 1s setTimeout — the countdown could stall and
  // never reach the active phase.
  const onCountdownGo = useEffectEvent(() => {
    dispatch({ type: "COUNTDOWN_DONE" });
    timer.start();
    audioCues.speak("Go!");
    haptic("heavy");
  });

  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      onCountdownGo();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "active") return;
    const pace = calculatePace(gps.distance, timer.elapsed);
    audioCues.checkDistanceCue(gps.distance, pace);
    audioCues.checkTimeCue(timer.elapsed, gps.distance);

    // Pace zone alerts for tempo/interval runs
    if (runConfig?.target?.type === "pace" && runConfig.target.value) {
      const currentPaceSec =
        gps.distance > 0 ? (timer.elapsed / gps.distance) * 1000 : 0;
      audioCues.checkPaceAlert(
        currentPaceSec,
        runConfig.target.value,
        timer.elapsed
      );
    }

    // Halfway and final 500m for distance targets.
    // target.value is metres per the RunConfig contract (see the
    // type definition in RunSetupModal). Read through the helper
    // so the prior `* 1000` regression class can't reappear via
    // copy-paste — both sides of the pipeline now agree on metres
    // because templateToPrefill converts km→m at the bridge.
    const targetMeters = getDistanceTargetMeters(runConfig?.target);
    if (targetMeters > 0) {
      audioCues.checkHalfway(gps.distance, targetMeters);
      audioCues.checkFinal500(gps.distance, targetMeters);
    }
  }, [gps.distance, timer.elapsed, phase, audioCues, runConfig]);

  useEffect(() => {
    if (
      phase !== "active" ||
      !runConfig?.autoPause ||
      requiresManualDistance(runConfig.activityType)
    )
      return;
    const speed = gps.currentPoint?.speed;
    if (speed !== null && speed !== undefined && speed < 0.5 && !autoPaused) {
      autoPauseTimer.current = setTimeout(() => {
        timer.pause();
        setAutoPaused(true);
      }, 5000);
    } else if (
      autoPaused &&
      speed !== null &&
      speed !== undefined &&
      speed >= 1
    ) {
      const resume = () => {
        timer.resume();
        setAutoPaused(false);
      };
      resume();
    }
    return () => {
      if (autoPauseTimer.current) clearTimeout(autoPauseTimer.current);
    };
  }, [
    gps.currentPoint,
    phase,
    autoPaused,
    runConfig?.autoPause,
    runConfig?.activityType,
    timer,
  ]);

  useEffect(() => {
    if (phase === "active" && runConfig?.activityType === "intervals")
      intervals.start();
  }, [phase, runConfig?.activityType, intervals]);

  useEffect(() => {
    if (phase === "active" && runConfig?.activityType === "intervals")
      intervals.tick(timer.elapsed, gps.distance);
  }, [timer.elapsed, gps.distance, phase, runConfig?.activityType, intervals]);

  useEffect(() => {
    if (runConfig?.activityType !== "intervals") return;
    if (intervals.state.phase !== intervalPhaseRef.current) {
      intervalPhaseRef.current = intervals.state.phase;
      audioCues.announcePhase(
        intervals.state.phase,
        intervals.state.currentRep,
        intervals.state.totalReps
      );
      if (intervals.state.phase === "work" || intervals.state.phase === "rest")
        haptic("medium");
    }
  }, [intervals.state, audioCues, runConfig?.activityType]);

  const finishRun = (distanceOverride?: number) => {
    timer.pause();
    gps.stop();
    wakeLock.release();
    dispatch({ type: "FINISH" });
    const finalDistance = distanceOverride ?? gps.distance;
    const points = gps.getPoints();

    // An outdoor run that never got a usable GPS lock records ≤1 point (the
    // provisional start) and no route/distance. Say so plainly at finish
    // rather than silently saving a blank 0 km run.
    if (
      distanceOverride === undefined &&
      isOutdoorGpsRun(runConfig?.activityType) &&
      points.length < 2
    ) {
      toast(
        "GPS never locked on — your time is saved, but there's no route or distance for this one."
      );
    }

    // PR H (audit P1 #9): compute route-quality metrics at finish.
    // Only meaningful for outdoor GPS runs — treadmill / manual
    // have no points and would always score "poor" by the
    // <-5-fixes rule. We skip the computation entirely for those
    // and let RunSummary persist null on the run doc.
    const routeQuality = isOutdoorGpsRun(runConfig?.activityType)
      ? computeRouteQuality({
          acceptedAccuracies: points
            .map((p) => p.accuracy)
            .filter((a): a is number => typeof a === "number"),
          rejectedFixCount: gps.getRejectedFixCount(),
          backgroundGapMs: backgroundGapMsRef.current,
          fixTimestamps: points.map((p) => p.timestamp),
        })
      : null;

    navigate("/run-summary", {
      state: {
        points,
        distance: finalDistance,
        elapsed: timer.elapsed,
        splits: calculateSplits(points),
        elevationGain: totalElevationGain(points),
        runConfig,
        intervalData:
          runConfig?.activityType === "intervals"
            ? runConfig.intervals
            : undefined,
        routeQuality,
      },
    });
  };

  const handlePause = () => {
    haptic("medium");
    timer.pause();
    if (isOutdoorGpsRun(runConfig?.activityType)) gps.stop();
    dispatch({ type: "PAUSE" });
  };

  const handleResume = () => {
    haptic("medium");
    if (isOutdoorGpsRun(runConfig?.activityType)) gps.start();
    timer.resume();
    dispatch({ type: "RESUME" });
  };

  const handleSwitchToManual = useCallback(() => {
    /* User waited 15s+ for a GPS lock that never came. Rather than
       start an outdoor run with zero fixes (the canonical 0km bug),
       transition to manual distance entry: stop the geolocation
       watcher, flip the activity type so TreadmillMode mounts on the
       next render, jump straight to 'active' (NOT 'waiting' — that
       would re-prompt the setup modal) and start the timer.

       Writes activityType='manual' (not 'treadmill') so History,
       RunDetail, etc. can label the run honestly: the user was
       outdoors and intended a real run, GPS just didn't lock.
       requiresManualDistance() and isOutdoorGpsRun() both treat
       'manual' identically to 'treadmill' — this difference is
       cosmetic / labelling only.

       audioCues.prime() / wakeLock.request() were called when the run
       originally entered the acquiring phase and don't need to fire
       again. */
    gps.stop();
    setRunConfig((prev) => (prev ? { ...prev, activityType: "manual" } : prev));
    dispatch({ type: "MANUAL_FALLBACK" });
    timer.start();
    haptic("heavy");
  }, [gps, timer]);

  if (locked && (phase === "active" || phase === "paused")) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundColor: THEME.bg }}
        onDoubleClick={() => {
          setLocked(false);
          haptic("light");
        }}
      >
        <div className="size-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-8">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-5xl font-mono tabular-nums text-white/40 font-bold">
          {timer.formatTime(timer.elapsed)}
        </p>
        <p className="text-2xl font-mono tabular-nums text-white/30 mt-3">
          {(
            (requiresManualDistance(runConfig?.activityType)
              ? treadmillDistance
              : gps.distance) / 1000
          ).toFixed(2)}{" "}
          km
        </p>
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="size-8 rounded-full border border-white/20 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="2"
            >
              <path d="M4 12h16M12 4v16" />
            </svg>
          </div>
          <p className="text-white/40 text-xs animate-pulse">
            Double-tap to unlock
          </p>
        </div>
      </div>
    );
  }

  const currentDistance = requiresManualDistance(runConfig?.activityType)
    ? treadmillDistance
    : gps.distance;

  /* Single derivation reused by RunBottomSheet's End-dialog (which
     swaps Discard to primary for sub-threshold runs to default the
     misclick path toward not-saving) and the dialog's discard branch
     (which skips ConfirmDialog when the run is already invalid).
     `currentDistance` is metres throughout the active run; the helper
     wants km. timer.elapsed is seconds. */
  const liveInvalidReason = runConfig
    ? getInvalidRunReason({
        activityType: runConfig.activityType,
        distanceKm: (currentDistance ?? 0) / 1000,
        elapsedSeconds: timer.elapsed,
      })
    : null;
  const isInvalid = liveInvalidReason !== null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {phase === "waiting" && (
        <>
          {/* Phase B1: delayed-mount gate for structured/race_prep
              users so RunSetupModal's init-from-props captures the
              real programme prefill on its first render. Freeform
              users skip the wait. Skeleton appears only after a
              100ms threshold (cached useProgram reads return faster
              than this, so the skeleton flash is rare). */}
          {!isFreeformUser && programLoading ? (
            showSkeleton ? (
              <RunSetupSkeleton />
            ) : null
          ) : (
            <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground">
              <RunSetupModal
                onStart={handleStart}
                onCancel={() => navigate("/program")}
                programContext={planDecision.strip}
                savedPreferences={{
                  autoPause: true,
                  audioCues: profile?.audioCues !== false,
                  // Plan-derived prefill: activityType, target, intervals.
                  // Empty object on freeform / rest_day / completed_day /
                  // elapsed-plan / missing-template paths.
                  ...planDecision.prefill,
                  // Plan-adherence snapshot — Run.tsx owns the truth, the
                  // modal just carries it through to handleStart where
                  // finalisePlanMetadata recomputes against the user's
                  // final activityType.
                  planMetadata: planDecision.metadata,
                }}
              />
            </div>
          )}
        </>
      )}

      {phase === "acquiring" &&
        (() => {
          const acc = gps.gpsAccuracy;
          const quality = gps.signalQuality;
          const bars =
            quality === "strong"
              ? 4
              : quality === "good"
                ? 3
                : quality === "fair"
                  ? 2
                  : quality === "weak"
                    ? 1
                    : 0;
          const barColor =
            quality === "strong" || quality === "good"
              ? THEME.semantic.positive
              : quality === "fair"
                ? THEME.warning
                : THEME.semantic.vitals;
          return (
            <div
              className="flex-1 flex flex-col items-center justify-center px-8"
              style={{ background: THEME.bg }}
            >
              {/* Signal rings */}
              <div className="relative size-28 flex items-center justify-center mb-8">
                <div
                  className="absolute inset-0 rounded-full border-2 animate-ping"
                  style={{
                    borderColor: `${THEME.teal}30`,
                    animationDuration: "2s",
                  }}
                />
                <div
                  className="absolute inset-3 rounded-full border-2 animate-ping"
                  style={{
                    borderColor: `${THEME.teal}40`,
                    animationDuration: "2s",
                    animationDelay: "0.4s",
                  }}
                />
                <div
                  className="absolute inset-6 rounded-full border-2 animate-ping"
                  style={{
                    borderColor: `${THEME.teal}50`,
                    animationDuration: "2s",
                    animationDelay: "0.8s",
                  }}
                />
                <div
                  className="size-14 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(0,212,170,0.12)",
                    border: `2px solid ${THEME.teal}`,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={THEME.teal}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                </div>
              </div>

              {/* Signal bars + accuracy */}
              <div className="flex items-end gap-1 mb-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 8,
                      height: 6 + i * 5,
                      borderRadius: 3,
                      background:
                        i <= bars ? barColor : "rgba(255,255,255,0.1)",
                      transition: "background 0.3s",
                    }}
                  />
                ))}
                <p
                  className="text-micro ml-2 font-mono"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  {acc ? `\u00B1${Math.round(acc)}m` : "---"}
                </p>
              </div>

              <p className="text-white font-semibold text-lg mb-1">
                {quality === "strong" || quality === "good"
                  ? "GPS locked"
                  : "Acquiring GPS..."}
              </p>
              <p
                className="text-sm text-center max-w-[260px]"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {quality === "weak" || quality === "searching"
                  ? "Move to an open area away from buildings"
                  : "Getting accurate signal..."}
              </p>
              {gps.permissionState === "denied" ? (
                <p className="text-xs text-red-400 mt-2 text-center max-w-[280px]">
                  Location is turned off for Tropos. Turn it on in your phone's
                  Settings, then come back and start again.
                </p>
              ) : gps.error ? (
                <p className="text-xs text-red-400 mt-2 text-center max-w-[280px]">
                  Can't get a GPS signal right now. Move outside, or track
                  without GPS below.
                </p>
              ) : null}

              <div className="mt-8 flex flex-col items-center gap-3 w-full">
                {acquiringSeconds >= 15 && (
                  /* Replaces the old "Start without GPS" CTA. That one
                   started an outdoor run with zero GPS fixes \u2014 the
                   canonical 0km production bug. This sends the user
                   to manual distance entry (TreadmillMode) instead so
                   they record a real time and add distance after. */
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={handleSwitchToManual}
                      className="w-full py-3.5 rounded-2xl font-semibold text-sm active:scale-95"
                      style={{ background: THEME.teal, color: "#000" }}
                    >
                      Track without GPS
                    </button>
                    <p
                      className="text-xs text-center mt-2"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    >
                      Record time now and enter distance after.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    gps.stop();
                    dispatch({ type: "CANCEL_ACQUIRING" });
                  }}
                  className="text-sm"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          );
        })()}

      {phase === "countdown" && (
        <div
          className="h-full flex items-center justify-center text-white"
          style={{ backgroundColor: THEME.bg }}
        >
          <span className="text-9xl font-bold animate-pulse">
            {countdown || "GO!"}
          </span>
        </div>
      )}

      {(phase === "active" || phase === "paused") &&
        requiresManualDistance(runConfig?.activityType) && (
          <div
            className="flex-1 flex items-center text-white"
            style={{ backgroundColor: THEME.bg }}
          >
            <TreadmillMode
              mode={
                runConfig?.activityType === "manual" ? "manual" : "treadmill"
              }
              elapsed={timer.elapsed}
              formatTime={timer.formatTime}
              onSave={(distance) => {
                setTreadmillDistance(distance);
                haptic("success");
                finishRun(distance);
              }}
              onDiscard={() => {
                if (profile?.uid) clearStoredRun(profile.uid);
                navigate("/");
              }}
            />
          </div>
        )}

      {(phase === "active" || phase === "paused") &&
        isOutdoorGpsRun(runConfig?.activityType) && (
          <div
            className="fixed inset-0 z-50 text-white"
            style={{
              backgroundColor: THEME.bg,
              // MapLibre handles its own pan/pinch via pointer events (it works
              // fine under touch-action:none), and the sheet owns its own drag.
              // Locking touch-action + overscroll here stops iOS from
              // rubber-banding / scrolling the page out from under a sheet drag
              // or a map gesture.
              touchAction: "none",
              overscrollBehavior: "none",
            }}
          >
            <div className="absolute top-3 left-4 z-50">
              <GPSIndicator
                accuracy={gps.gpsAccuracy}
                isTracking={gps.isTracking}
                pointCount={gps.points.length}
                signalQuality={gps.signalQuality}
              />
            </div>

            {(runConfig?.activityType === "tempo" ||
              runConfig?.activityType === "intervals") && (
              <div className="absolute top-10 left-4 right-4 z-50">
                <PaceZoneBar
                  currentPace={paceAsNumber(currentDistance, timer.elapsed)}
                  targetPace={
                    runConfig.intervals?.workPace ||
                    runConfig.target.value ||
                    300
                  }
                  tolerance={15}
                />
              </div>
            )}

            <RunMap
              points={gps.points}
              currentPoint={gps.currentPoint}
              interactive={true}
              liveControls={true}
              distanceMarkers={true}
              height="h-full"
              className="absolute inset-0"
            />

            {/* Crow-flies "back to start" aid — top-centre, clear of the
                left-anchored GPS indicator and the tempo/interval PaceZoneBar
                (top-10). Self-hides within 200m of the start. */}
            <div className="absolute top-3 left-1/2 z-50 -translate-x-1/2">
              <BackToStartChip
                points={gps.points}
                currentPoint={gps.currentPoint}
              />
            </div>

            {autoPaused && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 text-center py-2 px-3 rounded-full bg-yellow-500/20">
                <p className="text-xs text-yellow-300">
                  Auto-paused · start moving to resume
                </p>
              </div>
            )}

            {bgGapBanner && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 text-center py-2 px-4 rounded-full bg-orange-500/20 animate-pulse">
                <p className="text-xs text-orange-300">{bgGapBanner}</p>
              </div>
            )}

            {(() => {
              /* GPS-loss banner. isValidReading() drops poor fixes
               silently — the accuracy reading can keep showing the
               last value even when no real fixes are landing. We
               surface "GPS recovering" when the gap since the last
               *valid* fix exceeds 8s during an active run.
               timer.elapsed re-renders this component every second
               so the comparison stays current without a separate
               interval. The treadmill case is already excluded by
               the parent JSX block at the start of this section. */
              if (phase !== "active") return null;
              if (gps.lastFixAt === null) return null; // pre-first-fix; covered by 'Acquiring GPS'
              /* Reading the wall clock during render is flagged as
               impure by react-hooks/purity. The render is bounded by
               the per-second timer.elapsed re-render, so staleness is
               at most ~1s — the banner will appear / refresh on the
               next tick. The dependency on Date.now() is intentional. */
              const now = Date.now();
              // Phase B3: suppress for 5s after a Resume so the cold-
              // start GPS window doesn't render a false-positive banner
              // against the stale lastFixAt of the restored trail.
              if (now < gapBannerSuppressUntilRef.current) return null;
              const gapSeconds = (now - gps.lastFixAt) / 1000;
              if (gapSeconds < 8) return null;
              return (
                <div
                  className="absolute top-32 left-1/2 -translate-x-1/2 z-50 text-center py-2 px-4 rounded-full bg-red-500/20 animate-pulse"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-xs text-red-300">
                    GPS recovering · last fix {Math.round(gapSeconds)}s ago
                  </p>
                </div>
              );
            })()}

            {runConfig?.activityType === "guided" && (
              <GuidedRunOverlay
                currentSegment={guidedRun.currentSegment}
                nextSegment={guidedRun.nextSegment}
                timeRemaining={guidedRun.timeRemaining}
                segmentProgress={guidedRun.segmentProgress}
                totalProgress={guidedRun.totalProgress}
                isComplete={guidedRun.isComplete}
              />
            )}

            <RunBottomSheet
              elapsed={timer.elapsed}
              distance={currentDistance}
              points={gps.points}
              formatTime={timer.formatTime}
              onPause={handlePause}
              onLock={() => setLocked(true)}
              isPaused={phase === "paused"}
              onResume={handleResume}
              onStop={() => {
                haptic("success");
                finishRun();
              }}
              /* Sub-threshold runs route home immediately — there's
               nothing meaningful to lose. Valid runs hit the
               ConfirmDialog "Discard this run?" gate before tearing
               down GPS / timer / wake-lock. */
              onDiscard={() => {
                if (isInvalid) {
                  timer.pause();
                  gps.stop();
                  wakeLock.release();
                  // Phase B3: clear the persisted snapshot so a
                  // discarded sub-threshold run doesn't reappear in
                  // the chooser on next /run open.
                  if (profile?.uid) clearStoredRun(profile.uid);
                  navigate("/");
                } else {
                  setShowDiscardConfirm(true);
                }
              }}
              isInvalid={isInvalid}
              intervalDisplay={
                runConfig?.activityType === "intervals" ? (
                  <IntervalDisplay state={intervals.state} />
                ) : undefined
              }
              weightKg={profile?.weightKg || 70}
            />
          </div>
        )}
      {/* Phase B3: chooser overlays everything while we have a
          recoverable snapshot. Mounted last so it z-orders above the
          setup modal and any other waiting-state UI.
          Distance is rebuilt from the persisted point buffer here
          rather than persisted on the snapshot — keeps the storage
          shape minimal and reuses the same haversine the GPS hook
          uses for cumulative-distance tracking. */}
      {resumePrompt && (
        <RunResumePrompt
          accumulatedSeconds={resumePrompt.accumulatedSeconds}
          distanceMeters={(() => {
            const pts = resumePrompt.points;
            if (pts.length < 2) return 0;
            let d = 0;
            for (let i = 1; i < pts.length; i++) {
              d += haversine(
                pts[i - 1].lat,
                pts[i - 1].lon,
                pts[i].lat,
                pts[i].lon
              );
            }
            return d;
          })()}
          startedAt={resumePrompt.startedAt}
          onResume={handleResumeFromPrompt}
          onStartNew={handleStartNewFromPrompt}
          onDiscard={handleDiscardFromPrompt}
        />
      )}

      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard this run?"
        description="This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          timer.pause();
          gps.stop();
          wakeLock.release();
          // Phase B3: clear so the discarded run doesn't get
          // resurrected by the chooser on next mount.
          if (profile?.uid) clearStoredRun(profile.uid);
          navigate("/");
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
