import SectionHeading from "@/components/ui/SectionHeading";
import { useState, useEffect, type MutableRefObject } from "react";
import { useNavigate } from "react-router-dom";
import {
  useChallenges,
  getTimeRemaining,
  moreChallengesLabel,
  type Challenge,
} from "./useChallenges";
import { getWeeklyAccountability } from "./weeklyAccountability";
import { featuredChallengesFirst, isFeaturedChallenge } from "./challengeOrder";
import {
  cardsShowingTimeLeft,
  finalDayLine,
  inFinalDay,
  joinedMessage,
} from "./challengeEditions";
import { ChallengeCard } from "./ChallengeCard";
import ChallengeRow from "./ChallengeRow";
import { ChallengeFinaleCard } from "./ChallengeFinaleCard";
import CollectivePulse from "./CollectivePulse";
import { Trophy, ChevronRight } from "lucide-react";
import { THEME, RANK_COLORS } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/cardClasses";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { countMyWeekLifts } from "@/lib/leaderboard";
import { rankNamedBoard, useFriendsBoard } from "@/hooks/useFriendsBoard";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import RestrictedNotice from "@/components/social/RestrictedNotice";

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
    restricted,
  } = useChallenges();

  /* SOC-P1d: publish the progress refetch for the shell's pull-to-refresh
     (effect-time sync — latest-ref pattern). */
  useEffect(() => {
    if (!refreshRef) return;
    refreshRef.current = refreshProgress;
  }, [refreshRef, refreshProgress]);

  /* This week's lift standings among you and the people you follow who
     share their week (the friends board's tallies). The accountability
     card below reads your own count from your own sessions, so it holds
     whether or not you share. Both are stamped with the account they were
     read for, so another account reads as loading from its first render. */
  const board = useFriendsBoard();
  const rankingsLoading = board.loading;
  const weeklyRankings = rankNamedBoard(board.weeks, "weekly_workouts");
  const [myWeek, setMyWeek] = useState<{ uid: string; lifts: number } | null>(
    null
  );
  const myWeeklyCount =
    myWeek !== null && myWeek.uid === user?.uid ? myWeek.lifts : 0;
  // SOC-P1e: not-joined challenges collapse behind a disclosure row.
  const [showAllAvailable, setShowAllAvailable] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);

  // Find the weekly warrior challenge
  const weeklyCh = challenges.find(
    (c) => c.type === "weekly" && c.metric === "workout_count"
  );
  const weeklyJoined = !!(weeklyCh && myProgress[weeklyCh.id]);

  /* Joining confirms which edition the person is in and when the next
     one opens: each edition is joined on its own. */
  async function join(challenge: Challenge) {
    if (await joinChallenge(challenge.id))
      toast.success(joinedMessage(challenge));
  }

  async function changeWeeklyMembership() {
    if (!weeklyCh || weeklyBusy) return;
    setWeeklyBusy(true);
    haptic("light");
    try {
      if (weeklyJoined) await leaveChallenge(weeklyCh.id);
      else await join(weeklyCh);
    } finally {
      setWeeklyBusy(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    countMyWeekLifts(user.uid).then(
      (lifts) => {
        if (!cancelled) setMyWeek({ uid: user.uid, lifts });
      },
      // A failed read keeps the count it had: the card's copy then reads
      // as the week before the read, never as a week of nothing.
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Other challenges (non-weekly)
  /* SOC-P1e: the collective (group_goal) challenge is promoted into the
     CollectivePulse strip at the top of the section — the one ambient
     signal that moves at any user count — so it leaves the card lists. */
  const collectiveCh = challenges.find((c) => (c.collectiveTarget ?? 0) > 0);
  const otherMy = featuredChallengesFirst(
    myChallenges.filter(
      (c) => c.id !== weeklyCh?.id && c.id !== collectiveCh?.id
    )
  );
  const otherAvailable = featuredChallengesFirst(
    availableChallenges.filter(
      (c) => c.id !== weeklyCh?.id && c.id !== collectiveCh?.id
    )
  );
  // The one rotating invitation stays visible; core goals retain the compact
  // disclosure until someone chooses to browse the rest.
  const featuredAvailable = otherAvailable.find(isFeaturedChallenge);
  const remainingAvailable = otherAvailable.filter(
    (c) => c.id !== featuredAvailable?.id
  );
  // Time left is said once for the month, and again only by a challenge
  // that ends on another day.
  const showsTimeLeft = cardsShowingTimeLeft([
    ...otherMy,
    ...(featuredAvailable ? [featuredAvailable] : []),
    ...remainingAvailable,
  ]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-muted motion-safe:animate-pulse"
          />
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
            className="text-xs font-medium text-lifting-strong hover:text-lifting-strong/80 transition-colors shrink-0"
          >
            Find people
          </button>
        )}
      </div>
    );
  }

  const maxValue = weeklyRankings.length > 0 ? weeklyRankings[0].value : 1;
  /* In the week's last day a person who has not joined is offered no
     Join: nobody can meet the week's goal in its final hours. The card
     says when the next one starts instead, in place of the countdown. */
  const weeklyClosing =
    !!weeklyCh && !weeklyJoined && inFinalDay(weeklyCh.endDate);
  const timeLeft =
    weeklyCh && !weeklyClosing ? getTimeRemaining(weeklyCh.endDate) : "";

  /* Accountability-first framing (Phase 1). The weekly card leads with the
     next useful action, not a ranking — beginners, returning users, and
     anyone with a sparse social graph get a personal consistency loop instead
     of a comparison surface. The leaderboard stays below as secondary detail.
     Population is the follow graph (loadBoardWeeks reads following/{uid}),
     so copy says "people you follow", never "crew". Cold-start (no follows /
     nobody trained) falls back to a PERSONAL goal, not fake social proof. */
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
  } = getWeeklyAccountability({
    myWeeklyCount,
    othersTrained,
    target,
    ...(weeklyCh && !weeklyJoined ? { unjoined: { name: weeklyCh.name } } : {}),
  });

  return (
    <div className="space-y-4">
      {/* A restricted account can follow its challenges and leave them,
          but not join one (S4e). */}
      {restricted && availableChallenges.length > 0 && <RestrictedNotice />}

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
        {/* The icon and its gap in px, so larger text keeps the room for
            the words; the countdown drops under them once they would be
            narrower than 8em beside it, rather than running over the
            title at 320 px and double text. */}
        <div className="flex items-start gap-[12px] mb-3">
          <div
            className="size-[36px] rounded-xl flex items-center justify-center shrink-0"
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
          <div className="min-w-0 flex-1 flex flex-wrap items-start justify-between gap-x-[12px] gap-y-1">
            <div className="min-w-[min(8em,100%)] flex-1">
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
        </div>

        {weeklyClosing && weeklyCh ? (
          <p className="text-sm text-muted-foreground">
            {finalDayLine(weeklyCh.endDate)}
          </p>
        ) : weeklyCh && !weeklyJoined ? (
          <Button
            fullWidth
            loading={weeklyBusy}
            onClick={changeWeeklyMembership}
            aria-label="Join weekly challenge"
          >
            Join challenge
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-w-0 flex-1"
              disabled={weeklyBusy}
              onClick={() => {
                haptic("light");
                navigate(ctaTo);
              }}
              rightIcon={<ChevronRight size={16} />}
            >
              {ctaLabel}
            </Button>
            {weeklyCh && (
              <Button
                variant="ghost"
                loading={weeklyBusy}
                onClick={changeWeeklyMembership}
                aria-label="Leave weekly challenge"
              >
                Leave
              </Button>
            )}
          </div>
        )}

        {/* Secondary: this-week standings among people you follow. */}
        {(rankingsLoading || weeklyRankings.length > 0) && (
          <SectionHeading className="mt-4 mb-2">This week</SectionHeading>
        )}

        <div className="space-y-1.5">
          {rankingsLoading && (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-8 rounded-lg bg-muted motion-safe:animate-pulse"
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
                  {/* Numeral in the text colour, the medal metal as its
                      ring (see LeaderboardRow). */}
                  <span
                    className="min-w-5 h-5 px-0.5 rounded-full inline-flex items-center justify-center text-xs font-bold text-foreground shrink-0"
                    style={
                      entry.rank <= 3
                        ? {
                            boxShadow: `inset 0 0 0 2px ${RANK_COLORS[entry.rank - 1]}`,
                          }
                        : undefined
                    }
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
          <SectionHeading>Your challenges</SectionHeading>
          {otherMy.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              myProgress={myProgress[ch.id]}
              leaderboard={leaderboards[ch.id]}
              joined
              onJoin={() => {}}
              onLeave={() => leaveChallenge(ch.id)}
              showTimeLeft={showsTimeLeft.has(ch.id)}
            />
          ))}
        </div>
      )}

      {featuredAvailable && (
        <div className="space-y-2">
          <SectionHeading>Featured this month</SectionHeading>
          <ChallengeCard
            challenge={featuredAvailable}
            leaderboard={leaderboards[featuredAvailable.id]}
            joined={false}
            onJoin={() => join(featuredAvailable)}
            onLeave={() => {}}
            showTimeLeft={showsTimeLeft.has(featuredAvailable.id)}
          />
        </div>
      )}

      {/* The other available challenges, collapsed behind one row until
          someone chooses to browse them, then as compact rows in one
          grouped card: the big picture card is the featured one's alone,
          so the list does not read as five competing lobbies. */}
      {remainingAvailable.length > 0 &&
        (showAllAvailable ? (
          <div className="space-y-2">
            <SectionHeading>Available</SectionHeading>
            <ul
              className={cardClasses({
                size: "compact",
                padded: false,
                className:
                  "@container overflow-hidden divide-y divide-border/40",
              })}
            >
              {remainingAvailable.map((ch) => (
                <ChallengeRow
                  key={ch.id}
                  challenge={ch}
                  onJoin={() => join(ch)}
                  showTimeLeft={showsTimeLeft.has(ch.id)}
                />
              ))}
            </ul>
          </div>
        ) : (
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowAllAvailable(true)}
          >
            {moreChallengesLabel(remainingAvailable.length)}
          </Button>
        ))}
    </div>
  );
}
