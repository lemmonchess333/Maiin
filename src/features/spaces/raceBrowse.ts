import type {
  RaceCountryCode,
  RaceEventDistance,
  SpaceDef,
  SpaceEventInfo,
} from "./spaceDefs";

export const RACE_DISTANCE_LABELS: Record<RaceEventDistance, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half marathon",
  marathon: "Marathon",
  ultra: "Ultra",
};

export function raceDistanceLabel(event: SpaceEventInfo): string {
  return event.distance === "ultra" && event.distanceKm
    ? `${event.distanceKm} km ultra`
    : RACE_DISTANCE_LABELS[event.distance];
}

export interface RaceBrowseFilters {
  country: RaceCountryCode | "all";
  distance: RaceEventDistance | "all";
}

export const UK_RACE_FILTERS: RaceBrowseFilters = {
  country: "GB",
  distance: "all",
};
export const ALL_RACE_FILTERS: RaceBrowseFilters = {
  country: "all",
  distance: "all",
};

/** Dates are resolved and sorted upstream; filtering never changes their order. */
export function filterRaceDefs(
  races: SpaceDef[],
  filters: RaceBrowseFilters
): SpaceDef[] {
  return races.filter(
    ({ kind, event }) =>
      kind === "race" &&
      event &&
      (filters.country === "all" || event.countryCode === filters.country) &&
      (filters.distance === "all" || event.distance === filters.distance)
  );
}
