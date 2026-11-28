import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cardClasses } from "@/components/ui/cardClasses";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useRestrictedStatus } from "@/hooks/useRestrictedStatus";
import { cn } from "@/lib/utils";
import { riseLine } from "./league";
import { tierName } from "./leagueRules";
import TierBadge from "./TierBadge";
import { useLeagueRise, type FinishStage } from "./useLeagueRise";

/**
 * The league line on a finish (Run30 call 2, copied from Duolingo, which
 * shows its board after a lesson only when your rank moves): "Up to 4th
 * of 18", only when this session raised your place in this week's group
 * and half the group has scored (`placeRise`). Tapping it opens the
 * league. Nothing otherwise: a session that kept your place, a group
 * mostly on zero, someone who has not joined, a restricted account, a
 * finish saved offline.
 *
 * It lands seconds after the finish has drawn, when the server has
 * recomputed your standing, so it is a small row under the hero and never
 * the hero's line: the finish's one reward sentence stays the hero's
 * (DESIGN_GUIDE rule 30), and the row says a place, not a sentence.
 */
export default function LeagueRiseLine({
  stage,
  className,
}: {
  stage: FinishStage;
  className?: string;
}) {
  const { user, profile } = useAuth();
  const optedIn = profile?.leagueOptIn === true;
  const uid = optedIn ? user?.uid : undefined;
  const restriction = useRestrictedStatus(uid);
  const { isOnline } = useOnlineStatus();
  const rise = useLeagueRise({ uid, enabled: optedIn, stage, isOnline });
  if (!rise || restriction.loading || restriction.isRestricted) return null;
  const line = riseLine(rise.rank, rise.of);
  return (
    <Link
      to="/league"
      aria-label={`${tierName(rise.tier)} league: ${line}. See the league`}
      className={cn(
        cardClasses({ tone: "flat", padded: false }),
        "flex min-h-[56px] items-center gap-3 px-4 py-2 transition-transform active:scale-[0.99]",
        className
      )}
      data-league-rise
    >
      <TierBadge tier={rise.tier} size={32} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-muted-foreground">
          {tierName(rise.tier)} league
        </span>
        <span className="block text-base font-semibold leading-snug text-foreground">
          <InlineNumerals>{line}</InlineNumerals>
        </span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
