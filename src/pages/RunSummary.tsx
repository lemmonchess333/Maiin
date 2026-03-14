import { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { calculatePace, detectBestEfforts, toGPX, estimateRunCalories } from '../lib/gps';
import { postActivity } from '../lib/socialApi';
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
import { WifiOff, CheckCircle, Trophy } from 'lucide-react';

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
  const { updateMileage } = useShoes();
  const shareRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareToFeed, setShareToFeed] = useState(profile?.autoPostRuns !== false);
  const [paceTrend, setPaceTrend] = useState<PaceTrendResult | null>(null);
  const [notes, setNotes] = useState('');

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

  const handleSave = async () => {
    if (!user) return;
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
    };
    // Firestore queues the write offline automatically via IndexedDB persistence
    await addDoc(collection(db, 'users', user.uid, 'runs'), runData);

    if (isOnline && shareToFeed) {
      await postActivity({
        authorId: user.uid,
        authorName: profile?.displayName || 'Athlete',
        type: 'run',
        visibility: (profile?.defaultVisibility as 'public' | 'followers' | 'private') || 'public',
        runName: runConfig?.activityType === 'intervals' ? 'Interval Run' : runConfig?.activityType === 'guided' ? 'Guided Run' : 'Run',
        distance,
        duration: elapsed,
        avgPace,
        elevationGain,
        calories,
        crewId: profile?.crewId,
        routePreview:
          points.length > 20
            ? points.filter((_, i) => i % Math.ceil(points.length / 20) === 0).map((p) => ({ lat: p.lat, lon: p.lon }))
            : points.map((p) => ({ lat: p.lat, lon: p.lon })),
      });
    }

    // Update shoe mileage if a shoe was selected
    if (runConfig?.shoeId) {
      const alert = await updateMileage(runConfig.shoeId, distance / 1000);
      if (alert === 'replace') {
        toast.error('Time for new shoes! This pair has exceeded its recommended mileage.', { duration: 5000 });
      } else if (alert === 'warning') {
        toast.warning('Your shoes are at 85% of their recommended mileage. Start looking for a replacement!', { duration: 5000 });
      }
    }

    setSaved(true);
    // Short delay so user sees the confirmation, then go home
    setTimeout(() => navigate('/'), isOnline ? 800 : 1800);
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

  const handleDiscard = () => {
    if (confirm('Discard this run? This cannot be undone.')) navigate('/');
  };

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen pb-24 bg-background text-foreground">
      <div className="text-center pt-8 pb-4 px-6">
        <h1 className="text-xl font-bold text-foreground">
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

      {(distance || 0) === 0 && (elapsed || 0) < 30 && !saved && (
        <div className="mx-4 mt-3 p-4 rounded-xl bg-muted border border-border/50 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Run too short to save. Discard?</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-muted border border-border/50 text-foreground"
            >
              Save anyway
            </button>
            <button
              onClick={handleDiscard}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/10 text-red-500 border border-red-500/20"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Offline notice */}
      {!isOnline && !saved && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm"
          style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <WifiOff size={20} className="text-amber-400" />
          <div>
            <p className="font-medium text-amber-400 text-xs">You're offline</p>
            <p className="text-xs text-white/50 mt-0.5">Run will sync automatically when you reconnect</p>
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
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-border/50">
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
        <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
            {(distance / 1000).toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">km</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
          <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{formatTime(elapsed)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">time</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
          <p className="text-2xl font-bold font-mono tabular-nums" style={{ color: THEME.teal }}>{avgPace}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">/km pace</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
          <p className="text-lg font-bold font-mono tabular-nums" style={{ color: THEME.success }}>{calories}</p>
          <p className="text-[10px] text-muted-foreground">calories</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
          <p className="text-lg font-bold font-mono tabular-nums text-foreground">{elevationGain}m</p>
          <p className="text-[10px] text-muted-foreground">elevation gain</p>
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
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-card border border-border/50">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">Best Efforts</h3>
          <div className="grid grid-cols-3 gap-2">
            {bestEfforts.map((effort) => (
              <div key={effort.label} className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-[10px] text-muted-foreground">{effort.label}</p>
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

      {/* Actions */}
      <div className="px-4 space-y-2">
        {/* Share toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
          <div>
            <p className="text-sm font-medium text-foreground">Share to feed</p>
            <p className="text-[10px] text-muted-foreground">Post this run to your followers</p>
          </div>
          <button
            onClick={() => setShareToFeed(v => !v)}
            className={`w-10 h-6 rounded-full transition-colors relative ${shareToFeed ? 'bg-primary' : 'bg-muted border border-border'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform shadow-sm ${shareToFeed ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it feel? Any notes about this run..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-muted border border-border/50 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <button
          onClick={handleSave}
          disabled={saved}
          className="w-full py-3 rounded-xl font-medium text-sm transition-all active:scale-[0.97]"
          style={saved
            ? { background: `${THEME.success}20`, color: THEME.success, border: `1px solid ${THEME.success}4d` }
            : { background: THEME.running, color: 'white' }
          }>
          {saved ? (isOnline ? '✓ Saved' : '✓ Saved locally — syncing when online') : 'Save Run'}
        </button>
        <div className="flex gap-2">
          <button onClick={handleExportGPX}
            className="flex-1 py-3 rounded-xl bg-card border border-border/50 text-sm font-medium text-foreground">
            Export GPX
          </button>
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex-1 py-3 rounded-xl bg-card border border-border/50 text-sm font-medium text-foreground disabled:opacity-50">
            {sharing ? 'Sharing…' : 'Share'}
          </button>
        </div>
        <button onClick={handleDiscard} className="w-full py-2 text-sm text-red-400">Discard</button>
      </div>

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
    </div>
  );
}
