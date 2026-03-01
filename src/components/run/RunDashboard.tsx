import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { ArrowRight, Footprints, MapPinned, Route, Timer } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';

export default function RunDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
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

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-2xl bg-card border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Route className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">This Week</p>
        </div>

        <div className="flex items-end gap-8">
          <div>
            <p className="text-4xl font-bold font-mono tabular-nums text-orange-500 leading-none">
              {(weeklyDistance / 1000).toFixed(1)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">km total</p>
          </div>
          <div>
            <p className="text-4xl font-bold font-mono tabular-nums leading-none">{weeklyRunCount}</p>
            <p className="text-sm text-muted-foreground mt-1">runs</p>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-800/40">
        <p className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
          <MapPinned className="w-4 h-4 shrink-0" />
          <span>
            Head to the <strong>Log</strong> tab → <strong>Run</strong> to start your next run.
          </span>
        </p>
      </div>

      {recentRuns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent Runs</h3>
          {recentRuns.map(run => (
            <div key={run.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/60">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center">
                <Footprints className="w-5 h-5 text-orange-600 dark:text-orange-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {((run.distance || 0) / 1000).toFixed(2)} km
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {run.completedAt?.toDate?.()?.toLocaleDateString() || ''} · {formatPace(run.avgPace)}/km
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
        <div className="text-center py-10 px-6 rounded-2xl border border-border/50 bg-card space-y-3">
          <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Footprints className="w-9 h-9 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold text-foreground">No runs yet</p>
          <p className="text-sm text-muted-foreground max-w-[260px] mx-auto">
            Track your runs with GPS, pace splits, and route mapping
          </p>
          <button
            onClick={() => navigate('/log')}
            className="inline-flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium mt-2"
          >
            Go to Log Tab
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
