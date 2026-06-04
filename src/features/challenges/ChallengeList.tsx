import { useState, useEffect, useRef } from "react";
import { useChallenges, getTimeRemaining, TIER_COLORS } from "./useChallenges";
import { ChallengeCard } from "./ChallengeCard";
import { Trophy } from "lucide-react";
import { THEME, RANK_COLORS } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { buildLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";

interface EnrichedEntry extends LeaderboardEntry {
  photoURL?: string;
}

export function ChallengeList({
  onFindFriends,
}: {
  onFindFriends?: () => void;
}) {
  const { user, profile } = useAuth();
  const {
    challenges,
    myChallenges,
    availableChallenges,
    myProgress,
    leaderboards,
    loading,
    joinChallenge,
    leaveChallenge,
  } = useChallenges();
  const [weeklyRankings, setWeeklyRankings] = useState<EnrichedEntry[]>([]);
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const autoJoinedRef = useRef(false);

  // Find the weekly warrior challenge
  const weeklyCh = challenges.find(
    (c) => c.type === "weekly" && c.metric === "workout_count"
  );
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
    buildLeaderboard(user.uid, "weekly_workouts")
      .then(async (raw) => {
        if (cancelled) return;
        const { getDoc, doc } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase");
        // Source from `users/{uid}/public/profile` (cross-user readable) —
        // the owner-only `users/{uid}` path silently failed for anyone
        // other than the current user and left them all rendered as
        // "Athlete". Same bug + fix as LeaderboardCard / FullLeaderboard.
        const enriched = await Promise.all(
          raw.map(async (e) => {
            try {
              const snap = await getDoc(
                doc(db, "users", e.uid, "public", "profile")
              );
              const data = snap.data() as
                | { displayName?: string; photoURL?: string }
                | undefined;
              return {
                ...e,
                name:
                  data?.displayName || (e.uid === user.uid ? "You" : "Athlete"),
                photoURL: data?.photoURL,
              } as EnrichedEntry;
            } catch {
              return {
                ...e,
                name: e.uid === user.uid ? "You" : "Athlete",
              } as EnrichedEntry;
            }
          })
        );
        if (!cancelled) {
          setWeeklyRankings(enriched.filter((e) => e.value > 0));
          setRankingsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setRankingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Other challenges (non-weekly)
  const otherMy = myChallenges.filter((c) => c.id !== weeklyCh?.id);
  const otherAvailable = availableChallenges.filter(
    (c) => c.id !== weeklyCh?.id
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // No friends at all → compact inline prompt.
  // Previously rendered as a full centered EmptyState. After PR 2's
  // tab collapse, ChallengeList sits at the top of the Crews tab —
  // a giant centered card pushed the actual crews list below the
  // fold. Inline single-line prompt keeps the entry point without
  // dominating the surface.
  if (
    weeklyRankings.length === 0 &&
    !rankingsLoading &&
    challenges.length === 0
  ) {
    return (
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${THEME.brand}14` }}
          >
            <Trophy size={16} style={{ color: THEME.brand }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              No active challenges
            </p>
            <p className="text-xs text-muted-foreground truncate">
              Follow people to compete weekly
            </p>
          </div>
        </div>
        {onFindFriends && (
          <button
            type="button"
            onClick={onFindFriends}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0"
          >
            Find people
          </button>
        )}
      </div>
    );
  }

  const maxValue = weeklyRankings.length > 0 ? weeklyRankings[0].value : 1;
  const timeLeft = weeklyCh ? getTimeRemaining(weeklyCh.endDate) : "";

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
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 rounded-lg bg-muted animate-pulse"
                />
              ))}
            </div>
          )}

          {!rankingsLoading && weeklyRankings.length === 0 && (
            <div className="text-center py-6 space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                No workouts logged this week yet
              </p>
              <p className="text-xs text-muted-foreground">
                Be the first to get on the board!
              </p>
            </div>
          )}

          {!rankingsLoading &&
            weeklyRankings.map((entry) => {
              const barWidth =
                maxValue > 0 ? (entry.value / maxValue) * 100 : 0;
              return (
                <div
                  key={entry.uid}
                  className={`flex items-center gap-2.5 p-2 rounded-lg ${
                    entry.uid === user?.uid
                      ? "bg-primary/5 border border-primary/15"
                      : ""
                  }`}
                >
                  <span
                    className="w-5 text-xs font-bold text-center shrink-0"
                    style={{
                      color:
                        entry.rank <= 3
                          ? RANK_COLORS[entry.rank - 1]
                          : undefined,
                    }}
                  >
                    {entry.rank}
                  </span>
                  {entry.uid === user?.uid ? (
                    <Avatar
                      photoURL={entry.photoURL}
                      displayName="You"
                      /* Prefer Firestore profile.displayName because
                       Firebase Auth's user.displayName is often
                       empty for email/password signups. */
                      fallbackInitial={
                        profile?.displayName?.charAt(0) ||
                        user?.displayName?.charAt(0)
                      }
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium truncate">
                        {entry.uid === user?.uid ? "You" : entry.name}
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
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your challenges
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
              /* leaveChallenge is async; ChallengeCard awaits it for
                 the busy flag. Wrapping in arrow keeps the type as
                 `() => Promise<void>` rather than the `(id) =>` shape. */
            />
          ))}
        </div>
      )}

      {/* Other available challenges */}
      {otherAvailable.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
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

      {/* "More coming soon" placeholder removed in PR-bug-fix:
          PR 5 actually shipped two new challenges (Fastest 5K,
          Together 1,000km) so the caption was lying to users and the
          "Notify me" button asked them to be notified about features
          that already exist. ChallengeList already renders all
          available challenges from the global collection, so no
          replacement copy is needed. */}
    </div>
  );
}
