import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Trophy } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { SECONDARY_ON_CARD_EDGE } from "@/components/ui/buttonClasses";
import LeaderboardRow from "@/components/social/LeaderboardRow";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { finalDayLine, inFinalDay } from "./challengeEditions";
import ChallengeMedalBand from "./ChallengeMedalBand";
import { countMyWeekLifts } from "./myWeekLifts";
import { challengeHasMedal } from "./rowMedal";
import {
  getTimeRemaining,
  type Challenge,
  type ChallengeParticipant,
} from "./useChallenges";
import { getWeeklyAccountability } from "./weeklyAccountability";

/** How many of the challenge's leaders the card shows. */
const TOP_SHOWN = 3;

/**
 * This week's challenge on Together: the medal the week is working
 * toward beside its name and time left (`ChallengeMedalBand`), then the
 * next useful action, then the challenge's own leaders.
 *
 * Accountability first: the card leads with the action, not a ranking
 * (`weeklyAccountability`), and the count in it is the person's own.
 *
 * The leaders are the weekly challenge's own board, the people who joined
 * it, as every other challenge shows its own (Trim1 call 3(a)). Until 11
 * November 2026 this card ranked the friends board instead: the people
 * you follow who had chosen Show my week. That board went, and the league
 * is the one weekly ranking. Like `ChallengeCard`, the card shows its
 * leaders only to someone who has joined and has a session in, so the
 * figures have something to be read against.
 *
 * `leads`: its action is the page's one filled button, unless the page
 * has a Start a circle card, which takes that place (no Circle yet).
 *
 * With no challenge live it is one short line instead.
 */
export default function WeeklyChallengeCard({
  weekly,
  joined,
  progress,
  leaderboard = [],
  hasChallenges,
  leads = true,
  onJoin,
  onLeave,
}: {
  weekly: Challenge | undefined;
  joined: boolean;
  /** The person's place in the weekly challenge, once joined: its medal
   *  is then the next tier above the one they hold. */
  progress?: ChallengeParticipant | null;
  /** The weekly challenge's own board, ranked, as `useChallenges` reads
   *  it for every challenge: nobody either side of a block with the
   *  viewer is on it. */
  leaderboard?: ChallengeParticipant[];
  /** Whether any challenge is live: with none the card gives way to the
   *  short "No active challenges" line. */
  hasChallenges: boolean;
  leads?: boolean;
  onJoin: (challenge: Challenge) => Promise<void>;
  onLeave: (challenge: Challenge) => Promise<void>;
}) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  /* The accountability line reads your own count from your own sessions,
     so it holds whether or not you have joined. Stamped with the account
     it was read for, so another account reads as loading from its first
     render. */
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

  if (!hasChallenges) {
    return (
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border/40">
        <div
          className="size-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${THEME.brand}14` }}
        >
          <Trophy size={16} style={{ color: THEME.brand }} />
        </div>
        <p className="text-sm font-semibold text-foreground">
          No active challenges
        </p>
      </div>
    );
  }

  /* The challenge's leaders, for someone in it with a session counted. */
  const leaders =
    weekly && joined && (progress?.currentValue ?? 0) > 0
      ? leaderboard.filter((p) => p.currentValue > 0).slice(0, TOP_SHOWN)
      : [];
  /* In the week's last day a person who has not joined is offered no
     Join: nobody can meet the week's goal in its final hours. The card
     says when the next one starts instead, in place of the countdown. */
  const closing = !!weekly && !joined && inFinalDay(weekly.endDate);
  const timeLeft = weekly && !closing ? getTimeRemaining(weekly.endDate) : "";
  const target = weekly?.tiers.bronze ?? 2;
  const { title, sub, ctaLabel, ctaTo, goalMet } = getWeeklyAccountability({
    myWeeklyCount,
    target,
    ...(weekly && !joined ? { unjoined: { name: weekly.name } } : {}),
  });
  /* The header is the medal the week is working toward (Soc16), with
     the challenge's name beside it, so the line under it does not say
     the name again. */
  const medal = !!weekly && challengeHasMedal(weekly);
  const showTitle = !(medal && weekly && title === weekly.name);
  /* Leading, the action is the page's one filled button, and neutral
     (Soc16, §0 rule 12): white on dark, the colour left to the medal and
     the progress. */
  const actionStyle = leads
    ? { variant: "neutral" as const, className: undefined }
    : {
        variant: "secondary" as const,
        className: SECONDARY_ON_CARD_EDGE,
      };

  return (
    <div className="rounded-2xl bg-card border border-border/50 dark:border-0 card-shadow overflow-hidden">
      {medal && weekly && (
        <ChallengeMedalBand
          challenge={weekly}
          progress={progress}
          timeLeft={timeLeft}
        />
      )}
      <div className="p-4">
        {/* The icon and its gap in px, so larger text keeps the room for
            the words; the countdown drops under them once they would be
            narrower than 8em beside it, rather than running over the
            title at 320 px and double text. */}
        <div className="flex items-start gap-[12px] mb-3">
          {!medal && (
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
          )}
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
            {timeLeft && !medal && (
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

        {/* Secondary: the challenge's own leaders. */}
        {leaders.length > 0 && (
          <>
            <SectionHeading as="h3" size="compact" className="mt-4 mb-2">
              Leading this week
            </SectionHeading>
            <ol className="space-y-1" aria-label="Leading this week">
              {leaders.map((entry, i) => (
                <li key={entry.uid || i}>
                  <LeaderboardRow
                    rank={entry.rank ?? i + 1}
                    uid={entry.uid ?? ""}
                    name={entry.displayName || "Athlete"}
                    photoURL={entry.photoURL}
                    value={entry.currentValue}
                    unit={entry.currentValue === 1 ? "session" : "sessions"}
                    isSelf={!!entry.uid && entry.uid === user?.uid}
                    /* Prefer Firestore profile.displayName because
                       Firebase Auth's user.displayName is often empty
                       for email/password signups. */
                    selfInitial={
                      profile?.displayName?.charAt(0) ||
                      user?.displayName?.charAt(0)
                    }
                  />
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
