import { useState, useEffect, useRef } from "react";
import { useChallenges, getTimeRemaining, TIER_COLORS } from "./useChallenges";
import { ChallengeCard } from "./ChallengeCard";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { THEME } from "@/lib/theme";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { buildLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";

export function ChallengeList({ onFindFriends }: { onFindFriends?: () => void }) {
  const { user } = useAuth();
  const { challenges, myChallenges, availableChallenges, myProgress, leaderboards, loading, joinChallenge, leaveChallenge } = useChallenges();
  const [notifyRequested, setNotifyRequested] = useState(
    () => !!localStorage.getItem('tropos_challenge_notify')
  );
  const [weeklyRankings, setWeeklyRankings] = useState<LeaderboardEntry[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const autoJoinedRef = useRef(false);

  // Find the weekly warrior challenge
  const weeklyCh = challenges.find(c => c.type === 'weekly' && c.metric === 'workout_count');
  const isJoined = weeklyCh ? !!myProgress[weeklyCh.id] : false;

  // Auto-join weekly warrior
  useEffect(() => {
    if (!weeklyCh || isJoined || autoJoinedRef.current || !user) return;
    autoJoinedRef.current = true;
    joinChallenge(weeklyCh.id).catch(() => {});
  }, [weeklyCh, isJoined, user, joinChallenge]);

  // Build friend workout rankings for the weekly card
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setRankingsLoading(true);
    buildLeaderboard(user.uid, 'weekly_workouts').then(async (raw) => {
      if (cancelled) return;
      const { getDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const named = await Promise.all(raw.map(async (e) => {
        try {
          const snap = await getDoc(doc(db, 'users', e.uid));
          const name = snap.exists() ? (snap.data().displayName || 'Athlete') : 'Athlete';
          return { ...e, name };
        } catch {
          return { ...e, name: e.uid === user.uid ? 'You' : 'Athlete' };
        }
      }));
      if (!cancelled) {
        setWeeklyRankings(named.filter(e => e.value > 0));
        setRankingsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setRankingsLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  // Other challenges (non-weekly)
  const otherMy = myChallenges.filter(c => c.id !== weeklyCh?.id);
  const otherAvailable = availableChallenges.filter(c => c.id !== weeklyCh?.id);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // No friends at all → empty state
  if (weeklyRankings.length === 0 && !rankingsLoading && challenges.length === 0) {
    return (
      <EmptyState
        icon={<Trophy size={28} />}
        title="Compete with friends"
        description="Follow athletes to see how you rank against each other this week"
        accentColor={THEME.brand}
        action={onFindFriends ? { label: 'Find Friends', onClick: onFindFriends } : undefined}
      />
    );
  }

  const maxValue = weeklyRankings.length > 0 ? weeklyRankings[0].value : 1;
  const timeLeft = weeklyCh ? getTimeRemaining(weeklyCh.endDate) : '';

  return (
    <div className="space-y-4">
      {/* Weekly Workout Challenge */}
      <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={18} style={{ color: TIER_COLORS.gold }} />
          <h3 className="text-sm font-bold flex-1">Weekly Workout Challenge</h3>
          {timeLeft && (
            <span className="text-xs text-muted-foreground">{timeLeft}</span>
          )}
        </div>

        <div className="space-y-1.5">
          {rankingsLoading && (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!rankingsLoading && weeklyRankings.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No workouts logged this week yet. Be the first!
            </p>
          )}

          {!rankingsLoading && weeklyRankings.map(entry => {
            const barWidth = maxValue > 0 ? (entry.value / maxValue) * 100 : 0;
            return (
              <div
                key={entry.uid}
                className={`flex items-center gap-2.5 p-2 rounded-lg ${
                  entry.uid === user?.uid ? 'bg-primary/5 border border-primary/15' : ''
                }`}
              >
                <span
                  className="w-5 text-xs font-bold text-center shrink-0"
                  style={{ color: entry.rank <= 3 ? ['#FFD700', '#C0C0C0', '#CD7F32'][entry.rank - 1] : undefined }}
                >
                  {entry.rank}
                </span>
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                  {(entry.uid === user?.uid ? 'Y' : (entry.name || '?').charAt(0)).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium truncate">
                      {entry.uid === user?.uid ? 'You' : entry.name}
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold ml-2 shrink-0">
                      {entry.value}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Other joined challenges */}
      {otherMy.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Your Challenges
          </p>
          {otherMy.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              myProgress={myProgress[ch.id]}
              leaderboard={leaderboards[ch.id]}
              joined
              onJoin={() => {}}
              onLeave={() => leaveChallenge(ch.id)}
            />
          ))}
        </div>
      )}

      {/* Other available challenges */}
      {otherAvailable.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Available
          </p>
          {otherAvailable.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              leaderboard={leaderboards[ch.id]}
              joined={false}
              onJoin={() => joinChallenge(ch.id)}
              onLeave={() => {}}
            />
          ))}
        </div>
      )}

      {/* More coming soon card */}
      <div className="p-4 rounded-xl border border-border/30 bg-muted/30 text-center">
        <p className="text-xs text-muted-foreground">
          More challenges coming soon — we'll notify you
        </p>
        {!notifyRequested && (
          <button
            onClick={() => {
              localStorage.setItem('tropos_challenge_notify', '1');
              setNotifyRequested(true);
              toast.success("You'll be notified when new challenges launch!");
            }}
            className="mt-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Notify me
          </button>
        )}
      </div>
    </div>
  );
}
