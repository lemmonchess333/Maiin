import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { calculatePace, detectBestEfforts, toGPX, estimateRunCalories } from '../lib/gps';
import { postActivity } from '../lib/socialApi';
import type { GPSPoint, Split } from '../lib/gps';
import type { RunConfig } from '../components/run/RunSetupModal';
import RunMap from '../components/run/RunMap';
import PaceLegend from '../components/run/PaceLegend';
import SplitsBarChart from '../components/analytics/SplitsBarChart';
import ElevationProfile from '../components/analytics/ElevationProfile';
import { THEME } from '../lib/theme';
import { Trophy, Share2, Download, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RunData {
  points: GPSPoint[];
  distance: number;
  elapsed: number;
  splits: Split[];
  elevationGain: number;
  runConfig?: RunConfig | null;
  intervalData?: RunConfig['intervals'];
}

const ACTIVITY_LABELS: Record<string, string> = {
  freerun: 'Free Run', easy: 'Easy Run', tempo: 'Tempo Run',
  intervals: 'Intervals', longrun: 'Long Run', race: 'Race', treadmill: 'Treadmill',
};

export default function RunSummary() {
  const { state } = useLocation() as { state: RunData };
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  if (!state) { navigate('/'); return null; }

  const { points, distance, elapsed, splits, elevationGain, runConfig, intervalData } = state;
  const avgPace = calculatePace(distance, elapsed);
  const calories = estimateRunCalories(distance, profile?.weightKg || 70);
  const avgPaceSeconds = elapsed > 0 ? (elapsed / distance) * 1000 : 0;
  const bestEfforts = detectBestEfforts(points, distance);
  const isPR = bestEfforts.length > 0;

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      const runData = {
        distance, duration: elapsed, avgPace: avgPaceSeconds, calories, elevationGain,
        points: points.length > 500 ? points.filter((_, i) => i % Math.ceil(points.length / 500) === 0) : points,
        splits,
        startedAt: Timestamp.fromDate(new Date(points[0]?.timestamp || Date.now())),
        completedAt: Timestamp.now(),
        notes: '', visibility: 'followers' as const, type: 'run',
        activityType: runConfig?.activityType || 'freerun',
        target: runConfig?.target, intervalData, runConfig,
      };
      await addDoc(collection(db, 'users', user.uid, 'runs'), runData);
      if (profile?.autoPostRuns !== false) {
        await postActivity({
          authorId: user.uid, authorName: profile?.displayName || 'Athlete',
          type: 'run', visibility: (profile?.defaultVisibility as any) || 'followers',
          distance, duration: elapsed, avgPace, elevationGain, calories,
          routePreview: points.length > 20
            ? points.filter((_, i) => i % Math.ceil(points.length / 20) === 0).map(p => ({ lat: p.lat, lon: p.lon }))
            : points.map(p => ({ lat: p.lat, lon: p.lon })),
        });
      }
      setSaved(true);
      setTimeout(() => navigate('/'), 800);
    } finally {
      setSaving(false);
    }
  };

  const handleExportGPX = () => {
    const gpx = toGPX(points, `Maiin Run ${new Date().toLocaleDateString()}`);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `maiin-run-${Date.now()}.gpx`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDiscard = () => {
    if (confirm('Discard this run? This cannot be undone.')) navigate('/');
  };

  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div className="min-h-screen pb-32" style={{ background: THEME.bg, color: '#fff' }}>

      {/* PR Banner */}
      <AnimatePresence>
        {isPR && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
            className="flex items-center justify-center gap-2 py-3 px-4"
            style={{ background: `linear-gradient(90deg, ${THEME.warning}22, ${THEME.warning}40, ${THEME.warning}22)` }}
          >
            <Trophy className="w-4 h-4" style={{ color: THEME.warning }} />
            <span className="text-sm font-bold" style={{ color: THEME.warning }}>
              New best effort — {bestEfforts[0]?.label}!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center pt-10 pb-6 px-6"
      >
        <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {ACTIVITY_LABELS[runConfig?.activityType ?? 'freerun']} · {dateStr}
        </p>
        <p
          className="font-bold font-mono tabular-nums leading-none mb-1"
          style={{ fontSize: 80, color: THEME.running, letterSpacing: '-3px' }}
        >
          {(distance / 1000).toFixed(2)}
        </p>
        <p className="text-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>kilometres</p>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="flex divide-x mx-4 rounded-2xl overflow-hidden mb-4"
        style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {[
          { label: 'Time', value: formatTime(elapsed), color: '#fff' },
          { label: '/km Pace', value: avgPace, color: THEME.teal },
          { label: 'Calories', value: String(calories), color: THEME.warning },
        ].map(s => (
          <div key={s.label} className="flex-1 text-center py-4"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xl font-bold font-mono tabular-nums leading-none" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Secondary stats */}
      {(elevationGain > 0 || splits.length > 0) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex gap-3 mx-4 mb-4"
        >
          {elevationGain > 0 && (
            <div className="flex-1 text-center py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-lg font-bold font-mono tabular-nums text-white">{elevationGain}m</p>
              <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Elevation</p>
            </div>
          )}
          {splits.length > 0 && (
            <div className="flex-1 text-center py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-lg font-bold font-mono tabular-nums text-white">{splits.length}</p>
              <p className="text-[9px] uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Splits</p>
            </div>
          )}
        </motion.div>
      )}

      {/* Map */}
      {points.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mx-4 mb-4 rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <RunMap points={points} currentPoint={null} interactive={true}
            height="h-52" paceColored={true} avgPaceSecPerKm={avgPaceSeconds}
            darkMode={true} />
          <PaceLegend />
        </motion.div>
      )}

      {/* Show more toggle */}
      {(splits.length > 0 || points.length > 0) && (
        <button
          onClick={() => setShowDetails(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 mb-2"
          style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}
        >
          <span>{showDetails ? 'Hide details' : 'Show splits & elevation'}</span>
          <ChevronDown className="w-4 h-4" style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      )}

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden px-4 space-y-3 mb-4"
          >
            {splits.length > 0 && (
              <SplitsBarChart splits={splits} avgPaceSeconds={avgPaceSeconds} accentColor={THEME.teal} />
            )}
            {points.length > 0 && (
              <ElevationProfile points={points} accentColor={THEME.running} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="fixed bottom-0 left-0 right-0 p-4 space-y-2"
        style={{ background: `linear-gradient(to top, ${THEME.bg} 80%, transparent)` }}>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
          style={{ background: saved ? THEME.success : THEME.running, color: '#000', opacity: saving ? 0.7 : 1 }}
        >
          {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Run'}
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleExportGPX}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
          >
            <Download className="w-4 h-4" /> GPX
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button
            onClick={handleDiscard}
            className="flex-1 py-3 rounded-2xl text-sm font-medium"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
