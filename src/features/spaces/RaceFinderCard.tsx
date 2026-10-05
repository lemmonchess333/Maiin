import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { spaceEditorialImage } from "@/lib/editorialImages";
import { haptic } from "@/lib/haptic";
import { formatRaceEventDate } from "./raceDates";
import { raceDistanceLabel } from "./raceBrowse";
import type { SpaceDef } from "./spaceDefs";
import type { useSavedRaces } from "./useSavedRaces";
import SaveRaceButton from "./SaveRaceButton";

export default function RaceFinderCard({
  race,
  today,
  saved,
}: {
  race: SpaceDef;
  today: string;
  saved: ReturnType<typeof useSavedRaces>;
}) {
  const event = race.event!;
  const photo = spaceEditorialImage(race.id);
  const past = event.dateKey < today;
  return (
    <li className="relative rounded-2xl bg-card card-shadow overflow-hidden">
      <Link
        to={`/space/${race.id}`}
        aria-label={`View ${race.name}`}
        onClick={() => haptic("light")}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-running-strong"
      >
        <div className="h-40 bg-running/10 flex items-center justify-center">
          {photo ? (
            <img
              src={photo}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <Flag className="size-10 text-running-strong" aria-hidden />
          )}
        </div>
        <div className="p-4 space-y-1">
          <p className="text-sm font-semibold text-running-strong">
            <InlineNumerals>{raceDistanceLabel(event)}</InlineNumerals>
          </p>
          <h2 className="text-h3 font-bold leading-tight text-foreground">
            <InlineNumerals>{race.name}</InlineNumerals>
          </h2>
          <p className="text-sm text-muted-foreground">
            {event.city} {event.countryFlag}
          </p>
          <p
            className={`text-sm text-foreground ${past ? "" : "font-mono tabular-nums"}`}
          >
            {past ? "Next date TBA" : formatRaceEventDate(event)}
          </p>
        </div>
      </Link>
      {/* A sibling of the link, so saving never opens the race or nests buttons. */}
      <div className="absolute top-3 right-3 rounded-xl bg-card">
        <SaveRaceButton id={race.id} name={race.name} saved={saved} />
      </div>
    </li>
  );
}
