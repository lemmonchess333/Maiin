import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Clock, Trophy } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import SectionLabel from "@/components/ui/SectionLabel";
import PhotoCaption from "@/components/ui/PhotoCaption";
import { Button } from "@/components/ui/Button";
import { SECONDARY_ON_CARD_EDGE } from "@/components/ui/buttonClasses";
import Avatar from "@/components/Avatar";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { countMyWeekLifts } from "@/lib/leaderboard";
import { challengeEditorialImage } from "@/lib/editorialImages";
import { THEME, RANK_COLORS } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { rankNamedBoard, useFriendsBoard } from "@/hooks/useFriendsBoard";
import { finalDayLine, inFinalDay } from "./challengeEditions";
import { challengeSport, SPORT_ACCENT } from "./challengeSport";
import { getTimeRemaining, type Challenge } from "./useChallenges";
import { getWeeklyAccountability } from "./weeklyAccountability";

/**
 * This week's challenge on Together: the week's photo, shorter than a
 * challenge's own hero, then the next useful action, then where the
 * person stands among the people they follow.
 *
 * Accountability first: the card leads with the action, not a ranking.
 * The population is the follow graph (the friends board), so the copy
 * says "people you follow"; with no follows, or nobody trained, it falls
 * back to a personal goal rather than social proof (`weeklyAccountability`).
 *
 * `leads`: its action is the page's one filled button, unless the page
 * has a Start a circle card, which takes that place (no Circle yet).
 *
 * With no challenges and nobody on the board it is one short line instead,
 * pointing at People.
 */
export default function WeeklyChallengeCard({
  weekly,
  joined,
  hasChallenges,
  leads = true,
  onJoin,
  onLeave,
  onFindFriends,
}: {
  weekly: Challenge | undefined;
  joined: boolean;
  /** Whether any challenge is live: with none, and nobody on the board,
   *  the card gives way to the short "No active challenges" line. */
  hasChallenges: boolean;
  leads?: boolean;
  onJoin: (challenge: Challenge) => Promise<void>;
  onLeave: (challenge: Challenge) => Promise<void>;
  onFindFriends?: () => void;
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  /* This week's lift standings among you and the people you follow who
     share their week (the friends board's tallies). The accountability
     line reads your own count from your own sessions, so it holds
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
  const [busy, setBusy] = useState(false);

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

  async function changeMembership() {
    if (!weekly || busy) return;
    setBusy(true);
    haptic("light");
    try {
      if (joined) await onLeave(weekly);
      else await onJoin(weekly);
    } finally {
      setBusy(false);
    }
  }

  if (weeklyRankings.length === 0 && !rankingsLoading && !hasChallenges) {
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
  const closing = !!weekly && !joined && inFinalDay(weekly.endDate);
  const timeLeft = weekly && !closing ? getTimeRemaining(weekly.endDate) : "";
  const othersTrained = weeklyRankings.filter(
    (e) => e.uid !== user?.uid
  ).length;
  const target = weekly?.tiers.bronze ?? 2;
  const { title, sub, ctaLabel, ctaTo, goalMet } = getWeeklyAccountability({
    myWeeklyCount,
    othersTrained,
    target,
    ...(weekly && !joined ? { unjoined: { name: weekly.name } } : {}),
  });
  const photo = weekly ? challengeEditorialImage(weekly) : null;
  const accent = weekly ? SPORT_ACCENT[challengeSport(weekly.metric)] : "";
  /* On the photo the challenge's name is the caption, so the line under
     it does not say it again. */
  const showTitle = !(photo && weekly && title === weekly.name);
  const actionStyle = leads
    ? {}
    : {
        variant: "secondary" as const,
        className: SECONDARY_ON_CARD_EDGE,
      };

  return (
    <div className="rounded-2xl bg-card border border-border/50 card-shadow overflow-hidden">
      {photo && weekly && (
        <div className="relative h-28 overflow-hidden border-b border-border/50">
          <img
            src={photo}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(150deg, ${accent}59 0%, ${accent}1F 60%, transparent 100%)`,
            }}
          />
          <PhotoCaption onPhoto className="px-[16px]">
            {timeLeft && (
              <SectionLabel className="flex items-center gap-1 text-white/85">
                <Clock className="size-3" aria-hidden />
                {timeLeft}
              </SectionLabel>
            )}
            <p className="text-lg font-bold leading-tight line-clamp-2 break-words mt-0.5 text-white">
              {weekly.name}
            </p>
          </PhotoCaption>
        </div>
      )}
      <div className="p-4">
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
              {showTitle && (
                <h3 className="text-sm font-bold leading-snug text-foreground">
                  {title}
                </h3>
              )}
              <p
                className={cn(
                  "leading-snug",
                  showTitle
                    ? "text-xs text-muted-foreground mt-0.5"
                    : "text-sm text-foreground pt-2"
                )}
              >
                {sub}
              </p>
            </div>
            {timeLeft && !photo && (
              <span className="text-caption text-muted-foreground shrink-0 mt-0.5">
                {timeLeft}
              </span>
            )}
          </div>
        </div>

        {closing && weekly ? (
          <p className="text-sm text-muted-foreground">
            {finalDayLine(weekly.endDate)}
          </p>
        ) : weekly && !joined ? (
          <Button
            fullWidth
            loading={busy}
            onClick={changeMembership}
            aria-label="Join weekly challenge"
            {...actionStyle}
          >
            Join challenge
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                haptic("light");
                navigate(ctaTo);
              }}
              rightIcon={<ChevronRight size={16} />}
              {...actionStyle}
              className={cn("min-w-0 flex-1", actionStyle.className)}
            >
              {ctaLabel}
            </Button>
            {weekly && (
              <Button
                variant="ghost"
                loading={busy}
                onClick={changeMembership}
                aria-label="Leave weekly challenge"
              >
                Leave
              </Button>
            )}
          </div>
        )}

        {/* Secondary: this week's standings among people you follow. */}
        {(rankingsLoading || weeklyRankings.length > 0) && (
          <SectionHeading as="h3" size="compact" className="mt-4 mb-2">
            People you follow
          </SectionHeading>
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
    </div>
  );
}
