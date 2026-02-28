import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  const { user } = useAuth();
  const [run, setRun] = useState<any>(null);

  useEffect(() => {
    if (!user || !runId) return;
    getDoc(doc(db, 'users', user.uid, 'runs', runId)).then((snap) => {
      if (snap.exists()) setRun({ id: snap.id, ...snap.data() });
    });
  }, [user, runId]);

  if (!run) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bg }}>
        <p className="text-white/30 animate-pulse">Loading...</p>
      </div>
    );
  }

  const avgPace = run.duration > 0 ? (run.duration / run.distance) * 1000 : 0;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: THEME.bg }}>
      <div className="h-64">
        <RunMap
          points={run.points || []}
          currentPoint={null}
          interactive={true}
          height="h-full"
          paceColored={true}
          avgPaceSecPerKm={avgPace}
        />
      </div>
      <PaceLegend />

      <div className="px-4 pt-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">🏃 Run</h1>
          <p className="text-xs text-white/30">{run.completedAt?.toDate?.()?.toLocaleDateString?.() || '—'}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-[#1C1C24] text-center">
            <p className="text-xl font-bold font-mono tabular-nums" style={{ color: THEME.running }}>
              {(run.distance / 1000).toFixed(2)}
            </p>
            <p className="text-[9px] text-white/25">km</p>
          </div>
          <div className="p-3 rounded-xl bg-[#1C1C24] text-center">
            <p className="text-xl font-bold font-mono tabular-nums text-white">
              {Math.floor(run.duration / 60)}:{(run.duration % 60).toString().padStart(2, '0')}
            </p>
            <p className="text-[9px] text-white/25">time</p>
          </div>
          <div className="p-3 rounded-xl bg-[#1C1C24] text-center">
            <p className="text-xl font-bold font-mono tabular-nums" style={{ color: THEME.teal }}>
              {Math.floor(avgPace / 60)}:{(Math.floor(avgPace) % 60).toString().padStart(2, '0')}
            </p>
            <p className="text-[9px] text-white/25">/km</p>
          </div>
        </div>

        {run.splits && run.splits.length > 0 && (
          <SplitsBarChart splits={run.splits} avgPaceSeconds={avgPace} accentColor={THEME.teal} />
        )}

        {run.points && run.points.length > 0 && <ElevationProfile points={run.points} accentColor={THEME.running} />}
      </div>
    </div>
  );
}
