import { Link } from "react-router-dom";
import { ChevronRight, Flag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { localDateString } from "@/lib/dateHelpers";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { cardClasses } from "@/components/ui/cardClasses";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { useRaceEventOverrides } from "./raceEventOverrides";
import { planGroupCardLine, planGroupRace, weeksToGoLine } from "./planGroup";
import { useRaceCohort } from "./useRaceCohort";

/**
 * Your plan group on Social (Soc15), in Together's This week: the people
 * on Tropos training for the race your goal is bound to. "You and 11
 * others are training for Manchester Marathon · 9 weeks to go", or, with
 * fewer than two others, "You're training for Manchester Marathon · 9
 * weeks to go". The whole card opens the race's space.
 *
 * Nothing at all without a goal bound to a race space, or once that race
 * has passed. The weeks are counted from the viewer's own today to their
 * race day (`planGroup.ts`).
 *
 * Social may be loud (DESIGN_GUIDE §14l): the race's own photo, and the
 * running coral's light behind it, as the league card wears its tier's.
 */
export default function PlanGroupCard() {
  const { profile } = useAuth();
  const overrides = useRaceEventOverrides();
  const race = planGroupRace(profile?.raceGoal, overrides, localDateString());
  const cohort = useRaceCohort(race?.def.id ?? null);

  if (!race) return null;
  if (cohort.loading) {
    return (
      <div
        className="h-[84px] rounded-2xl bg-muted motion-safe:animate-pulse"
        aria-hidden="true"
        data-testid="plan-group-loading"
      />
    );
  }

  const photo = spaceEditorialImage(race.def.id);
  const line = planGroupCardLine(cohort.count, race.def.name);
  const weeks = weeksToGoLine(race.weeksToGo);

  return (
    <Link
      to={`/space/${race.def.id}`}
      className={cn(
        cardClasses({ padded: false }),
        "relative block overflow-hidden transition-transform active:scale-[0.99]"
      )}
      data-testid="plan-group-card"
    >
      {/* The race's coral light: Social's loud register. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 10% 0%, ${THEME.running}33, transparent 60%)`,
        }}
      />
      {/* The words keep 12em, else they drop under the photo: at large text
          on a narrow phone a column beside it held a word a line. The
          chevron sits in the corner, clear of them. */}
      <div className="relative flex flex-wrap items-center gap-[12px] p-[12px] pr-[40px]">
        <div
          className="flex size-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={photo ? undefined : { background: `${THEME.running}1F` }}
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <Flag className="size-6 text-running-strong" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-[min(12em,100%)] flex-1">
          <p className="text-base font-bold leading-snug text-foreground text-pretty">
            <InlineNumerals>{line}</InlineNumerals>
            <span className="sr-only"> · </span>
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-running-strong">
            <InlineNumerals>{weeks}</InlineNumerals>
          </p>
        </div>
      </div>
      <ChevronRight
        className="absolute right-[12px] top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
