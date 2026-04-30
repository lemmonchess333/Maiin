import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Zap } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { buildLeaderboard, type LeaderboardEntry, type ChallengeType } from '../../lib/leaderboard';
import { Skeleton } from '../LoadingSkeleton';
import Avatar from '../Avatar';
import BlockAwareAvatar from './BlockAwareAvatar';

interface EnrichedEntry extends LeaderboardEntry {
  photoURL?: string;
}

const TABS: { key: ChallengeType; label: string; unit: string }[] = [
  { key: 'weekly_hybrid', label: 'Hybrid Score', unit: 'pts' },
  { key: 'weekly_volume', label: 'Lifting Volume', unit: 'kg' },
  { key: 'weekly_distance', label: 'Running Distance', unit: 'km' },
  { key: 'weekly_workouts', label: 'Workouts', unit: 'sessions' },
];

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function FullLeaderboard({ onBack }: { onBack: () => void }) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ChallengeType>('weekly_hybrid');
  const [entries, setEntries] = useState<EnrichedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Source from `users/{uid}/public/profile` (cross-user readable) —
  // pre-W1d this read `users/{uid}` (owner-only), which silently
  // failed for everyone except the current user and left them all
  // rendered as "Athlete".
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const raw = await buildLeaderboard(user.uid, activeTab);
      const enriched = await Promise.all(raw.map(async (e) => {
        try {
          const snap = await getDoc(doc(db, 'users', e.uid, 'public', 'profile'));
          const data = snap.data() as { displayName?: string; photoURL?: string } | undefined;
          return {
            ...e,
            name: data?.displayName || (e.uid === user.uid ? 'You' : 'Athlete'),
            photoURL: data?.photoURL,
          } as EnrichedEntry;
        } catch {
          return { ...e, name: e.uid === user.uid ? 'You' : 'Athlete' } as EnrichedEntry;
        }
      }));
      setEntries(enriched.filter((e) => e.value > 0));
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    let cancelled = false;
    load().catch(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [load]);

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
          <ChevronLeft className="w-5 h-5" />
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
          <div className="text-center py-10 space-y-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(123,114,233,0.12)' }}>
              <Zap size={24} style={{ color: '#7B72E9' }} />
            </div>
            <p className="text-sm font-medium text-foreground">No activity this week</p>
            <p className="text-xs text-muted-foreground">Follow athletes and start training to see rankings</p>
          </div>
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
            {entry.uid === user?.uid ? (
              <Avatar
                photoURL={entry.photoURL}
                displayName="You"
                fallbackInitial={profile?.displayName?.charAt(0) || user?.displayName?.charAt(0)}
                size="sm"
              />
            ) : (
              <BlockAwareAvatar
                uid={entry.uid}
                photoURL={entry.photoURL}
                displayName={entry.name}
                size="sm"
              />
            )}
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
