import { useState, useEffect, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  useChallenges,
  useAutoJoinChallenge,
  getTimeRemaining,
} from "./useChallenges";
import { getWeeklyAccountability } from "./weeklyAccountability";
import { ChallengeCard } from "./ChallengeCard";
import { ChallengeFinaleCard } from "./ChallengeFinaleCard";
import CollectivePulse from "./CollectivePulse";
import { Trophy, ChevronRight } from "lucide-react";
import { THEME, RANK_COLORS } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { buildLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";

interface EnrichedEntry extends LeaderboardEntry {
  photoURL?: string;
}

export function ChallengeList({
  onFindFriends,
  refreshRef,
}: {
  onFindFriends?: () => void;
  /** SOC-P1d: CommunityView's pull-to-refresh awaits this section's
   *  progress refetch (challenge docs are already a live subscription). */
  refreshRef?: MutableRefObject<(() => Promise<void>) | null>;
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const {
    challenges,
    myChallenges,
    availableChallenges,
    myEndedChallenges,
    myProgress,
    leaderboards,
    loading,
    joinChallenge,
    leaveChallenge,
    refreshProgress,
  } = useChallenges();

  /* SOC-P1d: publish the progress refetch for the shell's pull-to-refresh
     (effect-time sync — latest-ref pattern). */
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = refreshProgress;
  }, [refreshRef, refreshProgress]);

  const [weeklyRankings, setWeeklyRankings] = useState<EnrichedEntry[]>([]);
  // SOC-P1e: not-joined challenges collapse behind a disclosure row.
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const [rankingsLoading, setRankingsLoading] = useState(true);

  // Find the weekly warrior challenge
  const weeklyCh = challenges.find(
    (c) => c.type === "weekly" && c.metric === "workout_count"
  );
  const isJoined = weeklyCh ? !!myProgress[weeklyCh.id] : false;

  // Auto-enrolment (SOC-P1a): Weekly Warrior (the original precedent) and
  // the global monthly hybrid — both are challenges every user is honestly
  // IN from day one, so their cards never read as a locked "0 joined" door.
  const hybridCh = challenges.find(
    (c) => c.id.startsWith("global-monthly-") && c.metric === "hybrid_score"
  );
  useAutoJoinChallenge(user ? weeklyCh : undefined, isJoined, joinChallenge);
  useAutoJoinChallenge(
    user ? hybridCh : undefined,
    hybridCh ? !!myProgress[hybridCh.id] : false,
    joinChallenge
  );

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
  /* SOC-P1e: the collective (group_goal) challenge is promoted into the
     CollectivePulse strip at the top of the section — the one ambient
     signal that moves at any user count — so it leaves the card lists. */
  const collectiveCh = challenges.find((c) => (c.collectiveTarget ?? 0) > 0);
  const otherMy = myChallenges.filter(
    (c) => c.id !== weeklyCh?.id && c.id !== collectiveCh?.id
  );
  const otherAvailable = availableChallenges.filter(
    (c) => c.id !== weeklyCh?.id && c.id !== collectiveCh?.id
  );
  /* Soonest-ending available challenge keeps the time pressure visible
     on the collapsed row ("5 days left" was a real join driver). */
  const soonestAvailable =
    otherAvailable.length > 0
      ? getTimeRemaining(
          otherAvailable.reduce((a, b) =>
            a.endDate.toDate() <= b.endDate.toDate() ? a : b
          ).endDate
        )
      : null;

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
  // tab collapse, ChallengeList sat at the top of the Crews tab —
  // a giant centered card pushed the rest of the tab below the
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

  /* Accountability-first framing (Phase 1). The weekly card leads with the
     next useful action, not a ranking — beginners, returning users, and
     anyone with a sparse social graph get a personal consistency loop instead
     of a comparison surface. The leaderboard stays below as secondary detail.
     Population is the follow graph (buildLeaderboard reads following/{uid}),
     so copy says "people you follow", never "crew". Cold-start (no follows /
     nobody trained) falls back to a PERSONAL goal, not fake social proof. */
  const myWeeklyCount =
    weeklyRankings.find((e) => e.uid === user?.uid)?.value ?? 0;
  const othersTrained = weeklyRankings.filter(
    (e) => e.uid !== user?.uid
  ).length;
  const target = weeklyCh?.tiers.bronze ?? 2;
  const {
    title: accTitle,
    sub: accSub,
    ctaLabel,
    ctaTo,
    goalMet,
  } = getWeeklyAccountability({ myWeeklyCount, othersTrained, target });

  return (
    <div className="space-y-4">
      {/* SOC-P1e — collective pulse leads the section: honest ambient
          liveness (the km total moves whenever anyone runs). */}
      {collectiveCh && (
        <CollectivePulse
          challenge={collectiveCh}
          leaderboard={leaderboards[collectiveCh.id]}
        />
      )}

      {/* Finale cards — challenges the user took part in that ended within
          the last 7 days. Closure for the effort; dismiss-once per id. */}
      {myEndedChallenges.map((ch) => (
        <ChallengeFinaleCard
          key={ch.id}
          challenge={ch}
          myProgress={myProgress[ch.id]}
          leaderboard={leaderboards[ch.id]}
          selfUid={user?.uid}
        />
      ))}

      {/* Weekly accountability card — action first, ranking second */}
      <div className="p-4 rounded-2xl bg-card border border-border/50 card-shadow">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="size-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: goalMet
                ? `${THEME.semantic.positive}14`
                : `${THEME.brand}14`,
            }}
          >
            <Trophy
              size={18}
              style={{
                color: goalMet ? THEME.semantic.positive : THEME.brand,
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold leading-snug text-foreground">
              {accTitle}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              {accSub}
            </p>
          </div>
          {timeLeft && (
            <span className="text-caption text-muted-foreground shrink-0 mt-0.5">
              {timeLeft}
            </span>
          )}
        </div>

        {/* Primary action — its own control, 44px target, sport-coded. */}
        <button
          type="button"
          onClick={() => {
            haptic("light");
            navigate(ctaTo);
          }}
          className="w-full min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white motion-safe:active:scale-[0.99] transition-transform"
          style={{
            background: goalMet ? THEME.semantic.positive : THEME.brand,
          }}
        >
          {ctaLabel}
          <ChevronRight size={16} />
        </button>

        {/* Secondary: this-week standings among people you follow. */}
        {(rankingsLoading || weeklyRankings.length > 0) && (
          <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            This week
          </p>
        )}

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
          <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
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

      {/* Other available challenges — SOC-P1e: collapsed behind a
          disclosure row. Three full photo-header cards of not-joined
          challenges dominated Together with equal weight to the joined
          surface; the row keeps the entry (with the soonest deadline's
          urgency) without three competing lobbies above the fold. */}
      {otherAvailable.length > 0 &&
        (showAllAvailable ? (
          <div className="space-y-2">
            <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
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
        ) : (
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowAllAvailable(true)}
          >
            See all challenges · {otherAvailable.length}
            {soonestAvailable ? ` · ${soonestAvailable}` : ""}
          </Button>
        ))}

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
