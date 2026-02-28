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

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [run, setRun] = useState<any>(null);

  useEffect(() => {
    if (!user || !runId) return;
    getDoc(doc(db, 'users', user.uid, 'runs', runId)).then(snap => {
      if (snap.exists()) setRun({ id: snap.id, ...snap.data() });
    });
  }, [user, runId]);

  if (!run) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const avgPace = run.duration > 0 && run.distance > 0 ? (run.duration / run.distance) * 1000 : 0;

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Route map (pace-coloured) */}
      {run.points && run.points.length > 1 && (
        <>
          <div className="h-64">
            <RunMap
              points={run.points}
              currentPoint={null}
              interactive={true}
              height="h-full"
              paceColored={true}
              avgPaceSecPerKm={avgPace}
            />
          </div>
          <PaceLegend />
        </>
      )}

      <div className="px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Run</h1>
            <p className="text-xs text-muted-foreground">
              {run.completedAt?.toDate?.()?.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
          <button onClick={() => navigate(-1)} className="text-sm text-primary">Back</button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
            <p className="text-xl font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
              {(run.distance / 1000).toFixed(2)}
            </p>
            <p className="text-[9px] text-muted-foreground">km</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
            <p className="text-xl font-bold font-mono tabular-nums text-foreground">
              {formatTime(run.duration)}
            </p>
            <p className="text-[9px] text-muted-foreground">time</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
            <p className="text-xl font-bold font-mono tabular-nums" style={{ color: THEME.teal }}>
              {Math.floor(avgPace / 60)}:{(Math.floor(avgPace) % 60).toString().padStart(2, '0')}
            </p>
            <p className="text-[9px] text-muted-foreground">/km</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-500">{run.calories}</p>
            <p className="text-[9px] text-muted-foreground">calories</p>
          </div>
          <div className="p-3 rounded-xl bg-card border border-border/50 text-center">
            <p className="text-lg font-bold font-mono tabular-nums text-foreground">{run.elevationGain}m</p>
            <p className="text-[9px] text-muted-foreground">elevation</p>
          </div>
        </div>

        {/* Splits chart */}
        {run.splits && run.splits.length > 0 && (
          <SplitsBarChart splits={run.splits} avgPaceSeconds={avgPace} accentColor={THEME.teal} />
        )}

        {/* Elevation profile */}
        {run.points && run.points.length > 0 && (
          <ElevationProfile points={run.points} accentColor={THEME.running} />
        )}

        {/* Nutrition callout */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-xs text-primary">
            You burned ~{run.calories} cal on this run. Your daily target adjustment has been applied.
          </p>
        </div>
      </div>
    </div>
  );
}
