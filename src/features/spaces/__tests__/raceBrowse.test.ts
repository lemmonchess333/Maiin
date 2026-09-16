import { describe, expect, it } from "vitest";
import {
  ALL_RACE_FILTERS,
  filterRaceDefs,
  UK_RACE_FILTERS,
} from "../raceBrowse";
import { upcomingResolvedRaceDefs } from "../raceEventOverrides";

describe("race browsing", () => {
  const races = upcomingResolvedRaceDefs({}, "2026-09-14");
  it("keeps UK first while making every international marathon discoverable", () => {
    expect(races).toHaveLength(40);
    expect(filterRaceDefs(races, UK_RACE_FILTERS)).toHaveLength(24);
    const allFull = filterRaceDefs(races, {
      ...ALL_RACE_FILTERS,
      distance: "marathon",
    });
    expect(allFull).toHaveLength(34);
    expect(
      filterRaceDefs(races, { country: "GB", distance: "marathon" })
    ).toHaveLength(18);
    expect(
      filterRaceDefs(races, { country: "US", distance: "marathon" }).map(
        (r) => r.id
      )
    ).toEqual([
      "chicago-marathon",
      "new-york-city-marathon",
      "boston-marathon",
    ]);
    expect(allFull.map((r) => r.event!.dateKey)).toEqual(
      allFull.map((r) => r.event!.dateKey).sort()
    );
  });
  it.each([
    ["JP", ["tokyo-marathon"]],
    ["AU", ["sydney-marathon"]],
    ["ZA", ["cape-town-marathon"]],
    ["IT", ["rome-marathon"]],
    ["NL", ["amsterdam-marathon", "rotterdam-marathon"]],
    ["ES", ["valencia-marathon", "seville-marathon", "barcelona-marathon"]],
  ] as const)("makes the new %s races discoverable", (country, ids) => {
    expect(
      filterRaceDefs(races, { country, distance: "marathon" }).map((r) => r.id)
    ).toEqual(ids);
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
