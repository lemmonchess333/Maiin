import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { calculatePace, detectBestEfforts, toGPX, estimateRunCalories } from '../lib/gps';
import { postActivity } from '../lib/socialApi';
import type { GPSPoint, Split } from '../lib/gps';
import type { RunConfig } from '../components/run/RunSetupModal';
import RunMap from '../components/run/RunMap';

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

  if (!state) {
    navigate('/');
    return null;
  }

  const { points, distance, elapsed, splits, elevationGain, runConfig, intervalData } = state;
  const avgPace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, profile?.weightKg || 70);
  const avgPaceSeconds = elapsed > 0 ? (elapsed / distance) * 1000 : 0;
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
      notes: '',
      visibility: 'followers' as const,
      type: 'run',
      activityType: runConfig?.activityType || 'freerun',
      target: runConfig?.target,
      intervalData,
      runConfig,
    };
    await addDoc(collection(db, 'users', user.uid, 'runs'), runData);

    if (profile?.autoPostRuns !== false) {
      await postActivity({
        authorId: user.uid,
        authorName: profile?.displayName || 'Athlete',
        type: 'run',
        visibility: (profile?.defaultVisibility as any) || 'followers',
        distance,
        duration: elapsed,
        avgPace,
        elevationGain,
        calories,
        routePreview:
          points.length > 20
            ? points.filter((_, i) => i % Math.ceil(points.length / 20) === 0).map((p) => ({ lat: p.lat, lon: p.lon }))
            : points.map((p) => ({ lat: p.lat, lon: p.lon })),
      });
    }

    navigate('/');
  };

  const handleExportGPX = () => {
    const gpx = toGPX(points, `Maiin Run ${new Date().toLocaleDateString()}`);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maiin-run-${Date.now()}.gpx`;
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
    <div className="min-h-screen bg-background pb-24">
      <div className="text-center pt-8 pb-4 px-6">
        <p className="text-3xl mb-1">🏃</p>
        <h1 className="text-xl font-bold">Great run!</h1>
      </div>

      {points.length > 1 && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-border">
          <RunMap points={points} currentPoint={null} interactive={true} height="h-56" />
          <div className="flex items-center justify-center gap-4 mt-2 pb-2">
            <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-green-500" /><span className="text-[10px] text-muted-foreground">Faster</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-purple-400" /><span className="text-[10px] text-muted-foreground">On pace</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-1.5 rounded-full bg-red-500" /><span className="text-[10px] text-muted-foreground">Slower</span></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card border border-border text-center"><p className="text-2xl font-bold font-mono tabular-nums text-orange-500">{(distance / 1000).toFixed(2)}</p><p className="text-[10px] text-muted-foreground mt-0.5">km</p></div>
        <div className="p-3 rounded-xl bg-card border border-border text-center"><p className="text-2xl font-bold font-mono tabular-nums">{formatTime(elapsed)}</p><p className="text-[10px] text-muted-foreground mt-0.5">time</p></div>
        <div className="p-3 rounded-xl bg-card border border-border text-center"><p className="text-2xl font-bold font-mono tabular-nums text-purple-500">{avgPace}</p><p className="text-[10px] text-muted-foreground mt-0.5">/km pace</p></div>
      </div>

      {bestEfforts.length > 0 && (
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">⚡ Best Efforts</h3>
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

      <div className="px-4 space-y-2">
        <button onClick={handleSave} className="w-full py-3.5 rounded-xl bg-purple-500 text-white font-medium text-sm">Save Run</button>
        <div className="flex gap-2">
          <button onClick={handleExportGPX} className="flex-1 py-3 rounded-xl bg-card border border-border text-sm font-medium">Export GPX</button>
          <button className="flex-1 py-3 rounded-xl bg-card border border-border text-sm font-medium">Share</button>
        </div>
        <button onClick={handleDiscard} className="w-full py-2 text-sm text-red-400">Discard</button>
      </div>
    </div>
  );
}
