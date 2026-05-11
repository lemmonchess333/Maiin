import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { Timer, Footprints } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { isCountableRun } from '../../lib/runGuards';
import { format } from 'date-fns';
import { EmptyState } from '../EmptyState';

/* Activity-type labels mirror History/RunningHistorySection so the
   dashboard recent-runs list reads consistently with the History
   page's recent-runs section. Manual is the GPS-fallback path —
   labelled honestly rather than as treadmill, even though it
   shares the manual-distance flow. */
const ACTIVITY_LABEL: Record<string, string> = {
  freerun: 'Free Run', easy: 'Easy Run', tempo: 'Tempo', intervals: 'Intervals',
  long: 'Long Run', longrun: 'Long Run', race: 'Race', treadmill: 'Treadmill',
  manual: 'Manual Run', guided: 'Guided',
};

interface RecentRun {
  id: string;
  distance?: number;
  avgPace?: number;
  duration?: number;
  completedAt?: { toDate: () => Date };
  activityType?: string;
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

export default function RunDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [weeklyDistance, setWeeklyDistance] = useState(0);
  const [weeklyRunCount, setWeeklyRunCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const loadRuns = async () => {
      const runsRef = collection(db, 'users', user.uid, 'runs');

      const recentQ = query(runsRef, orderBy('completedAt', 'desc'), limit(5));
      const snap = await getDocs(recentQ);
      /* No source filter on the recent-runs list — Sprint 1's
         transparency principle: invalid / savedAnyway records
         exist on the user's account and should be visible (with
         badges) so the user can see what they saved. The weekly
         tile below is what filters via isCountableRun. */
      setRecentRuns(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<RecentRun, 'id'>) })));

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const weeklyQ = query(runsRef, where('completedAt', '>=', Timestamp.fromDate(startOfWeek)), orderBy('completedAt', 'desc'));
      const weeklySnap = await getDocs(weeklyQ);
      /* Filter invalid + zero-distance records out of both totals so
         the weekly run-count tile doesn't credit "Save anyway"
         misclicks. The km accumulator also picks up the filter
         (previously fell back to 0 for zombies via `|| 0` so km was
         already clean, but counting them anyway diverged the tile
         from every other stat surface). */
      const countable = weeklySnap.docs.filter(d => isCountableRun(d.data()));
      let totalDist = 0;
      countable.forEach(d => { totalDist += d.data().distance || 0; });
      setWeeklyDistance(totalDist);
      setWeeklyRunCount(countable.length);
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
      <div className="p-5 rounded-2xl bg-card">
        <p className="text-xs text-muted-foreground font-medium tracking-wider uppercase mb-3">This Week</p>
        <div className="flex items-center gap-5">
          <div className="relative inline-flex items-center justify-center shrink-0">
            <svg className="progress-ring" viewBox="0 0 80 80" width="80" height="80" role="img" aria-label={`Weekly distance progress: ${weeklyKm.toFixed(1)} of ${goalKm} km`}>
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
                <p className="text-xs text-muted-foreground">runs</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/30">
        <Footprints className="w-4 h-4 text-green-500 shrink-0" />
        <p className="text-xs text-muted-foreground dark:text-purple-200">
          Tap <strong className="text-purple-600 dark:text-purple-300">Start Run</strong> below or use the <strong className="text-purple-600 dark:text-purple-300">Programme</strong> tab to begin your next run
        </p>
      </div>

      {recentRuns.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Recent Runs</h3>
          {recentRuns.map((run, i) => (
            <div key={run.id}
              className="ds-fade-up flex items-center gap-3 p-3 rounded-xl bg-card pressable"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                <Footprints className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                {/* Title row: distance + activity-type label + (when
                    applicable) Saved-anyway / Invalid badge.
                    Mirrors RunningHistorySection so the two
                    surfaces stay consistent — Sprint 1 transparency
                    principle. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">
                    {((run.distance || 0) / 1000).toFixed(2)} km
                  </p>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                    {ACTIVITY_LABEL[run.activityType ?? 'freerun'] || 'Run'}
                  </span>
                  {run.savedAnyway ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}>
                      Saved anyway
                    </span>
                  ) : run.isInvalid ? (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}>
                      Invalid
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {run.completedAt?.toDate ? format(run.completedAt.toDate(), 'MMM d') : ''} · {formatPace(run.avgPace ?? 0)}/km
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono tabular-nums text-muted-foreground">
                  {Math.floor((run.duration || 0) / 60)}:{((run.duration || 0) % 60).toString().padStart(2, '0')}
                </p>
                <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Timer className="w-3 h-3" />
                  <span>duration</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recentRuns.length === 0 && (
        // Sprint 4: bespoke empty-state replaced with the shared
        // EmptyState primitive. Accent stays sport-coded coral
        // (THEME.runRed equivalent — running surface).
        <EmptyState
          icon={<Footprints size={28} />}
          title="No runs yet"
          description="Track your runs with GPS, pace splits, and route mapping."
          action={{ label: "Start a Run", onClick: () => navigate('/run') }}
          accentColor="#D4637A"
        />
      )}
    </div>
  );
}
