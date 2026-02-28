import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { calculatePace, toGPX, estimateRunCalories } from '../lib/gps';
import { postActivity } from '../lib/socialApi';
import type { GPSPoint, Split } from '../lib/gps';
import RunMap from '../components/run/RunMap';

interface RunData {
  points: GPSPoint[];
  distance: number;
  elapsed: number;
  splits: Split[];
  elevationGain: number;
}

export default function RunSummary() {
  const { state } = useLocation() as { state: RunData };
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  if (!state) { navigate('/'); return null; }

  const { points, distance, elapsed, splits, elevationGain } = state;
  const avgPace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, profile?.weightKg || 70);
  const avgPaceSeconds = elapsed > 0 ? (elapsed / distance) * 1000 : 0;

  const handleSave = async () => {
    if (!user) return;
    const runData = {
      distance, duration: elapsed, avgPace: avgPaceSeconds,
      calories, elevationGain,
      points: points.length > 500
        ? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0)
        : points,
      splits,
      startedAt: Timestamp.fromDate(new Date(points[0]?.timestamp || Date.now())),
      completedAt: Timestamp.now(),
      notes: '',
      visibility: 'followers' as const,
      type: 'run',
    };
    await addDoc(collection(db, 'users', user.uid, 'runs'), runData);

    // Auto-post to social feed
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
        routePreview: points.length > 20
          ? points.filter((_, i) => i % Math.ceil(points.length / 20) === 0).map(p => ({ lat: p.lat, lon: p.lon }))
          : points.map(p => ({ lat: p.lat, lon: p.lon })),
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
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric'
        })}</p>
      </div>

      {points.length > 1 && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-border">
          <RunMap points={points} currentPoint={null} interactive={true} height="h-56" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-2xl font-bold font-mono tabular-nums text-orange-500">
            {(distance / 1000).toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">km</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-2xl font-bold font-mono tabular-nums">{formatTime(elapsed)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">time</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-2xl font-bold font-mono tabular-nums text-purple-500">{avgPace}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">/km pace</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-lg font-bold font-mono tabular-nums text-green-500">{calories}</p>
          <p className="text-[10px] text-muted-foreground">calories</p>
        </div>
        <div className="p-3 rounded-xl bg-card border border-border text-center">
          <p className="text-lg font-bold font-mono tabular-nums">{elevationGain}m</p>
          <p className="text-[10px] text-muted-foreground">elevation gain</p>
        </div>
      </div>

      {splits.length > 0 && (
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold mb-3">Splits</h3>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground mb-2 px-1">
            <span>KM</span><span className="text-center">PACE</span><span className="text-right">TIME</span>
          </div>
          {splits.map(split => {
            const isFaster = split.paceSeconds < avgPaceSeconds;
            const isSlower = split.paceSeconds > avgPaceSeconds * 1.05;
            return (
              <div key={split.km} className={`grid grid-cols-3 gap-2 py-2 px-1 rounded-lg text-sm ${
                isFaster ? 'bg-green-50 dark:bg-green-950/20' :
                isSlower ? 'bg-red-50 dark:bg-red-950/20' : ''
              }`}>
                <span className="font-medium">{split.km}</span>
                <span className={`text-center font-mono tabular-nums ${
                  isFaster ? 'text-green-600' : isSlower ? 'text-red-500' : ''
                }`}>{split.pace}</span>
                <span className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatTime(Math.round(split.time))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-4 space-y-2">
        <button onClick={handleSave}
          className="w-full py-3.5 rounded-xl bg-purple-500 text-white font-medium text-sm">
          Save Run
        </button>
        <div className="flex gap-2">
          <button onClick={handleExportGPX}
            className="flex-1 py-3 rounded-xl bg-card border border-border text-sm font-medium">
            Export GPX
          </button>
          <button className="flex-1 py-3 rounded-xl bg-card border border-border text-sm font-medium">
            Share
          </button>
        </div>
        <button onClick={handleDiscard}
          className="w-full py-2 text-sm text-red-400">
          Discard
        </button>
      </div>
    </div>
  );
}
