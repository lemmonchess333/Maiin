import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { buildLeaderboard, type LeaderboardEntry, type ChallengeType } from '../../lib/leaderboard';
import { Skeleton } from '../LoadingSkeleton';

const TABS: { key: ChallengeType; label: string; unit: string }[] = [
  { key: 'weekly_hybrid', label: 'Hybrid Score', unit: 'pts' },
  { key: 'weekly_volume', label: 'Lifting Volume', unit: 'kg' },
  { key: 'weekly_distance', label: 'Running Distance', unit: 'km' },
  { key: 'weekly_workouts', label: 'Workouts', unit: 'sessions' },
];

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function FullLeaderboard({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ChallengeType>('weekly_hybrid');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const raw = await buildLeaderboard(user.uid, activeTab);
        if (cancelled) return;
        const named = await Promise.all(raw.map(async (e) => {
          try {
            const snap = await getDoc(doc(db, 'users', e.uid));
            const name = snap.exists() ? (snap.data().displayName || 'Athlete') : 'Athlete';
            return { ...e, name };
          } catch {
            return { ...e, name: e.uid === user.uid ? 'You' : 'Athlete' };
          }
        }));
        if (!cancelled) setEntries(named.filter(e => e.value > 0));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user, activeTab]);

  const currentUnit = TABS.find(t => t.key === activeTab)?.unit || 'pts';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-2.5 rounded-lg hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-extrabold">Leaderboard</h2>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Entry list */}
      <div className="space-y-1.5">
        {loading && (
          <>
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </>
        )}

        {!loading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No activity this week. Follow athletes and start training!
          </p>
        )}

        {!loading && entries.map(entry => (
          <div
            key={entry.uid}
            className={`flex items-center gap-3 p-2.5 rounded-lg ${
              entry.uid === user?.uid ? 'bg-primary/5 border border-primary/15' : ''
            }`}
          >
            <span
              className="w-6 text-sm font-bold text-center shrink-0"
              style={{ color: entry.rank <= 3 ? RANK_COLORS[entry.rank - 1] : undefined }}
            >
              {entry.rank}
            </span>
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
              {(entry.uid === user?.uid ? 'Y' : (entry.name || '?').charAt(0)).toUpperCase()}
            </div>
            <span className="text-sm font-medium flex-1 truncate">
              {entry.uid === user?.uid ? 'You' : entry.name}
            </span>
            <span className="text-sm font-mono tabular-nums font-bold">
              {entry.value.toLocaleString()}{' '}
              <span className="text-xs text-muted-foreground font-normal">{currentUnit}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
