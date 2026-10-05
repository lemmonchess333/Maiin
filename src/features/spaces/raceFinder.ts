import { RACE_COUNTRIES, type SpaceDef } from "./spaceDefs";
import {
  ALL_RACE_FILTERS,
  filterRaceDefs,
  RACE_DISTANCE_LABELS,
  type RaceBrowseFilters,
} from "./raceBrowse";
import { raceEventDates } from "./raceDates";

export interface RaceFinderFilters extends RaceBrowseFilters {
  query: string;
  month: string;
  sort: "date" | "name";
  view: "all" | "saved";
}

export function readRaceFinderFilters(
  params: URLSearchParams
): RaceFinderFilters {
  const country = params.get("country") ?? "all";
  const distance = params.get("distance") ?? "all";
  const month = params.get("month") ?? "all";
  return {
    ...ALL_RACE_FILTERS,
    country: Object.hasOwn(RACE_COUNTRIES, country)
      ? (country as RaceBrowseFilters["country"])
      : "all",
    distance: Object.hasOwn(RACE_DISTANCE_LABELS, distance)
      ? (distance as RaceBrowseFilters["distance"])
      : "all",
    query: (params.get("q") ?? "").slice(0, 100),
    month:
      month === "tba" || /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)
        ? month
        : "all",
    sort: params.get("sort") === "name" ? "name" : "date",
    view: params.get("view") === "saved" ? "saved" : "all",
  };
}

/** Calendar keys stay local; a multi-day event can match either future day. */
export function upcomingFinderDates(race: SpaceDef, today: string): string[] {
  return race.event
    ? raceEventDates(race.event).filter((day) => day >= today)
    : [];
}

export function raceFinderMonths(races: SpaceDef[], today: string): string[] {
  return [
    ...new Set(
      races.flatMap((race) =>
        upcomingFinderDates(race, today).map((day) => day.slice(0, 7))
      )
    ),
  ].sort();
}

function searchText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findRaces(
  races: SpaceDef[],
  filters: RaceFinderFilters,
  savedIds: ReadonlySet<string>,
  today: string
): SpaceDef[] {
  const words = searchText(filters.query).split(" ").filter(Boolean);
  return filterRaceDefs(races, filters)
    .filter((race) => {
      if (filters.view === "saved" && !savedIds.has(race.id)) return false;
      const dates = upcomingFinderDates(race, today);
      if (filters.month === "tba" && dates.length) return false;
      if (
        filters.month !== "all" &&
        filters.month !== "tba" &&
        !dates.some((day) => day.startsWith(filters.month))
      )
        return false;
      const haystack = searchText(
        `${race.name} ${race.event!.city} ${RACE_COUNTRIES[race.event!.countryCode]}`
      );
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => {
      if (filters.sort === "date") {
        // Awaiting editions remain visible, after confirmed dates.
        const difference = (
          upcomingFinderDates(a, today)[0] ?? "9999"
        ).localeCompare(upcomingFinderDates(b, today)[0] ?? "9999");
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
}
