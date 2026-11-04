import { useState } from "react";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import MedalArt from "./MedalArt";
import MedalSheet from "./MedalSheet";
import {
  MEDAL_TIER_LABEL,
  medalEdition,
  medalFace,
  type Medal,
} from "./medals";

/** Medals the case shows before "See all": two rows of three. */
export const TROPHY_CASE_SHOWN = 6;

/**
 * A person's trophy case on their profile (Soc15): a medal for each
 * challenge edition they reached a tier in, newest first, read from the
 * public `medalSummary` the server keeps (functions/lib/medals.js). The
 * same case on your own profile and on anyone else's, since a profile
 * shows how it looks to other people.
 *
 * Nothing to show: no section on someone else's profile; on your own, one
 * quiet line saying how a medal comes.
 *
 * The grid's columns are measured in rem, so at a large text size it
 * steps from three across to two to one, and a medal's name wraps under
 * it rather than running into the next.
 */
export default function TrophyCase({
  medals,
  isOwn,
}: {
  medals: readonly Medal[];
  isOwn: boolean;
}) {
  const liftUnit = useLiftUnit();
  const distanceUnit = useDistanceUnit();
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Medal | null>(null);

  if (medals.length === 0) {
    if (!isOwn) return null;
    return (
      <section className="space-y-2" aria-labelledby="profile-medals">
        <SectionHeading id="profile-medals">Medals</SectionHeading>
        <p className="text-small text-muted-foreground">
          Finish a challenge to earn its medal.
        </p>
      </section>
    );
  }

  const shown = showAll ? medals : medals.slice(0, TROPHY_CASE_SHOWN);
  const more = medals.length - TROPHY_CASE_SHOWN;

  return (
    <section className="space-y-2" aria-labelledby="profile-medals">
      <SectionHeading
        id="profile-medals"
        action={
          more > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 min-h-[44px] text-primary-strong"
              aria-expanded={showAll}
              onClick={() => setShowAll((all) => !all)}
            >
              {showAll ? "Show fewer" : `See all ${medals.length}`}
            </Button>
          ) : undefined
        }
      >
        Medals
      </SectionHeading>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2"
        aria-label="Medals"
      >
        {shown.map((medal) => (
          <li key={medal.challengeId} className="min-w-0">
            <Button
              variant="ghost"
              className="w-full h-auto flex-col items-center justify-start gap-1 px-1 py-2 font-normal"
              onClick={() => setOpen(medal)}
            >
              <MedalArt
                {...medalFace(medal, liftUnit, distanceUnit)}
                size={64}
              />
              <span
                dir="auto"
                className="w-full text-xs font-semibold text-foreground text-center leading-tight break-words line-clamp-3"
              >
                {medal.name}
              </span>
              <span className="w-full text-xs text-muted-foreground text-center leading-tight break-words">
                {MEDAL_TIER_LABEL[medal.tier]} · {medalEdition(medal)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <MedalSheet medal={open} onClose={() => setOpen(null)} />
    </section>
  );
}
