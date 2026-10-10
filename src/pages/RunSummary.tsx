import CompletionExtras from "@/components/workout/CompletionExtras";
import SectionHeading from "@/components/ui/SectionHeading";
import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  Suspense,
} from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { readString, writeString } from "@/lib/localStore";
import { lazyRetry } from "@/lib/lazyRetry";
import { doc } from "firebase/firestore";
import { updateDocGuarded } from "@/lib/firestoreWrite";
import {
  queueDurableWrite,
  pendingDocumentWrites,
  subscribeQueuedWrites,
  queuedWritesVersion,
  flushQueue,
} from "@/lib/offlineQueue";
import EditDistance from "@/components/run/EditDistance";
import { auth, db } from "../lib/firebase";
import { localDateString } from "../lib/dateHelpers";
import { spaceDef } from "@/features/spaces/spaceDefs";
import { useAuth } from "../lib/auth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { logger } from "../lib/logger";
import {
  calculatePace,
  detectBestEfforts,
  toGPX,
  estimateRunCalories,
} from "../lib/gps";
import type { SessionShareAction } from "../lib/sessionPost";
import type { GPSPoint, Split } from "../lib/gps";
import type { RunConfig } from "../components/run/RunSetupModal";
import RunMap from "../components/run/RunMapLazy";
import PaceLegend from "../components/run/PaceLegend";
import SegmentedControl from "../components/ui/SegmentedControl";
import SplitsTable from "../components/run/SplitsTable";
import BestEffortsCard from "../components/run/BestEffortsCard";
import ElevationProfile from "../components/analytics/ElevationProfile";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import CircleShareSheet from "@/components/social/CircleShareSheet";
import { Button } from "@/components/ui/Button";
import { CALORIE_UNIT, formatCalories } from "@/utils/formatNutrition";
import { THEME } from "../lib/theme";
import { calculatePaceTrend, type PaceTrendResult } from "../lib/paceTrends";
import { fetchSavedRuns } from "../lib/savedRuns";
import PaceInsightCard from "../components/run/PaceInsightCard";
import {
  usePaceInsightFromRuns,
  type PaceInsightRun,
} from "../hooks/usePaceInsight";
import { usePrivacyZones } from "../hooks/usePrivacyZones";
import { applyPrivacyZones, type PrivacyZone } from "../lib/privacyZones";
import { useShoes } from "../hooks/useShoes";
import { useProgram } from "../features/program/useProgram";
import { changeStands } from "../features/program/programOutcome";
import { getAdherenceLabel } from "../lib/runPlanMetadata";
import { RUN_TEMPLATES } from "../lib/workoutTemplates";
import { plannedRunVerdict, workPaceSeconds } from "../lib/plannedRunVerdict";
import { pinnedWorkPace } from "../lib/runSegments";
import type { WorkPortion } from "../hooks/useSessionPlayer";
import { paceMinSec, distanceLabel2, distanceValue } from "../lib/runLabels";
import { splitsForDisplay } from "../lib/gps";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  distanceIn,
  type DistanceUnit,
  paceUnitLabel,
  distanceUnitLabel,
  elevationUnitLabel,
} from "@/lib/distanceUnits";
import RunStatGrid from "@/components/run/RunStatGrid";
import { useWeekPulse, type PendingRun } from "../hooks/useWeekPulse";
import { completeRun, runPostRoute } from "@/lib/runCompletion";
import { isVolumeEligible, isPaceEligible } from "../lib/runStatsEligibility";
import { clearStoredRun } from "../lib/runResumeStorage";
import { announceRouteShare, shareGpx } from "@/lib/shareRoute";
import { toast } from "@/lib/toast";
import { track as trackLifecycle } from "@/lib/lifecycleAnalytics";
import {
  WifiOff,
  CheckCircle,
  Trophy,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import {
  canExportGpx,
  canShowDiscard,
  unsizedRunHeading,
  hasUnsavedFieldEdits,
  canShowDone,
  canShowNormalSave,
  canShowRetrySave,
  canShowSaveAnyway,
  canShowShare,
  getInvalidRunReason,
  isOutdoorGpsRun,
  type InvalidRunReason,
  type SaveStatus,
} from "../lib/runGuards";
import { getDistanceComparison } from "@/lib/funComparisons";
import { elevationLabel } from "@/lib/runLabels";
import { formatDayMonthYear } from "@/utils/formatters";
import { gradeAdjustedPace } from "../lib/gradeAdjustedPace";

/** Why a save stopped short when the privacy zones could not be checked
 *  (offline before they had loaded, or the read refused). Shown in the
 *  Retry banner, under "Couldn't save your run". */
const PRIVACY_ZONES_UNCHECKED =
  "Privacy zones are cut from the route before it's saved, and they couldn't be checked. Try again when you're online.";

/* Reusable retry banner. Shown above the action row on a save
 * failure. Coral-tinted to read as in-flow rather than modal-alert.
 * Used by both the valid-summary action stack and the InvalidRunReview
 * card when its "Save anyway" attempt fails. */
function RetryBanner({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-running/10 border border-running/25"
      role="alert"
    >
      <AlertCircle
        size={18}
        className="mt-0.5 shrink-0 text-running"
        aria-hidden="true"
      />
      <div className="flex-1 text-xs text-foreground/80">
        <p className="font-medium text-running-strong">
          Couldn&apos;t save your run
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {error || "We couldn't save this run."}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-running-fill"
      >
        Retry
      </button>
    </div>
  );
}

/* Focused review card for runs that fall below the
 * isInvalidRun thresholds (under 50m or under 30s). Replaces the
 * weak `distance===0 && elapsed<30 && !saved` guard the file used
 * to carry. Restrained / informational styling — no destructive red
 * on the title; the run was simply too short, not broken.
 *
 * Saving anyway does NOT promote the run to the full summary —
 * InvalidRunReview owns its own saved-state UI ("Saved anyway" +
 * Done). Sharing / GPX export / map / charts are deliberately absent
 * because none of them make sense for sub-50m noise. */
// An optional detail, loaded on its own: from its own file, so it brings
// only the card and not the workout finish screen it once shared a file with.
const WeekPulseView = lazyRetry(() => import("@/components/WeekPulseView"));
const SavedRunKudos = lazyRetry(
  () => import("@/components/social/SavedRunKudos")
);

interface InvalidRunReviewProps {
  unit: DistanceUnit;
  distanceKm: number;
  elapsedSeconds: number;
  formatTime: (s: number) => string;
  outdoorGps: boolean;
  /** Drives the body-copy variant. 'too-short' is the original
   *  shipped reason; 'too-fast' surfaces when the user fat-fingers
   *  the manual distance input (typing 20 instead of 2.0). */
  reason: InvalidRunReason;
  saveStatus: SaveStatus;
  saveError: string | null;
  isOnline: boolean;
  pendingSync: boolean;
  /** Set when the run came from treadmill / manual flows so the
   *  Edit distance affordance only surfaces for runs whose
   *  distance was user-typed (and therefore correctable). Outdoor
   *  GPS runs aren't editable from this screen — the distance
   *  came from a sensor, not a typo. */
  canEditDistance: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDone: () => void;
  onEditDistance: (newDistanceMeters: number) => void;
}

function InvalidRunReview({
  unit,
  distanceKm,
  elapsedSeconds,
  formatTime,
  outdoorGps,
  reason,
  saveStatus,
  saveError,
  isOnline,
  pendingSync,
  canEditDistance,
  onSave,
  onDiscard,
  onDone,
  onEditDistance,
}: InvalidRunReviewProps) {
  const formattedDuration = formatTime(elapsedSeconds);
  const formattedDistance = `${distanceIn(distanceKm * 1000, unit).toFixed(2)} ${unit}`;
  const showSaveAnyway = canShowSaveAnyway({ isInvalid: true, saveStatus });
  const showDiscard = canShowDiscard({ saveStatus });
  const showRetry = canShowRetrySave({ saveStatus });
  const showDone = canShowDone({ saveStatus });
  const isSaved = saveStatus === "saved";

  /* Heading + body are reason-aware before save and saved-aware after.
     Saved includes an offline local write, so it must not claim that
     the run is already on the server. The offline sync note stays below.
     Heading priority: saved > too-fast > too-short. Body mirrors.
     'too-fast' only fires for manual-distance modes (treadmill /
     manual) when the implied speed exceeds 12 m/s — the canonical
     fat-finger case. */
  const heading = isSaved
    ? "Saved"
    : reason === "too-fast"
      ? "Run looks invalid"
      : "Run too short";
  const bodyCopy = isSaved
    ? null
    : reason === "too-fast"
      ? `We recorded ${formattedDuration} and ${formattedDistance}. The implied pace looks unrealistic — did you mean a different distance?`
      : outdoorGps
        ? `We recorded ${formattedDuration} and ${formattedDistance}. This may have happened before GPS locked.`
        : `We recorded ${formattedDuration} and ${formattedDistance}. This is below the minimum distance or duration for a normal summary.`;

  return (
    <div className="mx-4 mt-3 mb-6 p-4 rounded-2xl bg-card space-y-3">
      {/* Announce the saved heading without repeating the pre-save warning. */}
      <div className="space-y-1.5" aria-live="polite">
        <p className="text-base font-semibold text-foreground">{heading}</p>
        {bodyCopy && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {bodyCopy}
          </p>
        )}
      </div>

      {showRetry && <RetryBanner error={saveError} onRetry={onSave} />}

      {showDone && (
        <div className="space-y-3 pt-1">
          {/* Drop the redundant online "Saved anyway." note now that
              the heading is the authoritative saved state. The
              offline variant stays — it conveys real sync status the
              heading copy doesn't. */}
          {pendingSync && (
            <p className="text-xs text-muted-foreground text-center">
              {isOnline
                ? "Saved on this phone · waiting to sync."
                : "Saved locally — will sync when online."}
            </p>
          )}
          <button
            type="button"
            onClick={onDone}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{
              background: `${THEME.success}20`,
              color: THEME.success,
              border: `1px solid ${THEME.success}4d`,
            }}
          >
            <CheckCircle size={16} aria-hidden="true" />
            Done
          </button>
        </div>
      )}

      {/* Edit-distance affordance — surfaces only for treadmill /
          manual runs in pre-saved state. The most useful action
          for a fat-finger 'too-fast' (e.g. typed 20 instead of 2.0)
          is correcting the typo, not discarding or saving wrong
          data. Outdoor GPS runs are skipped because the distance
          came from a sensor — there's no typo to correct. When the
          edit produces a valid run, RunSummary's parent re-derives
          isInvalid from the new distance and the user lands on
          the normal valid summary path. */}
      {canEditDistance && (showSaveAnyway || showDiscard) && (
        <div className="pt-1">
          <EditDistance
            unit={unit}
            distanceKm={distanceKm}
            onCommit={onEditDistance}
          />
        </div>
      )}

      {(showSaveAnyway || showDiscard) && (
        <div className="space-y-2 pt-1">
          {showSaveAnyway && (
            <button
              type="button"
              onClick={onSave}
              disabled={saveStatus === "saving"}
              className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-90 bg-muted text-foreground border border-border"
            >
              {saveStatus === "saving" ? "Saving…" : "Save anyway"}
            </button>
          )}
          {showDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-destructive/10 text-destructive-strong border border-destructive/20"
            >
              Discard
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface RunData {
  savedRun?: {
    uid: string;
    id: string;
    notes: string;
    relativeEffort: "easier" | "matched" | "harder" | null;
  };
  points: GPSPoint[];
  distance: number;
  elapsed: number;
  splits: Split[];
  elevationGain: number;
  runConfig?: RunConfig | null;
  intervalData?: RunConfig["intervals"];
  // PR H (audit P1 #9): route-quality metrics computed in Run.tsx
  // at finish time. Null for non-GPS sources (treadmill / manual).
  routeQuality?: import("../lib/routeQuality").RouteQuality | null;
  /** The time and distance in the session's work segments
   *  (`useSessionPlayer`), null for a run with none. */
  workPortion?: WorkPortion | null;
}

export default function RunSummary() {
  const { state } = useLocation() as { state: RunData };
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const unit = useDistanceUnit();
  const receipt = state?.savedRun?.uid === user?.uid ? state?.savedRun : null;
  const runOwnerRef = useRef(user?.uid);
  const {
    zones: privacyZones,
    loading: privacyZonesLoading,
    error: privacyZonesError,
    confirmZones: confirmPrivacyZones,
  } = usePrivacyZones();
  const { isOnline } = useOnlineStatus();
  const { updateMileage, defaultShoe } = useShoes();
  // PR-J Q2 chunk B2: completeRunDay deleted. The saved-run write
  // alone is the completion signal now — derivation (Q1 P27)
  // surfaces ✅ via the claim map when a matching saved run lands.
  // `skipRunDay` is retained for the "skip" affordance in the
  // reconciliation card; `markManualComplete` covers the
  // "yes I did do this scheduled run" reconciliation path
  // (Q5 P74 — DayActionSheet's contextual hint).
  const { markManualComplete, skipRunDay, programState } = useProgram();
  // P3-1: reconciliation choice — 'pending' until the user picks,
  // then 'completed' / 'skipped' / 'dismissed' once they do.
  //
  // P3-1 follow-up: the dismissal persists across mounts of the
  // same saved run via localStorage keyed on the Firestore docId
  // (captured after addDoc resolves below). Re-visits don't
  // re-fire the prompt for an already-decided run.
  const [reconciliation, setReconciliation] = useState<
    "pending" | "completed" | "skipped" | "dismissed"
  >("pending");
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string | null>(
    receipt?.id ?? null
  );
  const runIdRef = useRef<string | null>(receipt?.id ?? null);
  const savingRef = useRef(false);
  useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const pendingSync =
    !!user?.uid &&
    !!savedRunId &&
    pendingDocumentWrites(user.uid, `users/${user.uid}/runs`).some(
      (entry) => entry.id === savedRunId
    );
  /* What the notes and effort fields held at the moment the run was
     written. Both stay editable after saving, but the Save button is gone
     by then and Done only navigates — so a correction typed at that point
     was silently dropped. Comparing against this is what tells the two
     apart: unchanged since the write (nothing to do) versus edited after
     it (an update the user is owed). */
  const [savedFields, setSavedFields] = useState<{
    notes: string;
    relativeEffort: "easier" | "matched" | "harder" | null;
  } | null>(
    receipt
      ? { notes: receipt.notes, relativeEffort: receipt.relativeEffort }
      : null
  );
  const [updating, setUpdating] = useState(false);
  /* The finish screen's share action. A chain resumed after a failure sets
     it again for the same run id, and sessionPost remembers a run's post
     by that id, so the run is never posted twice. */
  const [shareAction, setShareAction] = useState<
    SessionShareAction | undefined
  >();
  /* Must run once per saved run, however many times the chain is resumed
     after a failure: a second call double-counts the distance. */
  const mileageAppliedRef = useRef(false);

  // Pull dismissal state from localStorage whenever the saved-run
  // id arrives. The doc id is the natural unique key — different
  // off-plan runs for the same scheduled slot still each get one
  // prompt-then-quiet cycle. Read while rendering, once per id (React's
  // "adjust state during render" idiom), so a run already decided never
  // paints the prompt for a commit before it hides.
  const [dismissalReadFor, setDismissalReadFor] = useState<string | null>(null);
  if (savedRunId && dismissalReadFor !== savedRunId) {
    setDismissalReadFor(savedRunId);
    // Unavailable storage (private mode, blocked) reads as not dismissed:
    // the prompt re-fires per mount and the user can dismiss again. Same
    // end state, just one extra tap in the rare error path.
    if (readString(`tropos:reconcileDismissed:${savedRunId}`) === "1")
      setReconciliation("dismissed");
  }
  const [shareOpen, setShareOpen] = useState(false);
  // CIRCLE-SESSION-01 — explicit summary-only Circle share, offered
  // only after a PLANNED run is saved. The sheet mounts lazily so its
  // Goal Space reads never fire unless the user taps the action.
  const [circleShareOpen, setCircleShareOpen] = useState(false);
  /* Save flow state. Replaces a single `saved: boolean` so the UI can
     distinguish "still working", "succeeded", and "failed — retry".
     A toast was the only failure signal previously; on Safari PWA the
     toast can race-render behind the bottom chrome and the user is
     left without feedback. The `error` state drives an inline banner
     above the action stack with a Retry button. `saved` is kept as a
     derived const so out-of-scope readers (the H1 copy, the
     'Run saved' confirmation strip, the offline notice) keep working
     without rippling the migration through every condition in
     this commit. */
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    receipt ? "saved" : "idle"
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = saveStatus === "saved";
  const [paceTrend, setPaceTrend] = useState<PaceTrendResult | null>(null);
  // The historical run list, reused for BOTH the pace-trend badge and the
  // Pro pace-insight card — one query, two consumers (no extra Firestore read).
  const [paceHistory, setPaceHistory] = useState<PaceInsightRun[]>([]);
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  /* RUN-03: optional one-tap post-run effort signal ("how did it feel vs
     what you expected?"). Structured so the engine can later distinguish
     "completed, felt easy" from "completed, too hard" — notes no longer
     carry the whole reflection burden. Null = skipped (never required).
     Deliberately NOT fed into the Performance Index / trainingLoad (that
     would need the trainingLoad-standalone lock revisited); v1 is a stored
     calibration signal only. */
  const [relativeEffort, setRelativeEffort] = useState<
    "easier" | "matched" | "harder" | null
  >(receipt?.relativeEffort ?? null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  /* Sprint 3 Edit-distance: when the user corrects a fat-fingered
     manual / treadmill distance from InvalidRunReview, the new
     value overrides state.distance for every downstream
     derivation (avgPace, invalidReason, runData on save). Null
     means "use the original recorded distance". Outdoor GPS runs
     never hit this path — the distance came from a sensor. */
  const [editedDistanceMeters, setEditedDistanceMeters] = useState<
    number | null
  >(null);

  // Fetch past runs ONCE — feeds both the pace-trend badge and the Pro
  // pace-insight card. Hardened with a cancelled flag + try/catch/finally so
  // an unmount mid-flight or a failed read can't setState on a dead component
  // or leave the insight loading forever. Depends on user?.uid (not the whole
  // user object) so it doesn't re-query on unrelated identity changes.
  const uid = user?.uid;
  /* The inputs the history above was last read for; loading is derived
     from it. The read restarts whenever the uid, the run or its corrected
     distance changes, and the insight reads as loading from that same
     render until the read for THESE inputs settles. */
  const [paceHistoryFor, setPaceHistoryFor] = useState<{
    uid: string;
    state: RunData;
    editedDistanceMeters: number | null;
  } | null>(null);
  const paceHistoryLoading =
    paceHistoryFor === null ||
    paceHistoryFor.uid !== uid ||
    paceHistoryFor.state !== state ||
    paceHistoryFor.editedDistanceMeters !== editedDistanceMeters;
  useEffect(() => {
    if (!uid || !state) return;
    let cancelled = false;
    (async () => {
      try {
        /* Saved runs carry their source and validity fields, so
           paceTrends can exclude treadmill / manual / invalid /
           savedAnyway records — a treadmill 2:38/km can't masquerade as
           a PR against historical outdoor runs. */
        const allRuns = await fetchSavedRuns(uid, { all: true });
        if (cancelled) return;
        setPaceHistory(allRuns);
        const currentRun = {
          // Once saved, this run is in the history read above.
          id: state.savedRun?.id,
          distance: state.distance,
          avgPace:
            state.elapsed > 0 && state.distance > 0
              ? (state.elapsed / state.distance) * 1000
              : 0,
          completedAt: new Date(),
          activityType: state.runConfig?.activityType,
        };
        setPaceTrend(calculatePaceTrend(currentRun, allRuns));
      } catch (err) {
        if (cancelled) return;
        logger.error("[RunSummary] pace-history load failed", err);
        setPaceHistory([]);
      } finally {
        if (!cancelled) setPaceHistoryFor({ uid, state, editedDistanceMeters });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, state, editedDistanceMeters]);

  // Pace insight (Pro) — reuse the already-fetched history. The just-saved run
  // is the candidate that can cross the threshold; dedupe it out of the
  // historical copy by document id. These hooks run BEFORE the `if (!state)`
  // early return to keep hook order stable.
  const currentPaceCandidate = useMemo<PaceInsightRun | null>(() => {
    if (!state || !saved || !savedRunId) return null;
    const distance = editedDistanceMeters ?? state.distance;
    const duration = state.elapsed;
    return {
      id: savedRunId,
      distance,
      duration,
      completedAt: new Date(),
      avgPace: duration > 0 && distance > 0 ? (duration / distance) * 1000 : 0,
      activityType: state.runConfig?.activityType ?? "freerun",
      isInvalid: false,
      savedAnyway: false,
    };
  }, [state, saved, savedRunId, editedDistanceMeters]);

  const paceInsightRuns = useMemo(
    () =>
      currentPaceCandidate
        ? [
            currentPaceCandidate,
            ...paceHistory.filter((run) => run.id !== currentPaceCandidate.id),
          ]
        : paceHistory,
    [currentPaceCandidate, paceHistory]
  );

  const paceInsight = usePaceInsightFromRuns(paceInsightRuns, {
    // Only after a VALID outdoor run is saved — never the invalid/save-anyway
    // review path.
    enabled:
      saved &&
      currentPaceCandidate !== null &&
      isPaceEligible(currentPaceCandidate),
    loading: paceHistoryLoading,
  });

  /* Fun distance comparison. Two constraints shape this.
     MEMOISED because `getDistanceComparison` picks at RANDOM among the
     eligible lines — recomputing in the render body reshuffles the text
     on every unrelated re-render (save status, map load, online flip),
     and this page re-renders plenty.
     Declared ABOVE the `!state` early return, like the pace hooks, so
     hook order stays stable; it therefore reads `state` defensively and
     repeats the edited-distance fallback rather than using the
     `distance` binding, which is destructured below the return. */
  const funComparison = useMemo(() => {
    const meters = editedDistanceMeters ?? state?.distance;
    return meters ? getDistanceComparison(meters / 1000) : null;
  }, [editedDistanceMeters, state?.distance]);

  const points = useMemo(
    () => (state ? applyPrivacyZones(state.points, privacyZones) : []),
    [state, privacyZones]
  );

  /* This run as the screen's two week lines count it, saved or not yet.
     One read of the week (`useWeekPulse`, counted by `trainingWeek`) feeds
     the card and the plan row, so the two cannot disagree. Above the
     `!state` return with the other hooks, so it reads `state` defensively
     and repeats the edited-distance fallback. */
  const pendingWeekRun = useMemo<PendingRun | null>(() => {
    if (!state) return null;
    const runDistance = editedDistanceMeters ?? state.distance;
    const type = state.runConfig?.activityType;
    return {
      id: savedRunId,
      // A run with no trace (entered by hand) is today's.
      date: points[0] ? localDateString(new Date(points[0].timestamp)) : null,
      distance: runDistance,
      duration: state.elapsed,
      isInvalid: type
        ? getInvalidRunReason({
            activityType: type,
            distanceKm: (runDistance ?? 0) / 1000,
            elapsedSeconds: state.elapsed ?? 0,
          }) !== null
        : false,
    };
  }, [state, editedDistanceMeters, savedRunId, points]);
  const weekPulse = useWeekPulse(0, pendingWeekRun);

  // A redirect is an element, not a call made while rendering: React Router
  // warns on navigate() in render, and a re-render before the navigation
  // commits would fire it twice.
  if (!state || (state.savedRun && state.savedRun.uid !== user?.uid)) {
    return <Navigate to="/" replace />;
  }

  const {
    distance: originalDistance,
    elapsed,
    splits,
    elevationGain,
    runConfig,
    intervalData,
  } = state;
  /* `distance` is the effective distance — either the original
     recorded value or the user-edited override from
     InvalidRunReview's Edit distance flow. Every downstream
     derivation (pace, calories, invalid reason, runData on save)
     reads from this so the edit propagates cleanly without
     touching each call site. */
  const distance = editedDistanceMeters ?? originalDistance;
  /* Mile laps are recomputed from the trace rather than converted — a mile
     split is a different CUT of the run. Privacy-zone trimming happens
     first, so the rows match the map the user is looking at. */
  const { splits: displaySplits, lapUnit } = splitsForDisplay(
    unit,
    points,
    splits
  );
  const avgPace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, profile?.weightKg || 70);
  const avgPaceSeconds =
    elapsed > 0 && distance > 0 ? (elapsed / distance) * 1000 : 0;
  const bestEfforts = detectBestEfforts(points, distance);

  /* `distance` is metres throughout the run flow (useGPS.ts:118-120
     accumulates via Haversine in metres, RunSummary already converts
     for display via /1000). isInvalidRun expects km. */
  const distanceKm = (distance ?? 0) / 1000;
  const elapsedSeconds = elapsed ?? 0;
  const activityType = runConfig?.activityType;

  // Run8-Vocab — adherence chip in the summary header.
  // Maps runConfig.planMetadata → "Planned" / "Custom" / "Extra"
  // (or null when there's no plan context). Locked vocab in
  // `.claude/plans/programme-run-followups.md` row `Run8-Vocab`.
  const adherenceLabel = getAdherenceLabel(runConfig?.planMetadata);

  // CIRCLE-SESSION-01 — was this run a PLANNED session? True when it
  // fulfilled a scheduled slot: an explicit scheduledRunId linkage, or
  // a plan-matched template (matchedPlanExact non-null ⇒ "Planned" /
  // "Custom" adherence). offPlan ("Extra") and freeform runs are NOT
  // planned — the Circle share action stays hidden for them.
  const isPlannedSession = (() => {
    const pm = runConfig?.planMetadata;
    if (!pm || pm.offPlan) return false;
    return pm.scheduledRunId !== null || pm.matchedPlanExact !== null;
  })();

  // Run8 PR3b — state-aware completion hero copy. When the run was
  // tied to a planned template AND was at least somewhat-sized
  // (>200m + >60s, matching the existing "Great run!" threshold),
  // surface the template name + adherence verb so the user sees
  // "Easy 30 complete ✓" rather than the generic "Great run!". The
  // verb tracks adherence:
  //   Planned → "complete ✓"
  //   Custom  → "· custom"
  //   Extra / null → fall through to the generic celebratory copy.
  // Source of truth for template name: RUN_TEMPLATES looked up by
  // plannedTemplateId or actualTemplateId.
  /* Apply a correction made AFTER the run was written. Scoped to the two
     fields that stay editable — a distance or a route change post-save is
     a different operation with different downstream effects (PRs, weekly
     stats, challenge progress), and belongs with saved-session editing
     rather than here. */
  const notesDirty = hasUnsavedFieldEdits({
    saved: savedFields,
    notes,
    relativeEffort,
  });

  const handleUpdateFields = async () => {
    if (!savedRunId || !user?.uid || !notesDirty || updating) return;
    setUpdating(true);
    const next = { notes: notes.trim(), relativeEffort };
    try {
      if (pendingSync || !navigator.onLine) {
        queueDurableWrite(
          user.uid,
          `users/${user.uid}/runs`,
          savedRunId,
          next,
          true
        );
        if (navigator.onLine) void flushQueue(db, user.uid).catch(() => {});
      } else {
        await updateDocGuarded(
          doc(db, "users", user.uid, "runs", savedRunId),
          next
        );
      }
      setSavedFields(next);
      navigate(".", {
        replace: true,
        state: {
          ...state,
          savedRun: { uid: user.uid, id: savedRunId, ...next },
        },
      });
      toast.success("Changes saved");
    } catch (err) {
      logger.error("[RunSummary] field update failed", err);
      toast.error("Couldn't save your changes. Try again.");
    } finally {
      setUpdating(false);
    }
  };

  const heroTemplateName = (() => {
    const pm = runConfig?.planMetadata;
    if (!pm) return null;
    const tmplId = pm.plannedTemplateId || pm.actualTemplateId;
    if (!tmplId) return null;
    const tmpl = RUN_TEMPLATES.find((t) => t.id === tmplId);
    return tmpl?.name ?? null;
  })();
  const heroCopy = (() => {
    const sized = (distance || 0) > 200 && (elapsed || 0) > 60;
    /* "Run saved" is a claim about the WRITE, so it waits for one — see
       `unsizedRunHeading`, which owns the rule and its reasoning. */
    if (!sized) return unsizedRunHeading({ saveStatus });
    if (heroTemplateName && adherenceLabel === "Planned") {
      return `${heroTemplateName} complete ✓`;
    }
    if (heroTemplateName && adherenceLabel === "Custom") {
      return `${heroTemplateName} · custom`;
    }
    return "Nice run";
  })();

  // Runna-style plan-vs-actual verdict (running competitive doc P0 #3): how a
  // PLANNED session's pace compared with its target, including the "keep
  // the easy days easy" nudge. `plannedRunVerdict` holds the rules.
  const paceVerdict = plannedRunVerdict({
    planMetadata: runConfig?.planMetadata,
    avgPaceSeconds,
    workPaceSeconds: workPaceSeconds(state.workPortion),
    pinnedPaceSeconds: pinnedWorkPace(runConfig?.segments),
    distance,
    runFitness: profile?.runFitness,
    unit,
  });

  // The context-aware primary stat, a card above the stats card of four.
  // Intervals get a work-set summary ("N × distance @ pace") instead of
  // the raw session average pace, which mixes work and rest and reads
  // slow. A race gets its finishing time, the figure a racer wants under
  // the distance headline. Every other run has none: the distance
  // headline and the stats card of four are its read.
  const primaryStat = (() => {
    if (activityType === "intervals") {
      const iv = runConfig?.intervals;
      if (!iv) return null;
      const distLabel =
        iv.workDistance && iv.workDistance >= 1000
          ? `${(iv.workDistance / 1000).toFixed(iv.workDistance % 1000 === 0 ? 0 : 1)}K`
          : iv.workDistance
            ? `${iv.workDistance} m`
            : iv.workDuration
              ? `${Math.round(iv.workDuration / 60)} min`
              : null;
      if (!distLabel) return null;
      // Spaced units, as everywhere: "5 × 400 m @ 4:30 /km".
      const paceLabel = iv.workPace
        ? ` @ ${paceMinSec(iv.workPace, unit)} ${paceUnitLabel(unit)}`
        : "";
      return {
        kind: "intervals" as const,
        value: `${iv.reps} × ${distLabel}${paceLabel}`,
        label: iv.workPace ? "work-set target pace" : "work-set structure",
      };
    }
    if (activityType === "race") {
      const secs = elapsed ?? 0;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      const timeStr =
        h > 0
          ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
          : `${m}:${s.toString().padStart(2, "0")}`;
      return {
        kind: "race" as const,
        value: timeStr,
        label:
          distance > 0 ? `Race · ${distanceLabel2(distance, unit)}` : "Race",
      };
    }
    return null;
  })();

  const runPlanCurrentWeek = programState?.runPlan?.currentWeek;
  const runPlanTotalWeeks = programState?.runPlan?.totalWeeks;

  /* When activityType is missing (legacy runs / malformed payload),
     treat as valid. Better to show a real summary than trap the user
     in InvalidRunReview because we can't reason about the mode.

     `invalidReason` is derived alongside `isInvalid` so InvalidRunReview
     can speak truthfully about WHY a run was rejected. 'too-fast' fires
     when the user fat-fingers the manual distance input on a
     treadmill (e.g. types `20` instead of `2.0`); 'too-short' covers
     the original sub-50m / sub-30s thresholds. */
  const invalidReason = activityType
    ? getInvalidRunReason({ activityType, distanceKm, elapsedSeconds })
    : null;
  const isInvalid = invalidReason !== null;
  const outdoorGps = activityType ? isOutdoorGpsRun(activityType) : false;

  /* Run13 item 4 — grade-adjusted pace, DISPLAY-ONLY. Outdoor GPS runs
     with material climb (≥8 m/km, gated in the module) get one calm
     flat-equivalent line under the stat grids. Treadmill / manual runs
     have no real elevation signal, and invalid runs have no pace worth
     adjusting. Feeds nothing — paceTrends / PR flags stay on raw pace. */
  const gap =
    outdoorGps && !isInvalid
      ? gradeAdjustedPace({
          distanceMeters: distance,
          durationSeconds: elapsed,
          elevationGainMeters: elevationGain,
        })
      : null;

  /* Skip the ConfirmDialog gate when the run is already sub-threshold
     — there's nothing meaningful to lose, and adding a second
     confirmation on top of InvalidRunReview's own action stack just
     gates the user out of the only safe exit. Valid runs still hit
     the confirm so a stray Discard tap doesn't blow away real data.
     Plain const, not useCallback — sits below the `if (!state)` early
     return, so a hook call would violate rules-of-hooks. */
  const handleDiscard = () => {
    if (isInvalid) {
      // Phase B3: invalid-run shortcut also clears any persisted
      // snapshot so the discarded run can't be resurrected by the
      // chooser on next /run open.
      if (user?.uid) clearStoredRun(user.uid);
      navigate("/");
    } else {
      setShowDiscardConfirm(true);
    }
  };

  const handleSave = async () => {
    if (
      !user ||
      auth.currentUser?.uid !== user.uid ||
      runOwnerRef.current !== user.uid
    )
      return;
    /* Double-submit guard. The Save button is also disabled while
       saving, but the inline Retry banner can call handleSave again —
       this stops a flap if the user mashes it. */
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    setSaveError(null);

    // The shoe the run's distance goes on: the one picked in RunSetupModal,
    // else the current default. Mileage used to move only for a shoe
    // picked explicitly, so a runner who started on the default saw none.
    const effectiveShoeId = runConfig?.shoeId ?? defaultShoe?.id ?? null;
    try {
      /* Privacy zones come out of the trace before the run is written, as
         the Privacy Policy says. The trace on screen was cut with whatever
         the zone listener had delivered, which is nothing before its first
         answer or after it fails, so a run saved then kept its whole
         trace. The save now waits for zones the server has confirmed: the
         listener's last server answer, else a server read. If neither can
         be had, nothing is written and the Retry banner says why. A run
         with no trace has nothing to cut, and a Retry that resumes a run
         already queued writes no trace again (its zones were cut then). */
      let savedPoints = points;
      if (savedRunId === null && state.points.length > 0) {
        let zones: PrivacyZone[];
        try {
          zones = await confirmPrivacyZones();
        } catch (error) {
          logger.warn("[RunSave] privacy zones unconfirmed:", error);
          throw new Error(PRIVACY_ZONES_UNCHECKED);
        }
        // The trace on screen was cut with these same zones; keep it, so
        // the saved route matches the map.
        if (zones !== privacyZones) {
          savedPoints = applyPrivacyZones(state.points, zones);
        }
        // The wait can outlast the account the run belongs to.
        if (
          auth.currentUser?.uid !== user.uid ||
          runOwnerRef.current !== user.uid
        ) {
          setSaveStatus("idle");
          return;
        }
      }
      /* The save (`completeRun`): the device's copy is queued before any
         server write, under an id a retry keeps. A Retry after the run was
         saved but a later step failed resumes against that id rather than
         writing a second run, which onRunCreated would credit twice
         (challenges, lifetime totals, weekly distance). */
      const completion = completeRun({
        uid: user.uid,
        author: {
          displayName: profile?.displayName,
          photoURL: profile?.photoURL,
        },
        runId: savedRunId ?? runIdRef.current,
        alreadySaved: savedRunId !== null,
        run: {
          points: savedPoints,
          distance,
          elapsed,
          avgPaceSeconds,
          avgPace,
          calories,
          elevationGain,
          splits,
          runConfig,
          intervalData,
          notes,
          relativeEffort,
          paceVerdictTone: paceVerdict?.tone ?? null,
          isInvalid,
          invalidReason: invalidReason ?? null,
          routeQuality: state.routeQuality ?? null,
          workPortion: state.workPortion ?? null,
          shoeId: effectiveShoeId,
          bestEfforts,
        },
        // Loading or unread privacy settings withhold the route.
        route: runPostRoute(savedPoints, {
          withheld: Boolean(privacyZonesLoading || privacyZonesError),
          showEnds: profile?.hideSharedRouteEnds === false,
        }),
        unit,
      });
      const savedId = completion.runId;
      runIdRef.current = savedId;
      setSavedRunId(savedId);
      // A reload of this browser-history entry must reopen the same saved run.
      navigate(".", {
        replace: true,
        state: {
          ...state,
          distance,
          savedRun: {
            uid: user.uid,
            id: savedId,
            notes: notes.trim(),
            relativeEffort,
          },
        },
      });
      // The baseline for "edited since saving" — the values that actually
      // went into the document, not the ones on screen a moment later.
      setSavedFields({ notes: notes.trim(), relativeEffort });

      // Activation funnel: a real saved run, once a run (a resumed save
      // has fired it). A run saved anyway is not one.
      if (!isInvalid && !completion.resumed) trackLifecycle("run_completed");

      // Sharing happens on the finish screen once the run is saved:
      // automatically when the user has said so, or from its share button.
      // A run saved anyway is never offered.
      setShareAction(completion.share);

      // Update shoe mileage against whichever shoe was resolved above —
      // once per run (see mileageAppliedRef).
      if (effectiveShoeId && !mileageAppliedRef.current) {
        mileageAppliedRef.current = true;
        // Shoe bookkeeping must not hold an accepted run's confirmation open.
        void updateMileage(effectiveShoeId, distance / 1000)
          .then((alert) => {
            if (auth.currentUser?.uid !== user.uid || !navigator.onLine) return;
            if (alert === "replace") {
              toast.error(
                "This pair is past its recommended mileage. Consider replacing it.",
                { duration: 5000 }
              );
            } else if (alert === "warning") {
              toast.warning(
                "Your shoes are at 85% of their recommended mileage. Start thinking about a replacement.",
                { duration: 5000 }
              );
            }
          })
          .catch((error) =>
            logger.warn("[RunSave] shoe mileage update failed:", error)
          );
      }

      setSaveStatus("saved");
      setSaveError(null);

      // The complete run is now durable in the retry queue. The active-run
      // snapshot can be cleared without losing the recovery copy.
      if (user?.uid) clearStoredRun(user.uid);

      // ── Phase B1: programme reconciliation ───────────────────────
      // Mark the scheduled run day complete IFF the saved run is a
      // valid, exact-template match of today's planned run. Off-plan
      // runs (different template, rest day, completed day) do NOT
      // complete the day — the user can do the planned run later.
      //
      // Fire-and-forget: the saved-run flow is already complete by
      // PR-J Q2 chunk B2: post-save completeRunDay call dropped.
      // The saved-run write that just happened is the completion
      // signal — the derivation's claim walk picks it up on next
      // useProgram render.

      /* Auto-navigation timeouts (800ms online / 1800ms offline) were
         removed: they teleported the user back to home without their
         consent, often before they could read the confirmation, and
         broke a "review your run" UX entirely. The user now stays on
         the screen until they tap Done. */
    } catch (error) {
      logger.error("[RunSave] Failed:", error);
      const message =
        error instanceof Error ? error.message : "Failed to save run";
      setSaveStatus("error");
      setSaveError(message);
      /* Toast still fires as supplementary feedback for users who
         scrolled away or have the app backgrounded; the inline retry
         banner above the action row is the durable affordance. */
      toast.error("Failed to save run. Tap Retry below.");
    } finally {
      savingRef.current = false;
    }
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleExportGPX = () => {
    if (privacyZonesLoading || privacyZonesError) {
      toast.error("Couldn't check your privacy settings. Try again");
      return;
    }
    // Track name travels into other apps with the export — a stable
    // "22 Aug 2026", not whatever the device locale renders.
    const gpx = toGPX(points, `Tropos Run ${formatDayMonthYear(new Date())}`);
    /* The share sheet on the iPhone, where a blob download is dropped
       without a word, and a download on the web; the same handover and
       the same words as RunDetail's Export GPX. */
    void shareGpx(gpx, `tropos-run-${Date.now()}.gpx`).then(announceRouteShare);
  };

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      // Outside Layout, so it pads for the status bar itself.
      style={{
        paddingTop: "var(--safe-top)",
        paddingBottom: "var(--page-bottom-pad)",
      }}
    >
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 min-h-[44px]"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
      </div>

      {isInvalid ? (
        /* InvalidRunReview supplies its own title + body + action stack
           and is the entire visible content for sub-threshold runs. The
           weak `distance===0 && elapsed<30 && !saved` warning that
           previously lived here is gone — InvalidRunReview replaces it
           and gates correctly on actual thresholds (50m / 30s) instead
           of the both-conditions-must-be-true bypass. */
        <InvalidRunReview
          unit={unit}
          distanceKm={distanceKm}
          elapsedSeconds={elapsedSeconds}
          formatTime={formatTime}
          outdoorGps={outdoorGps}
          reason={invalidReason ?? "too-short"}
          saveStatus={saveStatus}
          saveError={saveError}
          isOnline={isOnline}
          pendingSync={pendingSync}
          /* Edit distance only for treadmill / manual — outdoor
             GPS distance came from a sensor, no typo to fix. */
          canEditDistance={
            activityType === "treadmill" || activityType === "manual"
          }
          onSave={handleSave}
          onDiscard={handleDiscard}
          onDone={() => navigate("/")}
          onEditDistance={(newDistanceMeters) =>
            setEditedDistanceMeters(newDistanceMeters)
          }
        />
      ) : (
        <>
          {/* DS3: the finish leads with the map and the distance, the way
              the run detail does. The route map comes first, coloured by
              pace when there is an average to colour it against, and its
              key sits under it, outside the map's rounded frame. Without
              an average the map draws a plain line and there is nothing
              for a key to explain. */}
          {points.length > 1 && (
            <div className="mx-4 mb-4">
              <div className="rounded-2xl overflow-hidden">
                <RunMap
                  points={points}
                  currentPoint={null}
                  interactive={true}
                  distanceMarkers={true}
                  markerUnit={unit}
                  height="h-64"
                  paceColored={avgPaceSeconds > 0}
                  avgPaceSecPerKm={avgPaceSeconds}
                  darkMode={!!profile?.darkMode}
                />
              </div>
              {avgPaceSeconds > 0 && <PaceLegend className="px-1" />}
            </div>
          )}

          <div className="pb-4 px-4">
            <h1 className="text-base font-bold text-running-strong">
              {heroCopy}
            </h1>
            {/* The distance is the page's one big number, in the reader's
                unit. It was a tile reading km whatever the unit setting
                said, beside a pace that also ignored it. */}
            <p className="mt-1 text-display font-extrabold font-mono tabular-nums leading-none text-foreground">
              {distanceValue(distance, unit, 2)}{" "}
              <span className="font-sans text-h3 font-bold text-muted-foreground">
                {distanceUnitLabel(unit)}
              </span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {/* en-GB, like every other dated surface in the app. This
                  was one of two rendered dates still pinned to en-US. */}
              {new Date().toLocaleDateString("en-GB", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            {/* Plan-vs-actual pace verdict — coral for the running domain,
                calm register (never shames a slow day). */}
            {paceVerdict && (
              <p className="mt-3 text-sm leading-relaxed rounded-xl px-3 py-2 bg-running/6 border border-running/15 text-foreground">
                {paceVerdict.line}
              </p>
            )}

            {/* The run half of the completion delight beat. The lift side
                (SessionCompleteScreen) has shipped `getVolumeComparison`
                since the module landed; the distance twin was written at
                the same time and never wired, so only lifters got it —
                an odd gap in an app whose identity is hybrid. Lives in
                the VALID branch, so a sub-threshold GPS glitch never
                claims "4 Great Wall sections". */}
            {funComparison && (
              <p className="mt-2 text-sm text-muted-foreground">
                {funComparison}
              </p>
            )}
          </div>

          {/* Offline notice */}
          {!isOnline && !saved && (
            <div
              className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
              /* The label below is text-warning-strong, which flips
                 with the theme; this tint was frozen amber-500 (the
                 DARK --warning value), so in light mode a theme-aware
                 label sat on a dark-mode ground. Same token now. */
              style={{
                background: "hsl(var(--warning) / 0.12)",
                border: "1px solid hsl(var(--warning) / 0.25)",
              }}
            >
              <WifiOff size={20} className="text-warning-strong" />
              <div>
                <p className="font-medium text-warning-strong text-xs">
                  You're offline
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Run will sync automatically when you reconnect
                </p>
              </div>
            </div>
          )}

          {/* Saved confirmation */}
          {saved && (
            <div
              className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
              /* Was emerald-400 (#34D399) — stock Tailwind, never a
                 Tropos green — under a text-success-strong label. */
              style={{
                background: "hsl(var(--success) / 0.12)",
                border: "1px solid hsl(var(--success) / 0.25)",
              }}
            >
              <CheckCircle size={20} className="text-success-strong" />
              <div>
                <p className="font-medium text-success-strong text-xs">
                  {pendingSync
                    ? isOnline
                      ? "Saved on this phone · waiting to sync"
                      : "Saved locally — will sync when online"
                    : "Run saved"}
                </p>
              </div>
            </div>
          )}

          {/* Post-completion kudos (Phase 2) — after the run is banked, if
              someone the user follows also trained today. Renders nothing
              otherwise; once/day; dismissible. */}
          {saved && (
            <Suspense fallback={null}>
              <SavedRunKudos uid={user?.uid} fromName={profile?.displayName} />
            </Suspense>
          )}

          {/* P3-1: save-time mismatch reconciliation.
          Fires only when the saved run is off-plan AND points at a
          still-planned scheduled slot. A run that matches its planned
          day completes it through the claims (useClaimMapForProgram), with no
          write here; this is the "you did something else, what should
          the scheduled slot do?" dialog. State is local to this
          RunSummary mount.

          Conditions for the card to appear:
            - run was saved successfully (saved === true)
            - run is valid (the invalid-save banner handles those)
            - planMetadata indicates a real plan context (mode !== freeform,
              scheduledRunId or plannedRunDayIndex present)
            - planMetadata.offPlan === true (mismatch occurred)
            - the scheduled run is still in `planned` status (no point
              reconciling a terminal-state day)
            - the user hasn't picked an option yet (reconciliation
              still 'pending') */}
          {saved &&
            !isInvalid &&
            reconciliation === "pending" &&
            (() => {
              const m = runConfig?.planMetadata;
              if (!m) return null;
              if (m.planMode === "freeform") return null;
              if (!m.offPlan) return null;
              const refKey = m.scheduledRunId ?? m.plannedRunDayIndex;
              if (refKey === null || refKey === undefined) return null;
              // Resolve current scheduled-run status from programState. If
              // the runDay is already terminal (completed / skipped / etc.)
              // there's nothing to reconcile — the user must have already
              // resolved it elsewhere (Week tab overflow, for instance).
              const runDay = programState?.runDays?.find((rd) =>
                typeof refKey === "string"
                  ? rd.id === refKey
                  : rd.dayIndex === refKey
              );
              if (runDay && runDay.status && runDay.status !== "planned")
                return null;

              const plannedTypeLabel = m.plannedTemplateType ?? "planned run";

              return (
                <div
                  className="mx-4 mb-4 p-4 rounded-2xl space-y-3"
                  /* The orange here is D19's collision in the other
                     direction: #D9884E is semantic.nutrition, the FOOD
                     identity, on a run-reconciliation prompt. The
                     meaning is "this needs your attention" — warning. */
                  style={{
                    background: "hsl(var(--warning) / 0.10)",
                    border: "1px solid hsl(var(--warning) / 0.30)",
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Off-plan save
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {`This didn't match today's ${plannedTypeLabel}. What should happen to the planned run?`}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      disabled={reconciliationBusy}
                      onClick={async () => {
                        setReconciliationBusy(true);
                        try {
                          // PR-J Q2 chunk B2: reconciliation now writes
                          // to manualCompletions (Q2 P11) instead of
                          // setting status=completed_exact. The slot's ✅
                          // derives from the OR over (saved-run match,
                          // manual map, legacy status) per Q1 P27.
                          // `refKey` is the runDay.id when present; the
                          // dayIndex fallback was a pre-PR-J overload, so a
                          // legacy key completes the slot this card found.
                          // "Marked complete" only when it was: a refusal
                          // (a race completes by logging it) is said by the
                          // writer, and the card stays.
                          const runDayId =
                            typeof refKey === "string" ? refKey : runDay?.id;
                          if (!runDayId) return;
                          const outcome = await markManualComplete(runDayId);
                          if (changeStands(outcome))
                            setReconciliation("completed");
                        } catch (err) {
                          logger.warn(
                            "[RunSummary] reconciliation: markManualComplete failed:",
                            err
                          );
                        } finally {
                          setReconciliationBusy(false);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                      /* --success-strong is the step tuned to clear
                         4.5:1 on a tint of its own colour, which is
                         exactly this button; the raw emerald it
                         replaces was never contrast-checked. */
                      style={{
                        background: "hsl(var(--success) / 0.20)",
                        color: "hsl(var(--success-strong))",
                      }}
                    >
                      Mark scheduled run complete
                    </button>
                    <button
                      type="button"
                      disabled={reconciliationBusy}
                      onClick={async () => {
                        setReconciliationBusy(true);
                        try {
                          const outcome = await skipRunDay(refKey);
                          if (changeStands(outcome))
                            setReconciliation("skipped");
                        } catch (err) {
                          logger.warn(
                            "[RunSummary] reconciliation: skipRunDay failed:",
                            err
                          );
                        } finally {
                          setReconciliationBusy(false);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl text-sm font-medium bg-muted text-foreground disabled:opacity-50"
                    >
                      Skip scheduled run
                    </button>
                    <button
                      type="button"
                      disabled={reconciliationBusy}
                      onClick={() => {
                        setReconciliation("dismissed");
                        // Persist so re-mounts of this same saved run
                        // don't re-prompt. Same key the dismissal read
                        // above uses.
                        // Storage unavailable — the dismissal still
                        // sticks for this mount via React state; it just
                        // won't survive a re-mount. Acceptable degraded
                        // mode.
                        if (savedRunId) {
                          writeString(
                            `tropos:reconcileDismissed:${savedRunId}`,
                            "1"
                          );
                        }
                      }}
                      className="w-full py-2 text-xs text-muted-foreground disabled:opacity-50"
                    >
                      Leave open (decide later)
                    </button>
                  </div>
                </div>
              );
            })()}

          {/* P3-1: post-reconciliation confirmation pill. Replaces the
          prompt once the user picks an option so they get clear
          feedback that the choice landed. Auto-fades visually by
          living in the same flow position as the prompt. */}
          {saved &&
            !isInvalid &&
            (reconciliation === "completed" ||
              reconciliation === "skipped") && (
              <div
                className="mx-4 mb-4 px-4 py-2.5 rounded-xl text-xs"
                style={{
                  background: "hsl(var(--muted) / 0.5)",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {reconciliation === "completed"
                  ? "Scheduled run marked complete."
                  : "Scheduled run skipped."}
              </div>
            )}

          {/* The context-aware primary stat, for intervals and races
              only, above the stats card of four. A race's is its time,
              under the distance headline at the top of the page. Every
              other run goes from the headline to the stats card. */}
          {primaryStat && (
            <div className="mx-4 mb-3 p-4 rounded-2xl text-center card-shadow bg-running/8">
              <p className="text-3xl font-extrabold font-mono tabular-nums leading-tight text-running">
                {primaryStat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {primaryStat.label}
              </p>
            </div>
          )}

          {/* Stats (DS3): time, pace, calories and climb in one card of
              four, the distance having moved up to the headline. Each
              figure is plain: pace was the hydration teal and calories the
              success green, colour spent on nothing. */}
          <div className="px-4 mb-4">
            <RunStatGrid
              stats={[
                { label: "Time", value: formatTime(elapsed) },
                {
                  label: "Average pace",
                  value: paceMinSec(avgPaceSeconds, unit),
                  unit: paceUnitLabel(unit),
                },
                {
                  label: "Calories",
                  value: formatCalories(calories),
                  unit: CALORIE_UNIT,
                },
                {
                  label: "Elevation gain",
                  value: elevationLabel(elevationGain, unit, false),
                  unit: elevationUnitLabel(unit),
                },
              ]}
            />
          </div>

          {/* Grade-adjusted pace — one calm line, only when the climb was
              material (Run13 item 4, display-only). */}
          {gap && (
            <p className="px-4 -mt-2 mb-4 text-center text-xs text-muted-foreground">
              Grade-adjusted pace{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {paceMinSec(gap.gapSecondsPerKm, unit)}
              </span>{" "}
              {paceUnitLabel(unit)} — flat-equivalent for this climb
            </p>
          )}

          {/* Rev1 PR2 — what this run did to your week. The card reads the
              week when this screen opens, which is before Save, so it is
              handed this run to count; once saved, the id keeps it from
              being counted twice. Null while loading; no jank. */}
          <div className="px-4 mb-4">
            <Suspense fallback={null}>
              <WeekPulseView pulse={weekPulse} />
            </Suspense>
          </div>

          {/* Pace Trend Badge + Run8-Vocab Adherence chip.
              Adherence chip surfaces "Planned" / "Custom" / "Extra"
              against the user's plan when planMetadata is present
              (null for freeform / legacy runs — chip hidden). Sits
              alongside the pace-trend badge in the same centered
              row so the user reads both signals together. */}
          {((paceTrend && paceTrend.trend !== "no-data") || adherenceLabel) && (
            <div className="mx-4 mb-4 flex justify-center flex-wrap gap-2">
              {paceTrend && paceTrend.trend !== "no-data" && (
                <span
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold ${paceTrend.className}`}
                >
                  {paceTrend.trend === "pr" && (
                    /* Inherits the badge's --achievement-strong rather
                       than carrying the identity: the gold identity is
                       the weakest of the semantic set (2.91:1 on a /15
                       chip, per index.css) and this icon sits inside a
                       tint of its own colour. */
                    <Trophy size={16} />
                  )}{" "}
                  {paceTrend.label}
                </span>
              )}
              {adherenceLabel && (
                /* Same row, same 14px semibold, and all three chips
                   were short. "Extra" painted the raw --running
                   IDENTITY as small text, which tokenContrast.test.ts
                   pins at only the 3:1 LARGE-text bar ("fixed
                   identity, large text only") — it takes the coral AA
                   step now. "Planned" had the right text step on a
                   frozen hex tint. "Custom" was --muted-foreground on
                   a /10 tint OF ITSELF: 4.06:1 on the page canvas,
                   4.49:1 on muted, because a tint of the text colour
                   can only eat into its own contrast. It sits on
                   --muted, the house raised-tile surface, at 5.10:1.
                   `text-foreground` there would have been 15:1, making
                   the least notable state the loudest label in the
                   row; the other chips land at 4.50-4.82, so this
                   keeps the three even. Tints are classes now, so
                   tokenContrast measures the two stepped ones. */
                <span
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold ${
                    adherenceLabel === "Extra"
                      ? "bg-running/10 text-running-strong"
                      : adherenceLabel === "Custom"
                        ? "bg-muted text-muted-foreground"
                        : "bg-success/10 text-success-strong"
                  }`}
                  aria-label={`Plan adherence: ${adherenceLabel}`}
                >
                  {adherenceLabel}
                </span>
              )}
            </div>
          )}

          {/* Run8 PR3c — the plan row: this week's runs against the
              plan's, from the same read as the card above, so the two
              cannot disagree, and a race plan's week. It shows only while
              the plan has runs this week: a free runner's week is
              done-only (Run9a). */}
          {weekPulse?.runs && weekPulse.runs.planned !== null && (
            <div className="mx-4 mb-4 px-3 py-2.5 rounded-xl bg-card border border-border/40 flex items-center justify-center gap-1.5 text-xs">
              {profile?.runMode === "race_prep" &&
                runPlanTotalWeeks &&
                runPlanCurrentWeek != null && (
                  <>
                    <span className="font-semibold text-foreground">
                      Week {runPlanCurrentWeek + 1} of {runPlanTotalWeeks}
                    </span>
                    <span className="text-muted-foreground">·</span>
                  </>
                )}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {weekPulse.runs.count}
              </span>
              <span className="text-muted-foreground">of</span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {weekPulse.runs.planned}
              </span>
              <span className="text-muted-foreground">runs this week</span>
              {saved &&
                isVolumeEligible({
                  distance,
                  duration: elapsed,
                  isInvalid,
                }) && (
                  <span
                    className="ml-1 text-xs font-semibold"
                    style={{ color: THEME.success }}
                    aria-label="this run counts"
                  >
                    +1 ✓
                  </span>
                )}
            </div>
          )}

          {/* Best efforts: the quickest 1K / 5K / 10K anywhere in the
              track. The same card a saved run shows. */}
          {bestEfforts.length > 0 && (
            <div className="px-4 mb-4">
              <BestEffortsCard efforts={bestEfforts} />
            </div>
          )}

          {/* Splits: one table, lap, pace and climb, with a bar per lap
              for its speed, and the only view of the laps here. A saved
              run shows the same table. */}
          {displaySplits.length > 0 && (
            <div className="px-4 mb-4">
              <SplitsTable
                splits={displaySplits}
                lapUnit={lapUnit}
                unit={unit}
              />
            </div>
          )}

          {/* Elevation profile */}
          {points.length > 0 && (
            <div className="px-4 mb-4">
              <ElevationProfile points={points} accentColor={THEME.running} />
            </div>
          )}

          {/* Actions — the inline "Share to feed" toggle was replaced by
          the ShareComposerSheet that opens after Save. The composer
          covers the same surface (feed visibility + remembered default)
          plus optional caption, so duplicating the toggle here would
          be confusing. */}
          <div className="px-4 space-y-2">
            {/* RUN-03: optional one-tap effort check-in. Hidden for invalid
                runs (nothing meaningful to calibrate against). Skippable —
                null is a first-class answer, so no segment starts selected
                and saving without touching it is fine. The notes field
                below keeps free text but no longer owns "how did it feel". */}
            {!isInvalid && (
              <div className="space-y-1.5">
                <SectionHeading size="compact" className="px-1">
                  How did it feel?
                </SectionHeading>
                <SegmentedControl
                  options={[
                    { value: "easier", label: "Easier" },
                    { value: "matched", label: "About right" },
                    { value: "harder", label: "Harder" },
                  ]}
                  value={relativeEffort}
                  onChange={(v) =>
                    // Tap the selected segment again to clear (back to skipped).
                    setRelativeEffort((cur) => (cur === v ? null : v))
                  }
                  ariaLabel="How did this run feel compared to what you expected?"
                  tone="running"
                />
              </div>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this run..."
              aria-label="Run notes"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-muted text-sm text-foreground placeholder:text-muted-foreground resize-none"
            />

            {canShowRetrySave({ saveStatus }) && (
              /* Same RetryBanner used by InvalidRunReview — durable
             affordance for save failures. Toast still fires but can be
             hidden behind Safari PWA bottom chrome; the banner sits in
             the action row where the user is already looking. */
              <RetryBanner error={saveError} onRetry={handleSave} />
            )}

            {/* A manually-entered distance is a TYPED number, so it can be
                wrong by any amount — 5 km for a 6 km treadmill run is as
                wrong as it gets while still looking ordinary. The
                invalid-run review cannot serve this: it needs the number
                to breach a threshold before it appears, which is exactly
                what a plausible typo does not do.
                Outdoor GPS is excluded: that distance came from a sensor,
                and there is no typo to fix. Pre-save only — afterwards the
                figure is on the account and correcting it is a different
                operation. */}
            {(activityType === "treadmill" || activityType === "manual") &&
              canShowNormalSave({ isInvalid: false, saveStatus }) && (
                <EditDistance
                  unit={unit}
                  distanceKm={distanceKm}
                  onCommit={setEditedDistanceMeters}
                />
              )}

            {canShowNormalSave({ isInvalid: false, saveStatus }) && (
              <Button
                variant="sport"
                fullWidth
                onClick={handleSave}
                loading={saveStatus === "saving"}
              >
                Save run
              </Button>
            )}

            {/* Pace insight (Pro) — surfaced at the post-run decision moment,
                before navigation. Only in this valid-run post-save stack;
                explicit approve/dismiss, never a silent benchmark change. */}
            {saved && paceInsight.insight && (
              <PaceInsightCard
                insight={paceInsight.insight}
                onAccept={paceInsight.accept}
                onDismiss={paceInsight.dismiss}
              />
            )}

            {saved &&
              (() => {
                const next = programState?.runDays
                  ?.filter(
                    (day) =>
                      day.date &&
                      day.date > localDateString() &&
                      !day.completed &&
                      day.status !== "skipped" &&
                      day.status !== "race_no_show"
                  )
                  .sort((a, b) => a.date!.localeCompare(b.date!))[0];
                if (!next?.date) return null;
                const template = RUN_TEMPLATES.find(
                  (template) =>
                    template.id === (next.userOverride ?? next.templateId)
                );
                if (!template) return null;
                return (
                  <p className="text-sm text-muted-foreground">
                    Next run: {template.name} —{" "}
                    {new Date(`${next.date}T12:00:00`).toLocaleDateString(
                      "en-GB",
                      { weekday: "long" }
                    )}
                  </p>
                );
              })()}
            {saved && <CompletionExtras share={shareAction} />}

            {/* The save action the post-save fields never had. It appears
                only once they differ from what was written, so a user who
                changes nothing sees the same two-button stack as before —
                and one who corrects a note is not left with Done as the
                only way out, which discarded the correction. */}
            {notesDirty && (
              <Button
                variant="secondary"
                fullWidth
                onClick={handleUpdateFields}
                loading={updating}
              >
                Save changes
              </Button>
            )}

            {canShowDone({ saveStatus }) && (
              /* Replaces the removed auto-navigation timeouts. Sits in the
             same primary-action slot as Save run so the user's eye
             doesn't move when the state transitions saved → saved. */
              <button
                type="button"
                onClick={() => navigate("/program?tab=run")}
                className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                style={{
                  background: `${THEME.success}20`,
                  color: THEME.success,
                  border: `1px solid ${THEME.success}4d`,
                }}
              >
                <CheckCircle size={16} aria-hidden="true" />
                Done
              </button>
            )}

            {canShowDone({ saveStatus }) && (
              /* FOOD-02: post-run → Food handoff, at the moment the runner
                 has refuel intent. Secondary and skippable — routes into
                 the EXISTING composer flow with a narrow context param
                 (Food renders a dismissible refuel line); no separate
                 recovery-meal flow, no target change. Only rendered in the
                 valid-run path (this whole stack is), post-save. */
              <button
                type="button"
                onClick={() => navigate("/food?context=post-run")}
                className="w-full py-3 rounded-xl bg-card text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
              >
                Log recovery food
              </button>
            )}

            {canShowDone({ saveStatus }) && isPlannedSession && user && (
              /* CIRCLE-SESSION-01 — explicit summary-only Circle share
                 for PLANNED runs only. The sheet publishes just the
                 `session_completed` event (privacy-fenced) — never
                 distance, pace, route or any other number. */
              <Button
                variant="sport-tinted"
                fullWidth
                onClick={() => setCircleShareOpen(true)}
              >
                Share to circle
              </Button>
            )}

            {(() => {
              /* Races plan PR4 — post-race share into the race's
                 community space. Offered ONLY for a saved race-type
                 run when the user's goal carries a catalogue binding
                 that resolves to a real race space. Navigation only
                 (?compose=1 opens the space composer once membership
                 allows) — nothing is posted without an explicit
                 write in the space. */
              if (!canShowDone({ saveStatus }) || activityType !== "race")
                return null;
              const raceSpace = profile?.raceGoal?.eventSpaceId
                ? spaceDef(profile.raceGoal.eventSpaceId)
                : undefined;
              if (raceSpace?.kind !== "race") return null;
              return (
                <button
                  type="button"
                  onClick={() => navigate(`/space/${raceSpace.id}?compose=1`)}
                  className="w-full py-3 rounded-xl bg-card text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
                >
                  Post in {raceSpace.name} community
                </button>
              );
            })()}

            {(() => {
              /* Share + Export GPX gated together so the wrapping flex row
             collapses to nothing when neither is renderable (e.g. a
             treadmill run pre-save → both hidden). Treadmill never
             shows GPX (no track to export); both only show after
             saveStatus === 'saved'. */
              const showShare = canShowShare({ isInvalid: false, saveStatus });
              const showGpx = canExportGpx({
                isInvalid: false,
                isOutdoorGpsRun: outdoorGps,
                saveStatus,
              });
              if (!showShare && !showGpx) return null;
              return (
                <div className="flex gap-2">
                  {showGpx && (
                    <button
                      type="button"
                      onClick={handleExportGPX}
                      className="flex-1 py-3 rounded-xl bg-card text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
                    >
                      Export GPX
                    </button>
                  )}
                  {showShare && (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex-1 py-3 rounded-xl bg-card text-sm font-medium text-foreground active:scale-[0.97] transition-transform"
                    >
                      Share
                    </button>
                  )}
                </div>
              );
            })()}
            {canShowDiscard({ saveStatus }) && (
              <button
                type="button"
                onClick={handleDiscard}
                className="w-full py-2 text-sm text-destructive-strong"
              >
                Discard
              </button>
            )}
          </div>
        </>
      )}

      {/* CIRCLE-SESSION-01 — lazily mounted: zero Goal Space reads
          unless the user explicitly opens the share flow. */}
      {user && circleShareOpen && (
        <CircleShareSheet
          open
          onOpenChange={setCircleShareOpen}
          uid={user.uid}
        />
      )}

      {/* S1 share-card system — customization sheet + new renderer */}
      <ShareCardSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        data={{
          template: "run",
          handle: profile?.displayName || "Athlete",
          date: new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
          points: privacyZonesLoading || privacyZonesError ? [] : points,
          distanceKm: distance / 1000,
          durationSec: elapsed,
          paceSecPerKm: avgPaceSeconds,
          elevationM: elevationGain ?? undefined,
          splits: displaySplits.map((s) => ({
            lap: s.km,
            paceSecPerKm: s.paceSeconds,
          })),
        }}
      />

      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard this run?"
        description="This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          if (user?.uid) clearStoredRun(user.uid);
          navigate("/");
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
