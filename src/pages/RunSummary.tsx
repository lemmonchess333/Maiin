import { useRef, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { stripUndefined } from '../lib/firestoreGuards';
import { useAuth } from '../lib/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { logger } from '../lib/logger';
import { calculatePace, detectBestEfforts, toGPX, estimateRunCalories } from '../lib/gps';
import { postActivity } from '../lib/socialApi';
import { compose, enqueueShare, showQueuedToast } from '../lib/shareComposer';
import type { GPSPoint, Split } from '../lib/gps';
import type { RunConfig } from '../components/run/RunSetupModal';
import RunMap from '../components/run/RunMapLazy';
import PaceLegend from '../components/run/PaceLegend';
import SplitsBarChart from '../components/analytics/SplitsBarChart';
import ElevationProfile from '../components/analytics/ElevationProfile';
import ShareCard from '../components/social/ShareCard';
import { generateAndShare } from '../lib/shareCardGenerator';
import { THEME } from '../lib/theme';
import { calculatePaceTrend, type PaceTrendResult } from '../lib/paceTrends';
import { usePrivacyZones } from '../hooks/usePrivacyZones';
import { applyPrivacyZones } from '../lib/privacyZones';
import { useShoes } from '../hooks/useShoes';
import { toast } from 'sonner';
import { WifiOff, CheckCircle, Trophy, ChevronLeft, AlertCircle } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  canExportGpx,
  canShowDiscard,
  canShowDone,
  canShowNormalSave,
  canShowRetrySave,
  canShowSaveAnyway,
  canShowShare,
  isInvalidRun,
  isOutdoorGpsRun,
  type SaveStatus,
} from '../lib/runGuards';

/* Reusable retry banner. Shown above the action row on a save
 * failure. Coral-tinted to read as in-flow rather than modal-alert.
 * Used by both the valid-summary action stack and the InvalidRunReview
 * card when its "Save anyway" attempt fails. */
function RetryBanner({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl"
      style={{
        background: `${THEME.running}1a`,
        border: `1px solid ${THEME.running}40`,
      }}
      role="alert"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" style={{ color: THEME.running }} aria-hidden="true" />
      <div className="flex-1 text-xs text-foreground/80">
        <p className="font-medium" style={{ color: THEME.running }}>Couldn&apos;t save your run</p>
        <p className="mt-0.5 text-muted-foreground">
          {error || "We couldn't save this run."}
        </p>
      </div>
      <button
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
  saveStatus: SaveStatus;
  saveError: string | null;
  isOnline: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onDone: () => void;
}

function InvalidRunReview({
  distanceKm,
  elapsedSeconds,
  formatTime,
  outdoorGps,
  saveStatus,
  saveError,
  isOnline,
  onSave,
  onDiscard,
  onDone,
}: InvalidRunReviewProps) {
  const formattedDuration = formatTime(elapsedSeconds);
  const formattedDistance = `${distanceKm.toFixed(2)}km`;
  const bodyCopy = outdoorGps
    ? `We recorded ${formattedDuration} and ${formattedDistance}. This may have happened before GPS locked.`
    : `We recorded ${formattedDuration} and ${formattedDistance}. This is below the minimum distance or duration for a normal summary.`;

  const showSaveAnyway = canShowSaveAnyway({ isInvalid: true, saveStatus });
  const showDiscard = canShowDiscard({ saveStatus });
  const showRetry = canShowRetrySave({ saveStatus });
  const showDone = canShowDone({ saveStatus });

  return (
    <div className="mx-4 mt-3 mb-6 p-4 rounded-2xl bg-card space-y-3">
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">Run too short</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{bodyCopy}</p>
      </div>

      {showRetry && <RetryBanner error={saveError} onRetry={onSave} />}

      {showDone && (
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground text-center">
            {isOnline ? 'Saved anyway.' : 'Saved locally — will sync when online.'}
          </p>
          <button
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

      {(showSaveAnyway || showDiscard) && (
        <div className="space-y-2 pt-1">
          {showSaveAnyway && (
            <button
              onClick={onSave}
              disabled={saveStatus === 'saving'}
              className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-90 bg-muted text-foreground border border-border"
            >
              {saveStatus === 'saving' ? 'Saving…' : 'Save anyway'}
            </button>
          )}
          {showDiscard && (
            <button
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
  intervalData?: RunConfig['intervals'];
}

export default function RunSummary() {
  const { state } = useLocation() as { state: RunData };
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { zones: privacyZones } = usePrivacyZones();
  const { isOnline } = useOnlineStatus();
  const { updateMileage, defaultShoe } = useShoes();
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const saved = saveStatus === 'saved';
  const [paceTrend, setPaceTrend] = useState<PaceTrendResult | null>(null);
  const [notes, setNotes] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const handleDiscard = useCallback(() => setShowDiscardConfirm(true), []);

  // Fetch past runs to compute pace trend badge
  useEffect(() => {
    if (!user || !state) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'runs'), orderBy('completedAt', 'desc')));
      const allRuns = snap.docs.map(d => {
        const data = d.data();
        return {
          distance: data.distance ?? 0,
          avgPace: data.avgPace ?? 0,
          completedAt: data.completedAt?.toDate?.() ?? new Date(),
        };
      });
      const currentRun = { distance: state.distance, avgPace: state.elapsed > 0 && state.distance > 0 ? (state.elapsed / state.distance) * 1000 : 0, completedAt: new Date() };
      setPaceTrend(calculatePaceTrend(currentRun, allRuns));
    })();
  }, [user, state]);

  if (!state) {
    navigate('/');
    return null;
  }

  const { points: rawPoints, distance, elapsed, splits, elevationGain, runConfig, intervalData } = state;
  const points = applyPrivacyZones(rawPoints, privacyZones);
  const avgPace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, profile?.weightKg || 70);
  const avgPaceSeconds = elapsed > 0 && distance > 0 ? (elapsed / distance) * 1000 : 0;
  const bestEfforts = detectBestEfforts(points, distance);

  /* `distance` is metres throughout the run flow (useGPS.ts:118-120
     accumulates via Haversine in metres, RunSummary already converts
     for display via /1000). isInvalidRun expects km. */
  const distanceKm = (distance ?? 0) / 1000;
  const elapsedSeconds = elapsed ?? 0;
  const activityType = runConfig?.activityType;

  /* When activityType is missing (legacy runs / malformed payload),
     treat as valid. Better to show a real summary than trap the user
     in InvalidRunReview because we can't reason about the mode. */
  const isInvalid = activityType
    ? isInvalidRun({ activityType, distanceKm, elapsedSeconds })
    : false;
  const outdoorGps = activityType ? isOutdoorGpsRun(activityType) : false;

  const handleSave = async () => {
    if (!user) return;
    /* Double-submit guard. The Save button is also disabled while
       saving, but the inline Retry banner can call handleSave again —
       this stops a flap if the user mashes it. */
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
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

    const runData = {
      distance,
      duration: elapsed,
      avgPace: avgPaceSeconds,
      calories,
      elevationGain,
      points: points.length > 500 ? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0) : points,
      splits,
      startedAt: Timestamp.fromDate(new Date(points[0]?.timestamp || Date.now())),
      completedAt: Timestamp.now(),
      notes: notes.trim(),
      visibility: 'followers' as const,
      type: 'run',
      activityType: runConfig?.activityType || 'freerun',
      target: runConfig?.target,
      intervalData,
      runConfig,
      shoeId: effectiveShoeId,
    };
    try {
      // Firestore queues the write offline automatically via IndexedDB
      // persistence. Strip undefined fields first — Firestore rejects
      // any document with explicit undefined values, and runData
      // routinely carries them (intervalData on non-interval runs,
      // runConfig.target.value on `target.type === 'none'`, etc.).
      // Surfaced in QA as "addDoc() called with invalid data" failures
      // that landed users in the retry banner with no recovery path.
      await addDoc(collection(db, 'users', user.uid, 'runs'), stripUndefined(runData));

      // Share composer: prompts the user (or replays their saved
      // default) for visibility + caption. When offline, the post is
      // queued and replayed by ShareComposerSheet's drain effect.
      const runName =
        runConfig?.activityType === 'intervals'
          ? 'Interval Run'
          : runConfig?.activityType === 'guided'
            ? 'Guided Run'
            : 'Run';
      const km = distance / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.round(elapsed % 60);
      const decision = await compose({
        type: 'run',
        title: runName,
        meta: [
          `${km.toFixed(2)}km`,
          `${mins}:${secs.toString().padStart(2, '0')}`,
          calories ? `${Math.round(calories)} cal` : '',
        ].filter(Boolean),
      });
      if (decision) {
        // See useProgram.ts for visibility-mapping rationale; same rules
        // apply here so workouts and runs follow identical share semantics.
        const apiVisibility = decision.visibility === 'crews' ? 'followers' : decision.visibility;
        const includeCrewId =
          (decision.visibility === 'crews' || decision.visibility === 'public') && !!profile?.crewId;
        const payload = {
          authorId: user.uid,
          authorName: profile?.displayName || 'Athlete',
          ...(profile?.photoURL ? { authorPhotoURL: profile.photoURL } : {}),
          type: 'run' as const,
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
              ? points.filter((_, i) => i % Math.ceil(points.length / 20) === 0).map((p) => ({ lat: p.lat, lon: p.lon }))
              : points.map((p) => ({ lat: p.lat, lon: p.lon })),
        };
        if (isOnline) {
          try {
            await postActivity(payload);
          } catch (socialErr) {
            const lostNet = typeof navigator !== 'undefined' && navigator.onLine === false;
            if (lostNet) {
              enqueueShare(payload);
              showQueuedToast();
            } else {
              logger.warn('[RunSave] postActivity failed:', socialErr);
            }
          }
        } else {
          enqueueShare(payload);
          showQueuedToast();
        }
      }

      // Update shoe mileage against whichever shoe was resolved above.
      if (effectiveShoeId) {
        const alert = await updateMileage(effectiveShoeId, distance / 1000);
        if (alert === 'replace') {
          toast.error('Time for new shoes! This pair has exceeded its recommended mileage.', { duration: 5000 });
        } else if (alert === 'warning') {
          toast.warning('Your shoes are at 85% of their recommended mileage. Start looking for a replacement!', { duration: 5000 });
        }
      }

      setSaveStatus('saved');
      setSaveError(null);
      /* Auto-navigation timeouts (800ms online / 1800ms offline) were
         removed: they teleported the user back to home without their
         consent, often before they could read the confirmation, and
         broke a "review your run" UX entirely. The user now stays on
         the screen until they tap Done. */
    } catch (error) {
      logger.error('[RunSave] Failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to save run';
      setSaveStatus('error');
      setSaveError(message);
      /* Toast still fires as supplementary feedback for users who
         scrolled away or have the app backgrounded; the inline retry
         banner above the action row is the durable affordance. */
      toast.error('Failed to save run. Tap Retry below.');
    }
  };

  const handleShare = async () => {
    if (!shareRef.current || sharing) return;
    setSharing(true);
    try {
      await generateAndShare(shareRef.current, `${(distance / 1000).toFixed(2)}km run`);
    } finally {
      setSharing(false);
    }
  };

  const handleExportGPX = () => {
    const gpx = toGPX(points, `Tropos Run ${new Date().toLocaleDateString()}`);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tropos-run-${Date.now()}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ paddingBottom: 'var(--page-bottom-pad)' }}
    >
      <div className="px-4 pt-4">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ChevronLeft className="w-4 h-4" />
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
          saveStatus={saveStatus}
          saveError={saveError}
          isOnline={isOnline}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onDone={() => navigate('/')}
        />
      ) : (
      <>
      <div className="text-center pb-4 px-4">
        <h1 className="text-xl font-extrabold text-foreground">
          {(distance || 0) > 200 && (elapsed || 0) > 60
            ? "Great run!"
            : (distance || 0) > 0
              ? "Run saved"
              : "Run recorded"}
        </h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        })}</p>
      </div>

      {/* Offline notice */}
      {!isOnline && !saved && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <WifiOff size={20} className="text-amber-400" />
          <div>
            <p className="font-medium text-amber-400 text-xs">You're offline</p>
            <p className="text-xs text-white/60 mt-0.5">Run will sync automatically when you reconnect</p>
          </div>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
          style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
          <CheckCircle size={20} className="text-emerald-400" />
          <div>
            <p className="font-medium text-emerald-400 text-xs">
              {isOnline ? 'Run saved!' : 'Saved locally — will sync when online'}
            </p>
          </div>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card text-center shadow-sm">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
            {(distance / 1000).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">km</p>
        </div>
        <div className="p-3 rounded-xl bg-card text-center shadow-sm">
          <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{formatTime(elapsed)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">time</p>
        </div>
        <div className="p-3 rounded-xl bg-card text-center shadow-sm">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: THEME.teal }}>{avgPace}</p>
          <p className="text-xs text-muted-foreground mt-0.5">/km pace</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card text-center shadow-sm">
          <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.success }}>{calories}</p>
          <p className="text-xs text-muted-foreground">calories</p>
        </div>
        <div className="p-3 rounded-xl bg-card text-center shadow-sm">
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{elevationGain}m</p>
          <p className="text-xs text-muted-foreground">elevation gain</p>
        </div>
      </div>

      {/* Pace Trend Badge */}
      {paceTrend && paceTrend.trend !== 'no-data' && (
        <div className="mx-4 mb-4 flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold"
            style={{ background: paceTrend.bgColor, color: paceTrend.color }}>
            {paceTrend.trend === 'pr' && <Trophy size={16} className="text-amber-500" />} {paceTrend.label}
          </span>
        </div>
      )}

      {/* Best Efforts */}
      {bestEfforts.length > 0 && (
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-card">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">Best Efforts</h3>
          <div className="grid grid-cols-3 gap-2">
            {bestEfforts.map((effort) => (
              <div key={effort.label} className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">{effort.label}</p>
                <p className="text-sm font-bold font-mono tabular-nums">{Math.floor(effort.time / 60)}:{(Math.floor(effort.time) % 60).toString().padStart(2, '0')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Splits bar chart */}
      {splits.length > 0 && (
        <div className="px-4 mb-4">
          <SplitsBarChart splits={splits} avgPaceSeconds={avgPaceSeconds} accentColor={THEME.teal} />

          {/* Per-km split list */}
          <div className="mt-3 space-y-1">
            {splits.map((s, i) => {
              const fastest = Math.min(...splits.map(sp => sp.paceSeconds));
              const slowest = Math.max(...splits.map(sp => sp.paceSeconds));
              const color = s.paceSeconds === fastest ? 'text-emerald-500' : s.paceSeconds === slowest ? 'text-red-500' : 'text-muted-foreground';
              return (
                <div key={i} className="flex items-center justify-between text-xs px-1">
                  <span className="text-muted-foreground">km {s.km}</span>
                  <span className={`font-mono tabular-nums font-medium ${color}`}>{s.pace}/km</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-xs px-1 pt-1 border-t border-border/50">
              <span className="text-muted-foreground font-medium">Average</span>
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {Math.floor(avgPaceSeconds / 60)}:{(Math.floor(avgPaceSeconds) % 60).toString().padStart(2, '0')}/km
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
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] disabled:opacity-90"
            style={{ background: THEME.running, color: 'white' }}>
            {saveStatus === 'saving' ? 'Saving…' : 'Save Run'}
          </button>
        )}

        {canShowDone({ saveStatus }) && (
          /* Replaces the removed auto-navigation timeouts. Sits in the
             same primary-action slot as Save Run so the user's eye
             doesn't move when the state transitions saved → saved. */
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            style={{ background: `${THEME.success}20`, color: THEME.success, border: `1px solid ${THEME.success}4d` }}
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
          const showGpx = canExportGpx({ isInvalid: false, isOutdoorGpsRun: outdoorGps, saveStatus });
          if (!showShare && !showGpx) return null;
          return (
            <div className="flex gap-2">
              {showGpx && (
                <button onClick={handleExportGPX}
                  className="flex-1 py-3 rounded-xl bg-card text-sm font-medium text-foreground active:scale-[0.97] transition-transform">
                  Export GPX
                </button>
              )}
              {showShare && (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="flex-1 py-3 rounded-xl bg-card text-sm font-medium text-foreground disabled:opacity-50 active:scale-[0.97] transition-transform">
                  {sharing ? 'Sharing…' : 'Share'}
                </button>
              )}
            </div>
          );
        })()}
        {canShowDiscard({ saveStatus }) && (
          <button onClick={handleDiscard} className="w-full py-2 text-sm text-red-400">Discard</button>
        )}
      </div>
      </>
      )}

      {/* Offscreen share card rendered for html-to-image */}
      <div style={{ position: 'absolute', left: -9999, top: -9999, pointerEvents: 'none' }}>
        <ShareCard
          ref={shareRef}
          data={{
            type: 'run',
            userName: profile?.displayName || 'Athlete',
            date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
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
        onConfirm={() => { setShowDiscardConfirm(false); navigate('/'); }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
