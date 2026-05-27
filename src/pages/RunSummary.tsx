import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { stripUndefined } from "../lib/firestoreGuards";
import { localDateString, localWeekKey } from "../lib/dateHelpers";
import { useAuth } from "../lib/auth";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
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
import SplitsBarChart from "../components/analytics/SplitsBarChart";
import ElevationProfile from "../components/analytics/ElevationProfile";
import ShareCard from "../components/social/ShareCard";
import { generateAndShare } from "../lib/shareCardGenerator";
import { THEME } from "../lib/theme";
import { calculatePaceTrend, type PaceTrendResult } from "../lib/paceTrends";
import { usePrivacyZones } from "../hooks/usePrivacyZones";
import { applyPrivacyZones } from "../lib/privacyZones";
import { useShoes } from "../hooks/useShoes";
import { useProgram } from "../features/program/useProgram";
import {
  freeformPlanMetadata,
  getAdherenceLabel,
  shouldCompleteRunDay,
} from "../lib/runPlanMetadata";
import { RUN_TEMPLATES } from "../lib/workoutTemplates";
import { paceMinSec } from "../lib/runLabels";
import { useRunningStats } from "../hooks/useRunningStats";
import { getWeeklyRunTarget } from "../lib/scheduleUtils";
import { isVolumeEligible } from "../lib/runStatsEligibility";
import { clearStoredRun } from "../lib/runResumeStorage";
import { toast } from "sonner";
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
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
      style={{
        background: `${THEME.running}1a`,
        border: `1px solid ${THEME.running}40`,
      }}
      role="alert"
    >
      <AlertCircle
        size={18}
        className="mt-0.5 shrink-0"
        style={{ color: THEME.running }}
        aria-hidden="true"
      />
      <div className="flex-1 text-xs text-foreground/80">
        <p className="font-medium" style={{ color: THEME.running }}>
          Couldn&apos;t save your run
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {error || "We couldn't save this run."}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
        style={{ background: THEME.running }}
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
  const [editValue, setEditValue] = useState<string>(distanceKm.toFixed(2));
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
                <p className="text-xs" style={{ color: "#D4637A" }}>
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
                  style={{ background: "#7B72E9" }}
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
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/20"
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
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  /* Save flow state. Replaces a single `saved: boolean` so the UI can
     distinguish "still working", "succeeded", and "failed — retry".
     A toast was the only failure signal previously; on Safari PWA the
     toast can race-render behind the bottom chrome and the user is
     left without feedback. The `error` state drives an inline banner
     above the action stack with a Retry button. `saved` is kept as a
     derived const so out-of-scope readers (the H1 copy, the
     'Run saved!' confirmation strip, the offline notice) keep working
     without rippling the migration through every condition in
     this commit. */
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = saveStatus === "saved";
  const [paceTrend, setPaceTrend] = useState<PaceTrendResult | null>(null);
  const [notes, setNotes] = useState("");
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

  // Fetch past runs to compute pace trend badge
  useEffect(() => {
    if (!user || !state) return;
    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "users", user.uid, "runs"),
          orderBy("completedAt", "desc")
        )
      );
      const allRuns = snap.docs.map((d) => {
        const data = d.data();
        return {
          distance: data.distance ?? 0,
          avgPace: data.avgPace ?? 0,
          completedAt: data.completedAt?.toDate?.() ?? new Date(),
          /* Source / validity fields plumbed through so paceTrends
             can exclude treadmill / manual / invalid / savedAnyway
             records — a treadmill 2:38/km can't masquerade as a PR
             against historical outdoor runs. */
          activityType: data.activityType,
          isInvalid: data.isInvalid,
          savedAnyway: data.savedAnyway,
        };
      });
      const currentRun = {
        distance: state.distance,
        avgPace:
          state.elapsed > 0 && state.distance > 0
            ? (state.elapsed / state.distance) * 1000
            : 0,
        completedAt: new Date(),
        activityType: state.runConfig?.activityType,
      };
      setPaceTrend(calculatePaceTrend(currentRun, allRuns));
    })();
  }, [user, state]);

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
    return "Great run!";
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
      clearStoredRun();
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
      // persistence. Strip undefined fields first — Firestore rejects
      // any document with explicit undefined values, and runData
      // routinely carries them (intervalData on non-interval runs,
      // runConfig.target.value on `target.type === 'none'`, etc.).
      // Surfaced in QA as "addDoc() called with invalid data" failures
      // that landed users in the retry banner with no recovery path.
      // P3-1 follow-up: capture the doc id so the reconciliation
      // card's dismissal can persist across mounts of this same
      // saved run (e.g. user dismisses, navigates to Home, comes
      // back via History). Without the id, every remount fires the
      // prompt again — annoying nag for a user who already decided
      // "Leave open".
      const savedDocRef = await addDoc(
        collection(db, "users", user.uid, "runs"),
        stripUndefined(runData)
      );
      setSavedRunId(savedDocRef.id);

      /* Hist5d Stress 19 / PR 7b — return-link toast closes the
         PRs-tab cold-start loop. Only fires on saves that could
         plausibly have set a PR — invalid 0km / 0:00 runs (the
         "Save anyway" exits) shouldn't tease a PR celebration. */
      if (!isInvalid) {
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
        const decision = await compose({
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
              points.length > 20
                ? points
                    .filter((_, i) => i % Math.ceil(points.length / 20) === 0)
                    .map((p) => ({ lat: p.lat, lon: p.lon }))
                : points.map((p) => ({ lat: p.lat, lon: p.lon })),
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
      clearStoredRun();

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

  const handleShare = async () => {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      await generateAndShare(
        shareRef.current,
        `${(distance / 1000).toFixed(2)}km run`
      );
    } finally {
      setSharing(false);
    }
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
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
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
              <WifiOff size={20} className="text-amber-400" />
              <div>
                <p className="font-medium text-amber-400 text-xs">
                  You're offline
                </p>
                <p className="text-xs text-white/60 mt-0.5">
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
              <CheckCircle size={20} className="text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-400 text-xs">
                  {isOnline
                    ? "Run saved!"
                    : "Saved locally — will sync when online"}
                </p>
              </div>
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
            <div
              className="mx-4 mb-3 p-4 rounded-2xl text-center shadow-sm"
              style={{ background: `${THEME.running}14` }}
            >
              <p
                className="text-3xl font-extrabold font-mono tabular-nums leading-tight"
                style={{ color: THEME.running }}
              >
                {primaryStat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {primaryStat.label}
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 px-4 mb-4">
            <div className="p-3 rounded-xl bg-card text-center shadow-sm">
              <p
                className="text-2xl font-bold font-mono tabular-nums"
                style={{ color: THEME.running }}
              >
                {(distance / 1000).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">km</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center shadow-sm">
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {formatTime(elapsed)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">time</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center shadow-sm">
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
            <div className="p-3 rounded-xl bg-card text-center shadow-sm">
              <p
                className="text-lg font-bold font-mono tabular-nums"
                style={{ color: THEME.success }}
              >
                {calories}
              </p>
              <p className="text-xs text-muted-foreground">calories</p>
            </div>
            <div className="p-3 rounded-xl bg-card text-center shadow-sm">
              <p className="text-lg font-bold font-mono tabular-nums text-foreground">
                {elevationGain}m
              </p>
              <p className="text-xs text-muted-foreground">elevation gain</p>
            </div>
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
                      ? "text-emerald-500"
                      : s.paceSeconds === slowest
                        ? "text-red-500"
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel? Any notes about this run..."
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
                className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-90"
                style={{ background: THEME.running, color: "white" }}
              >
                {saveStatus === "saving" ? "Saving…" : "Save Run"}
              </button>
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
                      disabled={sharing}
                      className="flex-1 py-3 rounded-xl bg-card text-sm font-medium text-foreground disabled:opacity-50 active:scale-[0.97] transition-transform"
                    >
                      {sharing ? "Sharing…" : "Share"}
                    </button>
                  )}
                </div>
              );
            })()}
            {canShowDiscard({ saveStatus }) && (
              <button
                type="button"
                onClick={handleDiscard}
                className="w-full py-2 text-sm text-red-400"
              >
                Discard
              </button>
            )}
          </div>
        </>
      )}

      {/* Offscreen share card rendered for html-to-image */}
      <div
        style={{
          position: "absolute",
          left: -9999,
          top: -9999,
          pointerEvents: "none",
        }}
      >
        <ShareCard
          ref={shareRef}
          data={{
            type: "run",
            userName: profile?.displayName || "Athlete",
            date: new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            distance: distance / 1000,
            duration: elapsed,
            pace: avgPace,
            elevationGain,
          }}
        />
      </div>

      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard this run?"
        description="This cannot be undone."
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          clearStoredRun();
          navigate("/");
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
