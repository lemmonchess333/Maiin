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
    expect(races).toHaveLength(57);
    expect(filterRaceDefs(races, UK_RACE_FILTERS)).toHaveLength(41);
    const allFull = filterRaceDefs(races, {
      ...ALL_RACE_FILTERS,
      distance: "marathon",
    });
    expect(allFull).toHaveLength(27);
    expect(
      filterRaceDefs(races, { country: "GB", distance: "marathon" })
    ).toHaveLength(12);
    expect(
      filterRaceDefs(races, { country: "US", distance: "marathon" }).map(
        (r) => r.id
      )
    ).toEqual([
      "chicago-marathon",
      "new-york-city-marathon",
      "houston-marathon",
      "boston-marathon",
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
    expect(berlin.map((r) => [r.id, r.event!.dateKey])).toEqual([
      ["berlin-marathon", "2027-09-26"],
    ]);
    expect(
      upcomingResolvedRaceDefs(
        { "berlin-marathon": { dateKey: "2027-09-26" } },
        "2027-09-27"
      )
    ).toEqual([]);
  });
});
