/**
 * RACE-EVENTS-REMOTE — the validation + merge layer. The doc can only
 * ever narrow to safe values: invalid fields lose to the bundled
 * config, unknown ids are dropped, and resolved dates drive the
 * upcoming filter/sort (a server-fresh date rescues a race a stale
 * binary thinks has passed).
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeRaceEventOverrides,
  resolveRaceEvent,
  upcomingResolvedRaceDefs,
} from "../raceEventOverrides";
import { raceSpaceDefs, spaceDef } from "../spaceDefs";

const BIG_HALF = spaceDef("the-big-half")!;

describe("sanitizeRaceEventOverrides", () => {
  it("keeps valid fields for known race ids", () => {
    const out = sanitizeRaceEventOverrides({
      "the-big-half": {
        dateKey: "2027-09-05",
        websiteUrl: "https://www.londonmarathonevents.co.uk/big-half",
        elevation: "flat",
        city: "London",
        countryFlag: "🇬🇧",
      },
    });
    expect(out["the-big-half"]).toEqual({
      dateKey: "2027-09-05",
      websiteUrl: "https://www.londonmarathonevents.co.uk/big-half",
      elevation: "flat",
      city: "London",
      countryFlag: "🇬🇧",
    });
  });

  it("drops invalid fields but keeps the valid siblings", () => {
    const out = sanitizeRaceEventOverrides({
      "the-big-half": {
        dateKey: "next september", // not YYYY-MM-DD
        websiteUrl: "http://insecure.example", // not https
        elevation: "vertical", // not in enum
        city: "London",
      },
    });
    expect(out["the-big-half"]).toEqual({ city: "London" });
  });

  it("drops unknown ids, interest-space ids, and junk shapes", () => {
    const out = sanitizeRaceEventOverrides({
      "not-a-space": { dateKey: "2027-01-01" },
      runners: { dateKey: "2027-01-01" }, // interest kind
      "great-north-run": "not-an-object",
      "cardiff-half": { dateKey: 20270101 }, // wrong type → empty → dropped
    });
    expect(out).toEqual({});
  });

  it("non-object payloads sanitize to empty", () => {
    expect(sanitizeRaceEventOverrides(null)).toEqual({});
    expect(sanitizeRaceEventOverrides("junk")).toEqual({});
    expect(sanitizeRaceEventOverrides(undefined)).toEqual({});
  });
});

describe("resolveRaceEvent", () => {
  it("override wins per-field; bundled fills the rest", () => {
    const resolved = resolveRaceEvent(BIG_HALF, {
      "the-big-half": { dateKey: "2027-09-05" },
    })!;
    expect(resolved.dateKey).toBe("2027-09-05");
    // Everything else stays bundled.
    expect(resolved.city).toBe(BIG_HALF.event!.city);
    expect(resolved.websiteUrl).toBe(BIG_HALF.event!.websiteUrl);
  });

  it("no override → the bundled event object, unchanged", () => {
    expect(resolveRaceEvent(BIG_HALF, {})).toBe(BIG_HALF.event);
  });
});

describe("upcomingResolvedRaceDefs", () => {
  it("a server-fresh date rescues a bundled-past race (the stale-binary case)", () => {
    const first = raceSpaceDefs()[0]; // soonest bundled race
    const dayAfterBundled = "2099-01-01"; // everything bundled has passed
    // Without overrides: nothing upcoming.
    expect(upcomingResolvedRaceDefs({}, dayAfterBundled)).toHaveLength(0);
    // With a server date beyond todayKey: that race is back.
    const rescued = upcomingResolvedRaceDefs(
      { [first.id]: { dateKey: "2099-06-01" } },
      dayAfterBundled
    );
    expect(rescued.map((d) => d.id)).toEqual([first.id]);
    expect(rescued[0].event!.dateKey).toBe("2099-06-01");
  });

  it("sorts by RESOLVED dates, not bundled ones", () => {
    const [a, b] = raceSpaceDefs();
    // Push the bundled-soonest race far out — it must sort last.
    const resolved = upcomingResolvedRaceDefs(
      { [a.id]: { dateKey: "2098-01-01" } },
      "2020-01-01"
    );
    expect(resolved[0].id).toBe(b.id);
    expect(resolved[resolved.length - 1].id).toBe(a.id);
  });

  it("never mutates the bundled config", () => {
    const before = BIG_HALF.event!.dateKey;
    upcomingResolvedRaceDefs(
      { "the-big-half": { dateKey: "2099-09-09" } },
      "2020-01-01"
    );
    expect(spaceDef("the-big-half")!.event!.dateKey).toBe(before);
  });
});
