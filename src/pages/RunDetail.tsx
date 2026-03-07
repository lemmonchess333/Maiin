import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { THEME } from '../lib/theme';
import RunMap from '../components/run/RunMap';
import PaceLegend from '../components/run/PaceLegend';
import SplitsBarChart from '../components/analytics/SplitsBarChart';
import ElevationProfile from '../components/analytics/ElevationProfile';
import { generateAndShare } from '../lib/shareCardGenerator';
import ShareCard from '../components/social/ShareCard';
import { useRef } from 'react';

const ACTIVITY_LABELS: Record<string, string> = {
  freerun: 'Free Run', easy: 'Easy Run', tempo: 'Tempo Run',
  intervals: 'Intervals', longrun: 'Long Run', race: 'Race', treadmill: 'Treadmill',
};

function StatPill({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex-1 text-center py-3 px-2">
      <p className="text-2xl font-bold font-mono tabular-nums leading-none"
        style={{ color: color || 'var(--foreground)' }}>
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [run, setRun] = useState<any>(null);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !runId) return;
    getDoc(doc(db, 'users', user.uid, 'runs', runId)).then((snap) => {
      if (snap.exists()) setRun({ id: snap.id, ...snap.data() });
    });
  }, [user, runId]);

  if (!run) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const avgPace = run.duration > 0 && run.distance > 0 ? (run.duration / run.distance) * 1000 : 0;
  const avgPaceStr = avgPace > 0
    ? `${Math.floor(avgPace / 60)}:${(Math.floor(avgPace) % 60).toString().padStart(2, '0')}`
    : '--:--';

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const date = run.completedAt?.toDate?.();
  const dateStr = date?.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }) ?? '';

  const handleShare = async () => {
    if (!shareRef.current) return;
    setSharing(true);
    try { await generateAndShare(shareRef.current, 'run'); }
    finally { setSharing(false); }
  };

  return (
    <div className="min-h-screen bg-background pb-24">

      {/* Map — full bleed, tall */}
      {run.points?.length > 1 ? (
        <div className="relative h-72">
          <RunMap points={run.points} currentPoint={null} interactive={true}
            height="h-full" paceColored={true} avgPaceSecPerKm={avgPace}
            darkMode={!!profile?.darkMode} />
          {/* Back button over map */}
          <button onClick={() => navigate(-1)}
            className="absolute top-4 left-4 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md z-10"
            style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <PaceLegend />
        </div>
      ) : (
        /* No map — show back button inline */
        <div className="flex items-center gap-3 px-4 pt-12 pb-2">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">

        {/* Header */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
                {ACTIVITY_LABELS[run.activityType] ?? 'Run'}
              </p>
              <h1 className="text-xl font-bold text-foreground">
                {(run.distance / 1000).toFixed(2)} km
              </h1>
            </div>
            <button onClick={handleShare} disabled={sharing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: `${THEME.running}15`, color: THEME.running }}>
              {sharing ? 'Generating…' : '↗ Share'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{dateStr}</p>
        </div>

        {/* Primary stats row */}
        <div className="rounded-2xl bg-card border border-border/50 flex divide-x divide-border/40">
          <StatPill value={formatTime(run.duration)} label="Time" />
          <StatPill value={avgPaceStr} label="/km Pace" color={THEME.teal} />
          <StatPill value={`${run.calories ?? 0}`} label="Cal" color={THEME.warning} />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-card border border-border/50 text-center">
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {run.elevationGain ?? 0}m
            </p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Elevation Gain</p>
          </div>
          <div className="p-3 rounded-2xl bg-card border border-border/50 text-center">
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">
              {run.splits?.length ?? 0}
            </p>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">Splits</p>
          </div>
        </div>

        {/* Splits chart */}
        {run.splits?.length > 0 && (
          <SplitsBarChart splits={run.splits} avgPaceSeconds={avgPace} accentColor={THEME.teal} />
        )}

        {/* Elevation profile */}
        {run.points?.length > 0 && (
          <ElevationProfile points={run.points} accentColor={THEME.running} />
        )}
      </div>

      {/* Hidden share card */}
      <ShareCard ref={shareRef} data={{
        type: 'run',
        userName: profile?.displayName ?? 'Athlete',
        date: date?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '',
        distance: run.distance,
        duration: run.duration,
        pace: avgPaceStr,
        elevationGain: run.elevationGain,
      }} />
    </div>
  );
}