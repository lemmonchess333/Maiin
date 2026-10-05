import { describe, expect, it } from "vitest";
import {
  findRaces,
  raceFinderMonths,
  readRaceFinderFilters,
} from "../raceFinder";
import { applyRaceEventOverrides } from "../raceEventOverrides";
import { spaceDef, type SpaceDef } from "../spaceDefs";

const filters = readRaceFinderFilters(new URLSearchParams());
const today = "2027-01-01";
const empty = new Set<string>();
function race(
  id: string,
  name: string,
  date: string,
  city = "Berlin"
): SpaceDef {
  const base = spaceDef("berlin-marathon")!;
  return { ...base, id, name, event: { ...base.event!, dateKey: date, city } };
}
const races = [
  race("past", "Awaiting race", "2026-12-31"),
  race("later", "Alpha race", "2027-10-01"),
  race("soon", "Zürich Marathon", "2027-02-28", "Zürich"),
];

describe("race finder", () => {
  it("searches words and cities without case, accents or punctuation getting in the way", () => {
    expect(
      findRaces(
        races,
        { ...filters, query: "  ZURICH marathon " },
        empty,
        today
      ).map((r) => r.id)
    ).toEqual(["soon"]);
    expect(
      findRaces(races, { ...filters, query: "alpha berlin" }, empty, today).map(
        (r) => r.id
      )
    ).toEqual(["later"]);
    expect(
      findRaces(races, { ...filters, query: "missing" }, empty, today)
    ).toEqual([]);
  });
  it("sorts soonest first, retains awaiting editions last, and supports name sorting without mutation", () => {
    expect(findRaces(races, filters, empty, today).map((r) => r.id)).toEqual([
      "soon",
      "later",
      "past",
    ]);
    expect(
      findRaces(races, { ...filters, sort: "name" }, empty, today).map(
        (r) => r.id
      )
    ).toEqual(["later", "past", "soon"]);
    expect(races[0].id).toBe("past");
  });
  it("combines country, distance, month and saved filters", () => {
    const saved = new Set(["soon", "later"]);
    expect(
      findRaces(
        races,
        {
          ...filters,
          view: "saved",
          country: "DE",
          distance: "marathon",
          month: "2027-02",
        },
        saved,
        today
      ).map((r) => r.id)
    ).toEqual(["soon"]);
    expect(
      findRaces(races, { ...filters, country: "GB" }, saved, today)
    ).toEqual([]);
    expect(
      findRaces(races, { ...filters, month: "tba" }, empty, today).map(
        (r) => r.id
      )
    ).toEqual(["past"]);
    expect(
      findRaces(races, { ...filters, month: "2026-12" }, empty, today)
    ).toEqual([]);
  });
  it("offers years explicitly and handles multi-day choices across months, today inclusive", () => {
    const multi = race("two", "Two days", "2027-03-01");
    multi.event!.dateKeys = ["2027-02-28", "2027-03-01"];
    expect(raceFinderMonths([multi, ...races], today)).toEqual([
      "2027-02",
      "2027-03",
      "2027-10",
    ]);
    expect(
      findRaces([multi], { ...filters, month: "2027-02" }, empty, "2027-02-28")
    ).toHaveLength(1);
    expect(
      findRaces([multi], { ...filters, month: "2027-02" }, empty, "2027-03-01")
    ).toHaveLength(0);
    expect(
      findRaces([multi], { ...filters, month: "2027-03" }, empty, "2027-03-01")
    ).toHaveLength(1);
  });
  it("uses refreshed dates while keeping the saved event identity", () => {
    const berlin = spaceDef("berlin-marathon")!;
    const resolved = applyRaceEventOverrides([berlin], {
      [berlin.id]: { dateKey: "2028-09-24" },
    });
    expect(
      findRaces(
        resolved,
        { ...filters, view: "saved", month: "2028-09" },
        new Set([berlin.id]),
        "2028-01-01"
      )
    ).toHaveLength(1);
  });
  it("sanitizes unknown URL filters and bounds search input", () => {
    expect(
      readRaceFinderFilters(
        new URLSearchParams(
          "country=unknown&distance=invalid&month=2027-13&sort=bad&view=bad"
        )
      )
    ).toEqual(filters);
    expect(
      readRaceFinderFilters(
        new URLSearchParams({
          q: "a".repeat(200),
          month: "2027-03",
          view: "saved",
          sort: "name",
          distance: "ultra",
          country: "GB",
        })
      )
    ).toMatchObject({
      query: "a".repeat(100),
      month: "2027-03",
      view: "saved",
      sort: "name",
      distance: "ultra",
      country: "GB",
    });
  });
});
