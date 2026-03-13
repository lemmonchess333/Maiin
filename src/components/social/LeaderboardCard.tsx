import { Footprints, Dumbbell, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { collection, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface LeaderboardEntry {
  uid: string;
  name: string;
  value: number;
  rank: number;
}

type ChallengeType = 'weekly_distance' | 'weekly_volume' | 'weekly_hybrid';

async function buildLeaderboard(
  currentUid: string,
  challenge: ChallengeType
): Promise<LeaderboardEntry[]> {
  // Get the current user's following list
  const followingSnap = await getDocs(collection(db, 'following', currentUid, 'users'));
  const uids = [currentUid, ...followingSnap.docs.map(d => d.id)];

  const since = new Date();
  since.setDate(since.getDate() - since.getDay()); // start of this week
  since.setHours(0, 0, 0, 0);
  const sinceTs = Timestamp.fromDate(since);

  const entries: { uid: string; value: number }[] = [];

  await Promise.all(uids.map(async (uid) => {
    let value = 0;

    if (challenge === 'weekly_distance' || challenge === 'weekly_hybrid') {
      const runsSnap = await getDocs(
        query(collection(db, 'users', uid, 'runs'),
          where('completedAt', '>=', sinceTs), orderBy('completedAt'), limit(50))
      );
      const km = runsSnap.docs.reduce((s, d) => s + (d.data().distance || 0) / 1000, 0);
      if (challenge === 'weekly_distance') value = Math.round(km * 10) / 10;
      else value += km * 100;
    }

    if (challenge === 'weekly_volume' || challenge === 'weekly_hybrid') {
      const workoutsSnap = await getDocs(
        query(collection(db, 'users', uid, 'workouts'),
          where('date', '>=', since.toISOString().split('T')[0]), orderBy('date'), limit(50))
      );
      const kg = workoutsSnap.docs.reduce((s, d) => {
        return s + (d.data().exercises || []).reduce((es: number, ex: any) =>
          es + (ex.sets || []).reduce((ss: number, set: any) =>
            ss + (set.weightKg || 0) * (set.reps || 0), 0), 0);
      }, 0);
      if (challenge === 'weekly_volume') value = Math.round(kg);
      else value += kg * 0.1;
    }

    entries.push({ uid, value: Math.round(value * 10) / 10 });
  }));

  return entries
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({
      uid: e.uid,
      name: '',  // filled below
      value: e.value,
      rank: i + 1,
    }));
}

export default function LeaderboardCard({ challenge = 'weekly_hybrid' }: { challenge?: ChallengeType }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const challengeLabels: Record<ChallengeType, { title: string; unit: string; icon: string }> = {
    weekly_distance: { title: 'Weekly Distance', unit: 'km', icon: 'footprints' },
    weekly_volume: { title: 'Weekly Volume', unit: 'kg', icon: 'dumbbell' },
    weekly_hybrid: { title: 'Hybrid Score', unit: 'pts', icon: 'zap' },
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    buildLeaderboard(user.uid, challenge)
      .then(async (raw) => {
        // Fetch display names
        const named = await Promise.all(raw.map(async (e) => {
          try {
            const snap = await getDocs(
              query(collection(db, 'users'), where('uid', '==', e.uid), limit(1))
            );
            const name = snap.docs[0]?.data()?.displayName || 'Athlete';
            return { ...e, name };
          } catch {
            return { ...e, name: e.uid === user.uid ? 'You' : 'Athlete' };
          }
        }));
        setEntries(named.filter(e => e.value > 0));
      })
      .finally(() => setLoading(false));
  }, [user, challenge]);

  const { title, unit, icon } = challengeLabels[challenge];

  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-3">
        {icon === 'footprints' ? <Footprints size={16} className='text-green-500' /> : icon === 'dumbbell' ? <Dumbbell size={16} className='text-purple-500' /> : <Zap size={16} className='text-amber-500' />}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">This Week</span>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-xs text-muted-foreground text-center py-3 animate-pulse">Loading...</p>}

        {!loading && entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Follow users to see the leaderboard. Compete on distance, volume, or both!
          </p>
        )}

        {entries.map(entry => (
          <div key={entry.uid}
            className={`flex items-center gap-3 p-2 rounded-lg ${
              entry.uid === user?.uid ? 'bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800' : ''
            }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
              entry.rank === 2 ? 'bg-gray-200 text-gray-600' :
              entry.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              {entry.rank}
            </span>
            <span className="text-sm font-medium flex-1 truncate">
              {entry.uid === user?.uid ? 'You' : entry.name}
            </span>
            <span className="text-sm font-mono tabular-nums font-semibold">
              {entry.value.toLocaleString()} <span className="text-[10px] text-muted-foreground">{unit}</span>
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}