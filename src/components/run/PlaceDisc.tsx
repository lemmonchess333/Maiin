import { RANK_COLORS } from "@/lib/theme";
import { placeLabel, type Place } from "@/lib/runPlacings";

/**
 * A place in your top three (Run29): the number in the text colour inside
 * a ring of its medal's metal, as a leaderboard's rank is drawn
 * (`LeaderboardRow`), so the number reads without the colour and the
 * metal is never text (gold and silver are under 2:1 on a light card).
 * The screen reader hears "2nd fastest", unless the words beside it say
 * the place already (`decorative`).
 */
export default function PlaceDisc({
  place,
  decorative = false,
}: {
  place: Place;
  decorative?: boolean;
}) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold font-mono tabular-nums text-foreground"
      style={{ boxShadow: `inset 0 0 0 2px ${RANK_COLORS[place - 1]}` }}
    >
      <span aria-hidden="true">{place}</span>
      {!decorative && <span className="sr-only">{placeLabel(place)}</span>}
    </span>
  );
}
