import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { LEAGUE_LIGHT } from "@/features/league/leaguePalettes";
import { cardClasses } from "@/components/ui/cardClasses";
import { Button } from "@/components/ui/Button";
import { useEnoughPeople } from "@/hooks/useEnoughPeople";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { roomShown } from "@/lib/enoughPeople";
import { cn } from "@/lib/utils";
import {
  endsLine,
  leagueCardState,
  lockedLine,
  pointsLine,
  showsJoinedCount,
  sessionsLine,
} from "./league";
import { ordinal, tierName } from "./leagueRules";
import LeagueJoin from "./LeagueJoin";
import TierBadge from "./TierBadge";
import { useLeague } from "./useLeague";
import { useLeagueJoin } from "./useLeagueJoin";

/**
 * The weekly league on Social (Soc15 call 3), in Together's "This week",
 * under the weekly challenge: both are this week's, and both end on
 * Sunday. Four states:
 *
 *   not joined   what a league is, what joining shows and to whom, Join
 *   locked       joined, and the league is waiting for enough people:
 *                "Leagues open when 10 people have joined. 3 so far."
 *   waiting      joined, and the next groups are made on Monday
 *   in a group   the tier, the place ("4th of 18"), the points, the
 *                sessions against the plan ("3 of 4 sessions") and
 *                "Ends Sunday"; the card opens the league page
 *
 * Someone who has not joined sees no card at all until Tropos has enough
 * people to fill a league (App1 Q6, `roomShown`): before then it draws
 * nothing, not a card saying leagues are coming. Someone who joined keeps
 * theirs whatever the count.
 *
 * Social may be loud (DESIGN_GUIDE §14l): the group's card wears its
 * tier's metal.
 */
export default function LeagueCard({ uid }: { uid: string }) {
  const { profile } = useAuth();
  const optedIn = profile?.leagueOptIn === true;
  const enough = useEnoughPeople();
  const shown = roomShown(optedIn, enough);
  /* A league that is not offered is not read either. */
  const league = useLeague(shown ? uid : null);
  const { isRestricted } = useRestrictedStatus(uid);
  const sharing = useLeagueJoin(league.reload);

  if (!shown) return null;

  if (league.loading) {
    return (
      <div
        className="h-36 rounded-2xl bg-muted motion-safe:animate-pulse"
        aria-hidden="true"
        data-testid="league-card-loading"
      />
    );
  }

  if (league.failed) {
    return (
      <div
        className={cardClasses({
          className: "flex flex-wrap items-center justify-between gap-3",
        })}
      >
        <p className="text-sm text-muted-foreground">
          Couldn&rsquo;t load your league.
        </p>
        <Button variant="secondary" onClick={league.reload}>
          Try again
        </Button>
      </div>
    );
  }

  const state = leagueCardState({
    uid,
    optedIn,
    status: league.status,
    member: league.member,
    standings: league.standings,
  });

  if (state.kind === "notJoined") {
    return (
      <section aria-label="Weekly leagues" className={cardClasses()}>
        <LeagueJoin
          joined={state.joined}
          needed={state.needed}
          open={state.open}
          restricted={isRestricted}
          busy={sharing.busy === "join"}
          onJoin={() => void sharing.join()}
        />
      </section>
    );
  }

  if (state.kind === "locked" || state.kind === "waiting") {
    const locked = state.kind === "locked";
    return (
      <Link
        to="/league"
        className={cardClasses({
          className:
            "relative flex flex-wrap items-start gap-[12px] transition-transform active:scale-[0.99]",
        })}
      >
        <TierBadge
          tier={locked ? "bronze" : state.tier}
          size={40}
          className="shrink-0"
        />
        {/* The words keep 12em, else they drop under the badge: at large
            text on a narrow phone a column beside it held a word a line.
            The chevron sits in the corner, clear of them. */}
        <div className="min-w-[min(12em,100%)] flex-1 space-y-1 pr-[28px]">
          <h3 className="text-base font-bold leading-snug text-foreground">
            {locked ? "Weekly league" : `${tierName(state.tier)} league`}
          </h3>
          {locked ? (
            <>
              <p className="text-sm leading-snug text-foreground text-pretty">
                {lockedLine(state.joined, state.needed)}
              </p>
              {showsJoinedCount(state.joined) && (
                <JoinedBar joined={state.joined} needed={state.needed} />
              )}
            </>
          ) : (
            <p className="text-sm leading-snug text-foreground text-pretty">
              You&rsquo;re in. Your group starts on Monday.
            </p>
          )}
        </div>
        <ChevronRight
          className="absolute right-[12px] top-[22px] size-5 text-muted-foreground"
          aria-hidden="true"
        />
      </Link>
    );
  }

  const { me, ranked, tier, weekKey } = state;
  const metal = LEAGUE_LIGHT[tier];
  return (
    <Link
      to="/league"
      aria-label={`${tierName(tier)} league: ${ordinal(me.rank)} of ${ranked.length}, ${pointsLine(me.points)}, ${sessionsLine(me.done, me.planned)}. ${endsLine(weekKey)}. See the league`}
      className={cn(
        cardClasses({ padded: false }),
        "relative block overflow-hidden transition-transform active:scale-[0.99]"
      )}
      data-testid="league-card"
    >
      {/* The tier's light behind its badge: Social's loud register. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 14% 0%, ${metal}40, transparent 58%)`,
        }}
      />
      <div className="relative space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-[12px] gap-y-2">
          <TierBadge tier={tier} size={48} className="shrink-0" />
          <div className="min-w-[min(9em,100%)] flex-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {tierName(tier)} league
            </p>
            <p className="text-h3 font-bold leading-tight text-foreground">
              <span className="font-figure tabular-nums">
                {ordinal(me.rank)}
              </span>{" "}
              of{" "}
              <span className="font-figure tabular-nums">{ranked.length}</span>
            </p>
          </div>
          <p className="shrink-0 whitespace-nowrap leading-tight">
            <span className="text-h2 font-extrabold font-figure tabular-nums text-foreground">
              {me.points}
            </span>{" "}
            <span className="text-xs text-muted-foreground">
              {me.points === 1 ? "point" : "points"}
            </span>
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full track-cut"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, me.points)}%`,
              background: metal,
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-mono tabular-nums text-foreground">
            {sessionsLine(me.done, me.planned)}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            {endsLine(weekKey)}
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** How far the league is from opening: joined out of needed. */
function JoinedBar({ joined, needed }: { joined: number; needed: number }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full track-cut"
      role="progressbar"
      aria-label="People who have joined"
      aria-valuemin={0}
      aria-valuemax={needed}
      aria-valuenow={Math.min(joined, needed)}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, (100 * joined) / needed)}%`,
          background: LEAGUE_LIGHT.bronze,
        }}
      />
    </div>
  );
}
