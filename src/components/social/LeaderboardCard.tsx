import { useState } from 'react';
import { useAuth } from '../../lib/auth';

interface LeaderboardEntry {
  uid: string;
  name: string;
  value: number;
  rank: number;
}

type ChallengeType = 'weekly_distance' | 'weekly_volume' | 'weekly_hybrid';

export default function LeaderboardCard({ challenge = 'weekly_hybrid' }: { challenge?: ChallengeType }) {
  const { user } = useAuth();
  const [entries] = useState<LeaderboardEntry[]>([]);

  const challengeLabels: Record<ChallengeType, { title: string; unit: string; icon: string }> = {
    weekly_distance: { title: 'Weekly Distance', unit: 'km', icon: '🏃' },
    weekly_volume: { title: 'Weekly Volume', unit: 'kg', icon: '🏋️' },
    weekly_hybrid: { title: 'Hybrid Score', unit: 'pts', icon: '⚡' },
  };

  const { title, unit, icon } = challengeLabels[challenge];

  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">This Week</span>
      </div>

      <div className="space-y-2">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Follow users to see the leaderboard. Compete on distance, volume, or both!
          </p>
        )}
        {entries.map(entry => (
          <div key={entry.uid}
            className={`flex items-center gap-3 p-2 rounded-lg ${
              entry.uid === user?.uid ? 'bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800' : ''
            }`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
              entry.rank === 2 ? 'bg-gray-200 text-gray-600' :
              entry.rank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-muted text-muted-foreground'
            }`}>
              {entry.rank}
            </span>
            <span className="text-sm font-medium flex-1 truncate">{entry.name}</span>
            <span className="text-sm font-mono tabular-nums font-semibold">
              {entry.value.toLocaleString()} <span className="text-[10px] text-muted-foreground">{unit}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3">
        Hybrid Score = (km run × 100) + (kg lifted × 0.1)
      </p>
    </div>
  );
}
