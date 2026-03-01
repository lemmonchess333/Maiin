import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
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
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-card border border-border">
        <p className="text-xs text-muted-foreground mb-2">This Week</p>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-3xl font-bold font-mono tabular-nums text-orange-500">
              {(weeklyDistance / 1000).toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">km total</p>
          </div>
          <div>
            <p className="text-xl font-bold font-mono tabular-nums">{weeklyRunCount}</p>
            <p className="text-xs text-muted-foreground">runs</p>
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40">
        <p className="text-xs text-orange-700 dark:text-orange-300">
          Head to the <strong>Log</strong> tab → <strong>Run</strong> to start your next run 🏃
        </p>
      </div>

      {recentRuns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent Runs</h3>
          {recentRuns.map(run => (
            <div key={run.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center text-lg">
                🏃
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {((run.distance || 0) / 1000).toFixed(2)} km
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {run.completedAt?.toDate?.()?.toLocaleDateString() || ''} · {formatPace(run.avgPace)}/km
                </p>
              </div>
              <p className="text-sm font-mono tabular-nums text-muted-foreground">
                {Math.floor((run.duration || 0) / 60)}:{((run.duration || 0) % 60).toString().padStart(2, '0')}
              </p>
            </div>
          ))}
        </div>
      )}

      {recentRuns.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <div className="w-20 h-20 mx-auto rounded-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
            <span className="text-4xl">🏃</span>
          </div>
          <p className="text-sm font-semibold">No runs yet</p>
          <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
            Track your runs with GPS, pace splits, and route mapping
          </p>
          <button
            onClick={() => navigate('/log')}
            className="text-xs px-4 py-2 rounded-lg bg-orange-500 text-white font-medium mt-2"
          >
            Go to Log Tab
          </button>
        </div>
      )}
    </div>
  );
}
