import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import WeekPulseCard from "@/components/WeekPulseCard";
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { addDocGuarded } from "@/lib/firestoreWrite";
import { db } from "../lib/firebase";
import { localDateString, localWeekKey } from "../lib/dateHelpers";
import { useAuth } from "../lib/auth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { usePostCompletionKudos } from "../hooks/usePostCompletionKudos";
import PostCompletionKudos from "../components/social/PostCompletionKudos";
import { logger } from "../lib/logger";
import {
  calculatePace,
  detectBestEfforts,
  toGPX,
  estimateRunCalories,
} from "../lib/gps";
import { postActivity } from "../lib/socialApi";
import { compose, enqueueShare, showQueuedToast } from "../lib/shareComposer";
import type { GPSPoint, Split } from "../lib/gps";
import type { RunConfig } from "../components/run/RunSetupModal";
import RunMap from "../components/run/RunMapLazy";
import PaceLegend from "../components/run/PaceLegend";
import SegmentedControl from "../components/ui/SegmentedControl";
import SplitsBarChart from "../components/analytics/SplitsBarChart";
import ElevationProfile from "../components/analytics/ElevationProfile";
import ShareCardSheet from "@/components/share/ShareCardSheet";
import { THEME } from "../lib/theme";
import { calculatePaceTrend, type PaceTrendResult } from "../lib/paceTrends";
import PaceInsightCard from "../components/run/PaceInsightCard";
import {
  usePaceInsightFromRuns,
  type PaceInsightRun,
} from "../hooks/usePaceInsight";
import { usePrivacyZones } from "../hooks/usePrivacyZones";
import { applyPrivacyZones } from "../lib/privacyZones";
import { clipRouteEnds, DEFAULT_CLIP_METERS } from "../lib/shareCard/polyline";
import { useShoes } from "../hooks/useShoes";
import { useProgram } from "../features/program/useProgram";
import {
  freeformPlanMetadata,
  getAdherenceLabel,
  shouldCompleteRunDay,
} from "../lib/runPlanMetadata";
import { RUN_TEMPLATES } from "../lib/workoutTemplates";
import {
  paceTableFromFitness,
  resolveSessionPaces,
  raceDistanceKeyFromKm,
} from "../lib/runPaces";
import { resolvePaceVerdict } from "../lib/paceVerdict";
import { paceMinSec } from "../lib/runLabels";
import { useRunningStats } from "../hooks/useRunningStats";
import { getWeeklyRunTarget } from "../lib/scheduleUtils";
import { isVolumeEligible, isPaceEligible } from "../lib/runStatsEligibility";
import { clearStoredRun } from "../lib/runResumeStorage";
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
import {
  formatSecondsPerKm,
  gradeAdjustedPace,
} from "../lib/gradeAdjustedPace";

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
        <p className="font-medium text-running">Couldn&apos;t save your run</p>
        <p className="mt-0.5 text-muted-foreground">
          {error || "We couldn't save this run."}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-running"
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
interface InvalidRunReviewProps {
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
  distanceKm,
  elapsedSeconds,
  formatTime,
  outdoorGps,
  reason,
  saveStatus,
  saveError,
  isOnline,
  canEditDistance,
  onSave,
  onDiscard,
  onDone,
  onEditDistance,
}: InvalidRunReviewProps) {
  const formattedDuration = formatTime(elapsedSeconds);
  const formattedDistance = `${distanceKm.toFixed(2)}km`;
  const showSaveAnyway = canShowSaveAnyway({ isInvalid: true, saveStatus });
  const showDiscard = canShowDiscard({ saveStatus });
  const showRetry = canShowRetrySave({ saveStatus });
  const showDone = canShowDone({ saveStatus });
  const isSaved = saveStatus === "saved";

  /* Edit-distance state lives on the InvalidRunReview itself so
     the rest of RunSummary doesn't have to know about the
     in-progress edit until it commits. Pre-fills with the current
     distance so users can adjust rather than re-enter. Validates
     against the same 0.05km floor as TreadmillMode. */
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(() =>
    distanceKm.toFixed(2)
  );
  const editValueNum = Number(editValue);
  const editValid =
    Number.isFinite(editValueNum) &&
    editValueNum >= 0.05 &&
    editValueNum <= 100;
  const startEditing = () => {
    setEditValue(distanceKm.toFixed(2));
    setEditing(true);
  };
  const commitEdit = () => {
    if (!editValid) return;
    onEditDistance(editValueNum * 1000);
    setEditing(false);
  };

  /* Heading + body are reason-aware before save and saved-aware after.
     Once the run is on the user's account the warning-style copy
     would mislead — the run isn't being rejected, it's been saved.
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
    ? "We've kept this run on your account."
    : reason === "too-fast"
      ? `We recorded ${formattedDuration} and ${formattedDistance}. The implied pace looks unrealistic — did you mean a different distance?`
      : outdoorGps
        ? `We recorded ${formattedDuration} and ${formattedDistance}. This may have happened before GPS locked.`
        : `We recorded ${formattedDuration} and ${formattedDistance}. This is below the minimum distance or duration for a normal summary.`;

  return (
    <div className="mx-4 mt-3 mb-6 p-4 rounded-2xl bg-card space-y-3">
      {/* aria-live wraps both heading and body so VoiceOver announces
          the saved transition as a unit ("Saved. We've kept this run
          on your account.") rather than just the heading change. */}
      <div className="space-y-1.5" aria-live="polite">
        <p className="text-base font-semibold text-foreground">{heading}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {bodyCopy}
        </p>
      </div>

      {showRetry && <RetryBanner error={saveError} onRetry={onSave} />}

      {showDone && (
        <div className="space-y-3 pt-1">
          {/* Drop the redundant online "Saved anyway." note now that
              the heading is the authoritative saved state. The
              offline variant stays — it conveys real sync status the
              heading copy doesn't. */}
          {!isOnline && (
            <p className="text-xs text-muted-foreground text-center">
              Saved locally — will sync when online.
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
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-muted text-foreground border border-border"
            >
              Edit distance
            </button>
          ) : (
            <div className="p-3 rounded-xl border border-border bg-muted/40 space-y-2">
              <label
                htmlFor="edit-distance"
                className="text-xs text-muted-foreground"
              >
                Distance (km)
              </label>
              <input
                id="edit-distance"
                type="number"
                step="0.01"
                min="0.05"
                max="100"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-center"
              />
              {!editValid && editValue !== "" && (
                <p className="text-xs" style={{ color: THEME.running }}>
                  Distance must be between 0.05km and 100km.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground border border-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitEdit}
                  disabled={!editValid}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ background: THEME.lifting }}
                >
                  Update
                </button>
              </div>
            </div>
          )}
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
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-destructive/10 text-destructive border border-destructive/20"
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
}

export default function RunSummary() {
  const { state } = useLocation() as { state: RunData };
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { zones: privacyZones } = usePrivacyZones();
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
  // Run8 PR3c — this-week run count for the plan-progress row. Hook
  // must sit above the early-return guard at line ~470 to satisfy
  // rules-of-hooks. Used further below in the component body.
  const { runs: weekRunsRaw } = useRunningStats(7);
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
  const [savedRunId, setSavedRunId] = useState<string | null>(null);

  // Pull dismissal state from localStorage whenever the saved-run
  // id arrives. The doc id is the natural unique key — different
  // off-plan runs for the same scheduled slot still each get one
  // prompt-then-quiet cycle.
  useEffect(() => {
    if (!savedRunId) return;
    try {
      const flag = localStorage.getItem(
        `tropos:reconcileDismissed:${savedRunId}`
      );
      if (flag === "1") setReconciliation("dismissed");
    } catch {
      // localStorage might be unavailable (private mode, blocked).
      // Fall through silently — the prompt re-fires per mount;
      // user can dismiss again. Same end state, just one extra
      // tap in the rare error path.
    }
  }, [savedRunId]);
  const [shareOpen, setShareOpen] = useState(false);
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = saveStatus === "saved";
  // Phase 2 — post-completion kudos. Only after the run is actually saved
  // (the achievement is banked), and only if someone the user follows also
  // trained today. Once/day, dismissible.
  const kudos = usePostCompletionKudos({
    uid: user?.uid,
    fromName: profile?.displayName,
    enabled: saved,
  });
  const [paceTrend, setPaceTrend] = useState<PaceTrendResult | null>(null);
  // The historical run list, reused for BOTH the pace-trend badge and the
  // Pro pace-insight card — one query, two consumers (no extra Firestore read).
  const [paceHistory, setPaceHistory] = useState<PaceInsightRun[]>([]);
  const [paceHistoryLoading, setPaceHistoryLoading] = useState(true);
  const [notes, setNotes] = useState("");
  /* RUN-03: optional one-tap post-run effort signal ("how did it feel vs
     what you expected?"). Structured so the engine can later distinguish
     "completed, felt easy" from "completed, too hard" — notes no longer
     carry the whole reflection burden. Null = skipped (never required).
     Deliberately NOT fed into the Performance Index / trainingLoad (that
     would need the trainingLoad-standalone lock revisited); v1 is a stored
     calibration signal only. */
  const [relativeEffort, setRelativeEffort] = useState<
    "easier" | "matched" | "harder" | null
  >(null);
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
  useEffect(() => {
    if (!uid || !state) return;
    let cancelled = false;
    setPaceHistoryLoading(true);
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", uid, "runs"),
            orderBy("completedAt", "desc")
          )
        );
        const allRuns: PaceInsightRun[] = snap.docs.map((d) => {
          const data = d.data();
          const completedAt = data.completedAt?.toDate?.();
          return {
            id: d.id,
            distance: data.distance ?? 0,
            duration: data.duration ?? 0,
            avgPace: data.avgPace ?? 0,
            completedAt:
              completedAt instanceof Date &&
              Number.isFinite(completedAt.getTime())
                ? completedAt
                : null,
            /* Source / validity fields plumbed through so paceTrends
               can exclude treadmill / manual / invalid / savedAnyway
               records — a treadmill 2:38/km can't masquerade as a PR
               against historical outdoor runs. */
            activityType: data.activityType,
            isInvalid: data.isInvalid,
            savedAnyway: data.savedAnyway,
          };
        });
        if (cancelled) return;
        setPaceHistory(allRuns);
        const currentRun = {
          distance: state.distance,
          avgPace:
            state.elapsed > 0 && state.distance > 0
              ? (state.elapsed / state.distance) * 1000
              : 0,
          completedAt: new Date(),
          activityType: state.runConfig?.activityType,
        };
        setPaceTrend(
          calculatePaceTrend(
            currentRun,
            allRuns.filter(
              (run): run is PaceInsightRun & { completedAt: Date } =>
                run.completedAt instanceof Date
            )
          )
        );
      } catch (err) {
        if (cancelled) return;
        logger.error("[RunSummary] pace-history load failed", err);
        setPaceHistory([]);
      } finally {
        if (!cancelled) setPaceHistoryLoading(false);
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

  if (!state) {
    navigate("/");
    return null;
  }

  const {
    points: rawPoints,
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
  const points = applyPrivacyZones(rawPoints, privacyZones);
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
    if (!sized) return (distance || 0) > 0 ? "Run saved" : "Run recorded";
    if (heroTemplateName && adherenceLabel === "Planned") {
      return `${heroTemplateName} complete ✓`;
    }
    if (heroTemplateName && adherenceLabel === "Custom") {
      return `${heroTemplateName} · custom`;
    }
    return "Nice run";
  })();

  // Runna-style plan-vs-actual verdict (running competitive doc P0 #3): for a
  // PLANNED session with a resolvable per-session pace target, say how the
  // run compared — including the "keep the easy days easy" nudge when an easy
  // session ran hot. Only planned runs are judged (custom/extra have no honest
  // target), and intervals are excluded (session avg mixes work + rest — the
  // same reason the primary stat swaps to the work-set summary for them).
  const paceVerdict = (() => {
    if (adherenceLabel !== "Planned") return null;
    const pm = runConfig?.planMetadata;
    const tmplId = pm?.plannedTemplateId || pm?.actualTemplateId;
    const tmpl = tmplId ? RUN_TEMPLATES.find((t) => t.id === tmplId) : null;
    if (!tmpl || tmpl.type === "intervals") return null;
    if (!(avgPaceSeconds > 0) || (distance || 0) < 500) return null;
    const table = paceTableFromFitness(profile?.runFitness ?? null);
    if (!table) return null;
    const paces = resolveSessionPaces(tmpl.type, table, {
      raceDistanceKey: raceDistanceKeyFromKm(tmpl.config.targetDistance),
    });
    const target =
      paces.targetPace ??
      paces.workPace ??
      (paces.band ? (paces.band[0] + paces.band[1]) / 2 : undefined);
    if (!target) return null;
    return resolvePaceVerdict({
      templateType: tmpl.type,
      actualPaceS: avgPaceSeconds,
      targetPaceS: target,
      // Band-aware verdict (Runna teardown #2): anywhere inside the session's
      // pace window is on-target, and the copy speaks the range.
      targetBandS: paces.band,
    });
  })();

  // Run8 PR3d — context-aware primary stat. Intervals get a
  // work-set summary ("N × distance @ pace") instead of the raw
  // session avg pace (which mixes work + rest and reads slow); race
  // runs lead with elapsed time (the metric runners care about). All
  // other activity types fall through to the existing 3-col stats
  // grid where distance / time / pace are equal-weighted.
  const primaryStat = (() => {
    if (activityType === "intervals") {
      const iv = runConfig?.intervals;
      if (!iv) return null;
      const distLabel =
        iv.workDistance && iv.workDistance >= 1000
          ? `${(iv.workDistance / 1000).toFixed(iv.workDistance % 1000 === 0 ? 0 : 1)}K`
          : iv.workDistance
            ? `${iv.workDistance}m`
            : iv.workDuration
              ? `${Math.round(iv.workDuration / 60)} min`
              : null;
      if (!distLabel) return null;
      const paceLabel = iv.workPace ? ` @ ${paceMinSec(iv.workPace)}/km` : "";
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
          distance > 0 ? `Race · ${(distance / 1000).toFixed(2)} km` : "Race",
      };
    }
    return null;
  })();

  // Run8 PR3c — plan-progress row. Surfaces "X of N runs this week"
  // for structured / race_prep users; freeform users see nothing.
  // The just-saved run is counted optimistically (saved && eligible)
  // so the user sees their new total without waiting for the
  // useRunningStats query to refetch.
  const weeklyRunTarget =
    profile?.runMode && profile.runMode !== "freeform"
      ? getWeeklyRunTarget(profile)
      : 0;
  const thisWeekKey = localWeekKey(new Date());
  const eligibleRunsThisWeek = weekRunsRaw.filter(
    (r) => isVolumeEligible(r) && localWeekKey(r.completedAt) === thisWeekKey
  ).length;
  // Optimistic count: include the just-saved run if it cleared the
  // eligibility threshold (distance >= 50 && duration >= 30 — same
  // gate isVolumeEligible uses on persisted runs). Hooked on the
  // current saveStatus so it lights up the moment the save lands,
  // before useRunningStats refetches the new doc.
  const currentRunIsEligible = (distance ?? 0) >= 50 && (elapsed ?? 0) >= 30;
  // `saveStatus`/`saved` are declared further down in this component;
  // we recompute the "include current run" flag inline at render.
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
    if (!user) return;
    /* Double-submit guard. The Save button is also disabled while
       saving, but the inline Retry banner can call handleSave again —
       this stops a flap if the user mashes it. */
    if (saveStatus === "saving") return;
    setSaveStatus("saving");
    setSaveError(null);

    // Resolve the shoe this run should attribute mileage to. If the user
    // picked one in RunSetupModal, honour that; otherwise fall back to the
    // current default. Previously the mileage accumulator only fired when
    // `runConfig.shoeId` was explicitly set, so users who hit "Start" with
    // their default shoe configured saw mileage silently stay at zero.
    // Persist the resolved value as a top-level `shoeId` field so the
    // mileage reconciliation utility in useShoes has a clean reference
    // regardless of how the run was started.
    const effectiveShoeId = runConfig?.shoeId ?? defaultShoe?.id ?? null;

    // Phase B1: plan-adherence metadata block, persisted at the top
    // level of the run doc so adherence queries (History "on-plan vs
    // off-plan", future weekly adherence rollup, future
    // completion-failure recovery) can filter without nesting into
    // `runConfig.planMetadata`. The same data lives on `runConfig`
    // for completeness; top-level is the canonical query surface.
    //
    // Defensive fallback: legacy navigation paths or test fixtures
    // that bypass Run.tsx might land here without planMetadata on
    // runConfig. Default to freeform shape so the run doc still has
    // a well-formed metadata block — null-tolerance downstream.
    const planMetadata =
      runConfig?.planMetadata ?? freeformPlanMetadata("freeform");

    const runData = {
      distance,
      duration: elapsed,
      avgPace: avgPaceSeconds,
      calories,
      elevationGain,
      points:
        points.length > 500
          ? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0)
          : points,
      splits,
      startedAt: Timestamp.fromDate(
        new Date(points[0]?.timestamp || Date.now())
      ),
      completedAt: Timestamp.now(),
      // PR-L bugfix — saved-run docs now persist a local-date string
      // alongside the completedAt Timestamp. The PR-L scheduled
      // functions (dailyRaceReconciliationSweep, weeklyFellBehindCheck)
      // and the onRunCreated recovery-entry path all filter runs by
      // this field; without it the queries return empty for every
      // user and the reconciliation flow silently mis-fires. Matches
      // the workouts convention (saved workouts already carry both).
      date: localDateString(new Date()),
      notes: notes.trim(),
      // RUN-03: optional structured effort signal. Null (skipped) survives
      // stripUndefined so the field shape doesn't bifurcate — same precedent
      // as isInvalid/invalidReason below. Backward-compatible: legacy runs
      // simply lack the field.
      relativeEffort,
      visibility: "followers" as const,
      type: "run",
      activityType: runConfig?.activityType || "freerun",
      target: runConfig?.target,
      intervalData,
      runConfig,
      shoeId: effectiveShoeId,
      /* Persist the validity verdict alongside the run document so
         downstream consumers (History filtering, PR computation, weekly
         stats) have a stable boolean to filter on without re-deriving
         from distance/duration. Valid runs explicitly get
         { isInvalid: false, invalidReason: null, savedAnyway: false }
         so the field shape doesn't bifurcate; null survives
         stripUndefined per firestoreGuards.ts:83. */
      isInvalid,
      invalidReason: invalidReason ?? null,
      savedAnyway: isInvalid,
      // PR H (audit P1 #9): persist route quality so RunDetail can
      // surface a confidence chip and History can downrank patchy /
      // poor routes from pace PRs. `null` survives stripUndefined
      // and signals "no quality data" (treadmill / manual / legacy).
      routeQuality: state.routeQuality ?? null,
      // ── Phase B1: plan-adherence metadata (top-level) ────────────
      planMode: planMetadata.planMode,
      planSource: planMetadata.planSource,
      plannedRunDayIndex: planMetadata.plannedRunDayIndex,
      plannedTemplateId: planMetadata.plannedTemplateId,
      plannedTemplateType: planMetadata.plannedTemplateType,
      actualTemplateId: planMetadata.actualTemplateId,
      matchedPlanExact: planMetadata.matchedPlanExact,
      matchedPlanType: planMetadata.matchedPlanType,
      offPlan: planMetadata.offPlan,
      planWeekIndex: planMetadata.planWeekIndex,
      planTotalWeeks: planMetadata.planTotalWeeks,
      // P0-6: pinpoint which scheduled slot this run fulfilled.
      // Persisting alongside the legacy `plannedRunDayIndex` lets
      // analytics distinguish "the Tuesday tempo from week 3" from
      // "the Tuesday tempo from week 4" without re-deriving from
      // dates. Null for freeform / URL-template-only / legacy.
      scheduledRunId: planMetadata.scheduledRunId,
    };
    try {
      // Firestore queues the write offline automatically via IndexedDB
      // persistence. addDocGuarded strips undefined fields first —
      // Firestore rejects any document with explicit undefined values,
      // and runData routinely carries them (intervalData on non-interval
      // runs, runConfig.target.value on `target.type === 'none'`, etc.).
      // Surfaced in QA as "addDoc() called with invalid data" failures
      // that landed users in the retry banner with no recovery path.
      // P3-1 follow-up: capture the doc id so the reconciliation
      // card's dismissal can persist across mounts of this same
      // saved run (e.g. user dismisses, navigates to Home, comes
      // back via History). Without the id, every remount fires the
      // prompt again — annoying nag for a user who already decided
      // "Leave open".
      const savedDocRef = await addDocGuarded(
        collection(db, "users", user.uid, "runs"),
        runData
      );
      setSavedRunId(savedDocRef.id);

      /* Hist5d Stress 19 / PR 7b — return-link toast closes the
         PRs-tab cold-start loop. Only fires on saves that could
         plausibly have set a PR — invalid 0km / 0:00 runs (the
         "Save anyway" exits) shouldn't tease a PR celebration. */
      if (!isInvalid) {
        // Activation funnel: a real (non-zero) saved run. Invalid 0km/0:00
        // "save anyway" runs are excluded — same gate as the PR toast/share.
        trackLifecycle("run_completed");
        // Session-completed signal for the reminder priming modal (D-1):
        // a run-first user's first session is the consent value moment too.
        window.dispatchEvent(new CustomEvent("tropos:run-completed"));
        toast.success("Run saved", {
          action: {
            label: "View PRs",
            onClick: () => navigate("/history?tab=prs"),
          },
        });
      }

      /* Skip the share-composer for invalid runs. The user chose
         "Save anyway" on a sub-threshold run (e.g. 0:02 / 0.00km) —
         we keep the record on their account but a 0km run has no
         business prompting a "Share with followers / crew / public"
         decision. Surfaced in QA: the composer was auto-firing on
         every Save anyway, even though the InvalidRunReview saved-
         state UI deliberately hides Share / GPX / map. */
      if (!isInvalid) {
        // Share composer: prompts the user (or replays their saved
        // default) for visibility + caption. When offline, the post is
        // queued and replayed by ShareComposerSheet's drain effect.
        const runName =
          runConfig?.activityType === "intervals"
            ? "Interval Run"
            : runConfig?.activityType === "guided"
              ? "Guided Run"
              : "Run";
        const km = distance / 1000;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.round(elapsed % 60);
        const decision = await compose(user.uid, {
          type: "run",
          title: runName,
          meta: [
            `${km.toFixed(2)}km`,
            `${mins}:${secs.toString().padStart(2, "0")}`,
            calories ? `${Math.round(calories)} cal` : "",
          ].filter(Boolean),
        });
        if (decision) {
          // See useProgram.ts for visibility-mapping rationale; same rules
          // apply here so workouts and runs follow identical share semantics.
          const apiVisibility =
            decision.visibility === "crews" ? "followers" : decision.visibility;
          const includeCrewId =
            (decision.visibility === "crews" ||
              decision.visibility === "public") &&
            !!profile?.crewId;
          // Shared-route privacy default. The public activity routePreview is
          // rendered as a REAL map on the feed, so a user who hasn't set
          // explicit privacy zones would otherwise broadcast their home/start
          // to anyone who follows them (follows are unilateral). Clip ~200m off
          // each end by default. Scoped to the SHARE only — the user's own map
          // + saved run keep the full `points`. Opt out in Settings → Privacy
          // (profile.hideSharedRouteEnds === false). Already-zoned points stay
          // zoned (this composes on top). clipRouteEnds is self-protecting: a
          // route too short to clip is returned whole, never emptied.
          const sharedRoutePoints =
            profile?.hideSharedRouteEnds === false
              ? points
              : clipRouteEnds(points, DEFAULT_CLIP_METERS);
          const payload = {
            authorId: user.uid,
            authorName: profile?.displayName || "Athlete",
            ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
            type: "run" as const,
            visibility: apiVisibility,
            ...(decision.caption ? { caption: decision.caption } : {}),
            runName,
            activityTitle: runName,
            distance,
            duration: elapsed,
            avgPace,
            elevationGain,
            calories,
            ...(includeCrewId ? { crewId: profile?.crewId } : {}),
            routePreview:
              sharedRoutePoints.length > 20
                ? sharedRoutePoints
                    .filter(
                      (_, i) =>
                        i % Math.ceil(sharedRoutePoints.length / 20) === 0
                    )
                    .map((p) => ({ lat: p.lat, lon: p.lon }))
                : sharedRoutePoints.map((p) => ({ lat: p.lat, lon: p.lon })),
          };
          if (isOnline) {
            try {
              await postActivity(payload);
            } catch (socialErr) {
              const lostNet =
                typeof navigator !== "undefined" && navigator.onLine === false;
              if (lostNet) {
                enqueueShare(user.uid, payload);
                showQueuedToast();
              } else {
                logger.warn("[RunSave] postActivity failed:", socialErr);
              }
            }
          } else {
            enqueueShare(user.uid, payload);
            showQueuedToast();
          }
        }
      }

      // Update shoe mileage against whichever shoe was resolved above.
      if (effectiveShoeId) {
        const alert = await updateMileage(effectiveShoeId, distance / 1000);
        if (alert === "replace") {
          toast.error(
            "Time for new shoes! This pair has exceeded its recommended mileage.",
            { duration: 5000 }
          );
        } else if (alert === "warning") {
          toast.warning(
            "Your shoes are at 85% of their recommended mileage. Start looking for a replacement!",
            { duration: 5000 }
          );
        }
      }

      setSaveStatus("saved");
      setSaveError(null);

      // Phase B3: the saved run is now durable in Firestore, so the
      // in-flight localStorage snapshot is no longer needed. Clear so
      // the next /run mount sees no resume prompt.
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
      // useProgram render. The "Ready for next week" toast moves
      // to a useProgram effect (chunk B4) that watches derived
      // completion of runDays + workouts.

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
    }
  };

  const handleShare = () => {
    setShareOpen(true);
  };

  const handleExportGPX = () => {
    const gpx = toGPX(points, `Tropos Run ${new Date().toLocaleDateString()}`);
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tropos-run-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
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
      style={{ paddingBottom: "var(--page-bottom-pad)" }}
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
          distanceKm={distanceKm}
          elapsedSeconds={elapsedSeconds}
          formatTime={formatTime}
          outdoorGps={outdoorGps}
          reason={invalidReason ?? "too-short"}
          saveStatus={saveStatus}
          saveError={saveError}
          isOnline={isOnline}
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
          <div className="text-center pb-4 px-4">
            <h1 className="text-xl font-extrabold text-foreground">
              {heroCopy}
            </h1>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            {/* Plan-vs-actual pace verdict — coral for the running domain,
                calm register (never shames a slow day). */}
            {paceVerdict && (
              <p className="mt-2 mx-auto max-w-xs text-xs leading-relaxed rounded-xl px-3 py-2 bg-running/6 border border-running/15 text-foreground">
                {paceVerdict.line}
              </p>
            )}
          </div>

          {/* Offline notice */}
          {!isOnline && !saved && (
            <div
              className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
              style={{
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <WifiOff size={20} className="text-warning" />
              <div>
                <p className="font-medium text-warning text-xs">
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
              style={{
                background: "rgba(52,211,153,0.12)",
                border: "1px solid rgba(52,211,153,0.25)",
              }}
            >
              <CheckCircle size={20} className="text-success" />
              <div>
                <p className="font-medium text-success text-xs">
                  {isOnline
                    ? "Run saved"
                    : "Saved locally — will sync when online"}
                </p>
              </div>
            </div>
          )}

          {/* Post-completion kudos (Phase 2) — after the run is banked, if
              someone the user follows also trained today. Renders nothing
              otherwise; once/day; dismissible. */}
          {saved && kudos.candidate && (
            <div className="mx-4 mb-4">
              <PostCompletionKudos
                candidate={kudos.candidate}
                sending={kudos.sending}
                sent={kudos.sent}
                onSend={kudos.sendKudos}
                onDismiss={kudos.dismiss}
              />
            </div>
          )}

          {/* P3-1: save-time mismatch reconciliation.
          Fires only when the saved run is off-plan AND points at a
          still-planned scheduled slot. Auto-complete (shouldCompleteRunDay)
          already fired silently for the matched case — this is the
          "you did something else, what should the scheduled slot do?"
          dialog. State is local to this RunSummary mount.

          Conditions for the card to appear:
            - run was saved successfully (saved === true)
            - run is valid (the invalid-save banner handles those)
            - planMetadata indicates a real plan context (mode !== freeform,
              scheduledRunId or plannedRunDayIndex present)
            - planMetadata.offPlan === true (mismatch occurred)
            - shouldCompleteRunDay returned false (no silent auto-complete)
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
              if (shouldCompleteRunDay({ metadata: m, isValid: !isInvalid }))
                return null;
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
                  style={{
                    background: "rgba(217,136,78,0.10)",
                    border: "1px solid rgba(217,136,78,0.30)",
                  }}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Off-plan save
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {`This didn't match today's ${plannedTypeLabel}. How should we handle the scheduled slot?`}
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
                          // dayIndex fallback was a pre-PR-J overload.
                          if (typeof refKey === "string") {
                            await markManualComplete(refKey);
                          }
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
                      style={{
                        background: "rgba(52,211,153,0.20)",
                        color: "rgb(52,211,153)",
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
                          await skipRunDay(refKey);
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
                        // don't re-prompt. Same key the on-mount
                        // useEffect reads above.
                        if (savedRunId) {
                          try {
                            localStorage.setItem(
                              `tropos:reconcileDismissed:${savedRunId}`,
                              "1"
                            );
                          } catch {
                            // localStorage unavailable — dismissal still
                            // sticks for this mount via React state; it
                            // just won't survive a re-mount. Acceptable
                            // degraded mode.
                          }
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

          {/* Pace-coloured route map */}
          {points.length > 1 && (
            <div className="mx-4 mb-4 rounded-2xl overflow-hidden">
              <RunMap
                points={points}
                currentPoint={null}
                interactive={true}
                distanceMarkers={true}
                height="h-56"
                paceColored={true}
                avgPaceSecPerKm={avgPaceSeconds}
                darkMode={!!profile?.darkMode}
              />
              <PaceLegend />
            </div>
          )}

          {/* Run8 PR3d — context-aware primary stat. Renders above
              the standard 3-col grid for intervals + race; everything
              else falls through and the 3-col grid below is the
              primary read. */}
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 px-4 mb-4">
            <div className="p-3 rounded-xl bg-card text-center card-shadow">
              <p className="text-2xl font-bold font-mono tabular-nums text-running">
                {(distance / 1000).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">km</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center card-shadow">
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {formatTime(elapsed)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">time</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center card-shadow">
              <p
                className="text-2xl font-bold font-mono tabular-nums"
                style={{ color: THEME.teal }}
              >
                {avgPace}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">/km pace</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 mb-4">
            <div className="p-3 rounded-xl bg-card text-center card-shadow">
              <p
                className="text-lg font-bold font-mono tabular-nums"
                style={{ color: THEME.success }}
              >
                {calories}
              </p>
              <p className="text-xs text-muted-foreground">calories</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center card-shadow">
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {elevationGain}m
              </p>
              <p className="text-xs text-muted-foreground">elevation gain</p>
            </div>
          </div>

          {/* Grade-adjusted pace — one calm line, only when the climb was
              material (Run13 item 4, display-only). */}
          {gap && (
            <p className="px-4 -mt-2 mb-4 text-center text-xs text-muted-foreground">
              Grade-adjusted pace{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {formatSecondsPerKm(gap.gapSecondsPerKm)}
              </span>
              /km — flat-equivalent for this climb
            </p>
          )}

          {/* Rev1 PR2 — what this run did to your week (fetches after the
              run doc is saved, so it includes this run). Null while
              loading; no jank. */}
          <div className="px-4 mb-4">
            <WeekPulseCard />
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{
                    background: paceTrend.bgColor,
                    color: paceTrend.color,
                  }}
                >
                  {paceTrend.trend === "pr" && (
                    <Trophy size={16} className="text-amber-500" />
                  )}{" "}
                  {paceTrend.label}
                </span>
              )}
              {adherenceLabel && (
                <span
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold"
                  style={{
                    background:
                      adherenceLabel === "Extra"
                        ? `${THEME.running}1A`
                        : adherenceLabel === "Custom"
                          ? `${THEME.text.muted}1A`
                          : `${THEME.success}1A`,
                    color:
                      adherenceLabel === "Extra"
                        ? THEME.running
                        : adherenceLabel === "Custom"
                          ? THEME.text.muted
                          : THEME.success,
                  }}
                  aria-label={`Plan adherence: ${adherenceLabel}`}
                >
                  {adherenceLabel}
                </span>
              )}
            </div>
          )}

          {/* Run8 PR3c — plan-progress row. Only renders for
              structured / race_prep users (weeklyRunTarget > 0).
              Includes the just-saved run optimistically once the
              save lands so the user sees their new total without
              waiting for useRunningStats to refetch. Race-prep adds
              the "Week X of Y" anchor. */}
          {weeklyRunTarget > 0 && (
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
                {Math.min(
                  weeklyRunTarget,
                  eligibleRunsThisWeek + (saved && currentRunIsEligible ? 1 : 0)
                )}
              </span>
              <span className="text-muted-foreground">of</span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {weeklyRunTarget}
              </span>
              <span className="text-muted-foreground">runs this week</span>
              {saved && currentRunIsEligible && (
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

          {/* Best Efforts */}
          {bestEfforts.length > 0 && (
            <div className="mx-4 mb-4 p-4 rounded-2xl bg-card">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                Best Efforts
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {bestEfforts.map((effort) => (
                  <div
                    key={effort.label}
                    className="text-center p-2 rounded-lg bg-muted/50"
                  >
                    <p className="text-xs text-muted-foreground">
                      {effort.label}
                    </p>
                    <p className="text-sm font-bold font-mono tabular-nums">
                      {Math.floor(effort.time / 60)}:
                      {(Math.floor(effort.time) % 60)
                        .toString()
                        .padStart(2, "0")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Splits bar chart */}
          {splits.length > 0 && (
            <div className="px-4 mb-4">
              <SplitsBarChart
                splits={splits}
                avgPaceSeconds={avgPaceSeconds}
                accentColor={THEME.teal}
              />

              {/* Per-km split list */}
              <div className="mt-3 space-y-1">
                {splits.map((s, i) => {
                  const fastest = Math.min(
                    ...splits.map((sp) => sp.paceSeconds)
                  );
                  const slowest = Math.max(
                    ...splits.map((sp) => sp.paceSeconds)
                  );
                  const color =
                    s.paceSeconds === fastest
                      ? "text-success"
                      : s.paceSeconds === slowest
                        ? "text-destructive"
                        : "text-muted-foreground";
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs px-1"
                    >
                      <span className="text-muted-foreground">km {s.km}</span>
                      <span
                        className={`font-mono tabular-nums font-medium ${color}`}
                      >
                        {s.pace}/km
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground font-medium">
                    Average
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-foreground">
                    {Math.floor(avgPaceSeconds / 60)}:
                    {(Math.floor(avgPaceSeconds) % 60)
                      .toString()
                      .padStart(2, "0")}
                    /km
                  </span>
                </div>
              </div>
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
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  How did it feel?
                </p>
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

            {canShowNormalSave({ isInvalid: false, saveStatus }) && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-90 bg-running text-white"
              >
                {saveStatus === "saving" ? "Saving…" : "Save Run"}
              </button>
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

            {canShowDone({ saveStatus }) && (
              /* Replaces the removed auto-navigation timeouts. Sits in the
             same primary-action slot as Save Run so the user's eye
             doesn't move when the state transitions saved → saved. */
              <button
                type="button"
                onClick={() => navigate("/")}
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
                className="w-full py-2 text-sm text-destructive"
              >
                Discard
              </button>
            )}
          </div>
        </>
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
          points,
          distanceKm: distance / 1000,
          durationSec: elapsed,
          pace: avgPace,
          elevationM: elevationGain ?? undefined,
          splits: (splits ?? []).map((s) => ({ km: s.km, pace: s.pace })),
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
