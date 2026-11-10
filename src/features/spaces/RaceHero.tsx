import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { localDateString } from "@/lib/dateHelpers";
import { spaceEditorialImage } from "@/lib/editorialImages";
import InlineNumerals from "@/components/ui/InlineNumerals";
import SectionLabel from "@/components/ui/SectionLabel";
import { formatRaceEventDate } from "./raceDates";
import { useRaceEventOverrides } from "./raceEventOverrides";
import {
  planGroupHeroCardLine,
  planGroupRace,
  weeksToGoLine,
} from "./planGroup";
import { useRaceCohort } from "./useRaceCohort";

/**
 * Together's hero while the person is training for a race (Soc16): the
 * race's own photo the width of the page, its name as the page's largest
 * words, the weeks to go, the race's date and place, and, from a group of
 * three, how many others on Tropos are training for it. The whole card
 * opens the race's space.
 *
 * Nothing without a goal bound to a race space, or once that race has
 * passed (`planGroupRace`); the weekly challenge's card leads instead.
 * The weeks are counted from the viewer's own today to their race day.
 *
 * Social may be loud (DESIGN_GUIDE §14l): a full-bleed photo under the
 * one dark shade every photo card uses, the running coral's wash on it.
 */
/** The scrim PhotoCaption draws: full behind the words, fading out over
 *  the 2.5rem above them. */
const SCRIM = `linear-gradient(to top, ${THEME.scrim} 0%, ${THEME.scrim} calc(100% - 2.5rem), transparent 100%)`;

export default function RaceHero() {
  const { profile } = useAuth();
  const overrides = useRaceEventOverrides();
  const race = planGroupRace(profile?.raceGoal, overrides, localDateString());
  const cohort = useRaceCohort(race?.def.id ?? null);
  if (!race) return null;
  const photo = spaceEditorialImage(race.def.id);
  const group = cohort.loading ? null : planGroupHeroCardLine(cohort.count);
  return (
    <Link
      to={`/space/${race.def.id}`}
      className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-2xl card-shadow transition-transform active:scale-[0.99]"
      style={
        photo
          ? undefined
          : {
              background: `linear-gradient(150deg, ${THEME.running}33 0%, ${THEME.running}10 55%, ${THEME.running}1A 100%)`,
            }
      }
      data-testid="race-hero"
    >
      {photo ? (
        <>
          <img
            src={photo}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover"
            decoding="async"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(150deg, ${THEME.running}40 0%, ${THEME.running}14 55%, transparent 100%)`,
            }}
          />
        </>
      ) : (
        <Flag
          size={160}
          className="absolute -right-6 -bottom-8"
          style={{
            color: THEME.running,
            opacity: 0.16,
            transform: "rotate(-10deg)",
          }}
          aria-hidden
        />
      )}
      {/* On a photo the words sit on the one scrim every photo card uses,
          behind the words themselves: it grows with them, so at large
          text the kicker over a pale sky holds 4.5:1 as the name does. */}
      <div
        className={`relative space-y-1 p-[16px] ${photo ? "pt-10 text-white" : "text-foreground"}`}
        style={photo ? { background: SCRIM } : undefined}
      >
        <SectionLabel className={photo ? "text-white/85" : undefined}>
          Your race ·{" "}
          <InlineNumerals>{weeksToGoLine(race.weeksToGo)}</InlineNumerals>
        </SectionLabel>
        <p className="text-hero font-extrabold leading-[1.05] tracking-tight break-words text-balance">
          {race.def.name}
        </p>
        <p
          className={`text-sm font-medium ${photo ? "text-white/85" : "text-muted-foreground"}`}
        >
          <span className="font-mono tabular-nums">
            {formatRaceEventDate(race.event)}
          </span>
          {" · "}
          {race.event.city} {race.event.countryFlag}
        </p>
        {group && (
          <p
            className={`pt-1 text-sm font-semibold ${photo ? "text-white" : "text-foreground"}`}
          >
            <InlineNumerals>{group}</InlineNumerals>
          </p>
        )}
      </div>
    </Link>
  );
}
