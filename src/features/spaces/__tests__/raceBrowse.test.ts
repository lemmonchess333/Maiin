import { describe, expect, it } from "vitest";
import {
  ALL_RACE_FILTERS,
  filterRaceDefs,
  UK_RACE_FILTERS,
  raceDistanceLabel,
} from "../raceBrowse";
import { upcomingResolvedRaceDefs } from "../raceEventOverrides";

describe("race browsing", () => {
  const races = upcomingResolvedRaceDefs({}, "2026-09-14");
  it("keeps UK first while making every international marathon discoverable", () => {
    expect(races).toHaveLength(65);
    expect(filterRaceDefs(races, UK_RACE_FILTERS)).toHaveLength(41);
    const allFull = filterRaceDefs(races, {
      ...ALL_RACE_FILTERS,
      distance: "marathon",
    });
    expect(allFull).toHaveLength(35);
    expect(
      filterRaceDefs(races, { country: "GB", distance: "marathon" })
    ).toHaveLength(12);
    expect(
      filterRaceDefs(races, { country: "US", distance: "marathon" }).map(
        (r) => r.id
      )
    ).toEqual([
      // In date order: Chicago's and New York's bundled dates are their
      // 2027 editions, after Boston's April.
      "honolulu-marathon",
      "houston-marathon",
      "los-angeles-marathon",
      "boston-marathon",
      "chicago-marathon",
      "new-york-city-marathon",
    ]);
    expect(allFull.map((r) => r.event!.dateKey)).toEqual(
      allFull.map((r) => r.event!.dateKey).sort()
    );
  });
  it("finds ultras independently of marathons and displays the advertised distances", () => {
    const ultras = filterRaceDefs(races, {
      ...ALL_RACE_FILTERS,
      distance: "ultra",
    });
    expect(ultras.map((r) => r.id)).toEqual([
      "race-to-the-king-100k",
      "race-to-the-stones-100k",
      "chiltern-50",
    ]);
    expect(ultras.map((r) => raceDistanceLabel(r.event!))).toEqual([
      "100 km ultra",
      "100 km ultra",
      "50 km ultra",
    ]);
  });
  it("an unsupported distance/country combination is empty, with all-country recovery", () => {
    expect(filterRaceDefs(races, { country: "DE", distance: "half" })).toEqual(
      []
    );
    expect(filterRaceDefs(races, ALL_RACE_FILTERS)).toEqual(races);
  });
  it("resolves dates before filtering and keeps the race calendar day intact", () => {
    const resolved = upcomingResolvedRaceDefs(
      { "berlin-marathon": { dateKey: "2027-09-26" } },
      "2027-09-26"
    );
    const berlin = filterRaceDefs(resolved, {
      country: "DE",
      distance: "marathon",
    });
    // Berlin's resolved date, not its bundled one, decides whether it is
    // upcoming, and its calendar day comes through unshifted. Other German
    // marathons with a date ahead (Frankfurt's) may sit beside it.
    expect(berlin.find((r) => r.id === "berlin-marathon")?.event?.dateKey).toBe(
      "2027-09-26"
    );
    expect(
      berlin.every(
        (r) => r.event?.countryCode === "DE" && r.event.distance === "marathon"
      )
    ).toBe(true);
    expect(
      upcomingResolvedRaceDefs(
        { "berlin-marathon": { dateKey: "2027-09-26" } },
        "2027-09-27"
      ).map((r) => r.id)
    ).not.toContain("berlin-marathon");
  });
});
