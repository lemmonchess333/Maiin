import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { ArrowRight, Timer, Footprints } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { format } from 'date-fns';

export default function RunDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentRuns, setRecentRuns] = useState<{ id: string; distance?: number; avgPace?: number; duration?: number; completedAt?: { toDate: () => Date } }[]>([]);
  const [weeklyDistance, setWeeklyDistance] = useState(0);
  const [weeklyRunCount, setWeeklyRunCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const loadRuns = async () => {
      const runsRef = collection(db, 'users', user.uid, 'runs');

      const recentQ = query(runsRef, orderBy('completedAt', 'desc'), limit(5));
      const snap = await getDocs(recentQ);
      setRecentRuns(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const weeklyQ = query(runsRef, where('completedAt', '>=', Timestamp.fromDate(startOfWeek)), orderBy('completedAt', 'desc'));
      const weeklySnap = await getDocs(weeklyQ);
      let totalDist = 0;
      weeklySnap.docs.forEach(d => { totalDist += d.data().distance || 0; });
      setWeeklyDistance(totalDist);
      setWeeklyRunCount(weeklySnap.size);
    };

    loadRuns();
  }, [user]);

  const formatPace = (avgPace: number) => {
    if (!avgPace) return '--:--';
    const mins = Math.floor(avgPace / 60);
    const secs = Math.floor(avgPace % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const weeklyKm = weeklyDistance / 1000;
  const goalKm = 20;
  const pct = Math.min(weeklyKm / goalKm, 1);

  return (
    <div className="space-y-4">
      {/* Weekly distance with progress ring */}
      <div className="p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
        <p className="text-[11px] text-muted-foreground font-medium tracking-wider uppercase mb-3">This Week</p>
        <div className="flex items-center gap-5">
          <div className="relative inline-flex items-center justify-center shrink-0">
            <svg className="progress-ring" viewBox="0 0 80 80" width="80" height="80">
              <circle className="progress-ring__bg" cx="40" cy="40" r="34" />
              <circle className="progress-ring__fill" cx="40" cy="40" r="34"
                style={{ '--pct': pct } as React.CSSProperties} />
            </svg>
            <span className="absolute text-lg font-extrabold tracking-tight text-foreground">
              {weeklyKm.toFixed(1)}
            </span>
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">km this week</p>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-2xl font-extrabold tabular-nums text-foreground">{weeklyRunCount}</p>
                <p className="text-[10px] text-muted-foreground">runs</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/30">
        <Footprints size={16} className="text-green-500 shrink-0" />
        <p className="text-xs text-gray-700 dark:text-purple-200">
          Head to the <strong className="text-purple-600 dark:text-purple-300">Log</strong> tab → <strong className="text-purple-600 dark:text-purple-300">Run</strong> to start your next run
        </p>
      </div>

      {recentRuns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Recent Runs</h3>
          {recentRuns.map((run, i) => (
            <div key={run.id}
              className="ds-fade-up flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 pressable"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                <Footprints size={16} className="text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {((run.distance || 0) / 1000).toFixed(2)} km
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {run.completedAt?.toDate ? format(run.completedAt.toDate(), 'MMM d') : ''} · {formatPace(run.avgPace ?? 0)}/km
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono tabular-nums text-muted-foreground">
                  {Math.floor((run.duration || 0) / 60)}:{((run.duration || 0) % 60).toString().padStart(2, '0')}
                </p>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Timer className="w-3 h-3" />
                  <span>duration</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recentRuns.length === 0 && (
        <div className="text-center py-12 space-y-3 ds-fade-up">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)' }}>
            <Footprints size={36} className="text-green-500" />
          </div>
          <p className="text-sm font-bold text-foreground">No runs yet</p>
          <p className="text-xs text-muted-foreground max-w-[220px] mx-auto">
            Track your runs with GPS, pace splits, and route mapping
          </p>
          <button
            onClick={() => navigate('/log')}
            className="inline-flex items-center gap-2 text-sm px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold shadow-[var(--ds-shadow-purple-glow)] active:scale-95 transition-transform mt-2"
          >
            Go to Log Tab
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
