import { describe, expect, it } from "vitest";
import { raceSpaceDefs, type SpaceEventInfo } from "../spaceDefs";
import {
  ENTRY_NOTE_MAX_LENGTH,
  isOfficialRaceUrl,
  raceEntryLink,
  raceOfficialDomains,
} from "../raceEntry";

const races = raceSpaceDefs();
const withEntry = races.filter((d) => d.event?.entryUrl);

/* Ticketing marketplaces and fundraising sites the organisers' pages
   link on to. A race's entry link is the organiser's own page, never
   one of these, even where the organiser sells through it. */
const NOT_THE_ORGANISER = [
  "letsdothis.com",
  "active.com",
  "eventbrite.com",
  "eventbrite.co.uk",
  "raceroster.com",
  "njuko.com",
  "realbuzz.com",
  "justgiving.com",
  "worldsmarathons.com",
  "findarace.com",
  "ahotu.com",
  "runsignup.com",
  "hakuapp.com",
];

describe("every race's entry link (Reg1)", () => {
  it("is set on most races, so the button is not a rarity", () => {
    expect(withEntry.length).toBeGreaterThan(races.length / 2);
  });

  it.each(withEntry.map((d) => [d.id, d.event!] as const))(
    "%s: https, on the race's own domains, no tracking",
    (_id, event) => {
      const url = new URL(event.entryUrl!);
      expect(url.protocol).toBe("https:");
      expect(isOfficialRaceUrl(event.entryUrl!, event)).toBe(true);
      for (const host of NOT_THE_ORGANISER)
        expect(url.hostname.endsWith(host)).toBe(false);
      expect(url.search).not.toMatch(/utm_|ref=|affiliate|aff_|partner/i);
      expect(url.hash).toBe("");
    }
  );

  it("names other domains only as bare hosts", () => {
    for (const d of races) {
      for (const domain of d.event?.entryDomains ?? []) {
        expect(domain, d.id).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      }
    }
  });

  it("carries a note only beside a link, as one short sentence", () => {
    for (const d of races) {
      const note = d.event?.entryNote;
      if (note === undefined) continue;
      expect(d.event?.entryUrl, d.id).toBeDefined();
      expect(note.length, d.id).toBeLessThanOrEqual(ENTRY_NOTE_MAX_LENGTH);
      expect(note, d.id).toMatch(/^[A-Z][^—!]*\.$/);
    }
  });
});

describe("raceOfficialDomains / isOfficialRaceUrl", () => {
  const event = {
    websiteUrl: "https://www.example-marathon.com/en/",
    entryDomains: ["example-events.co.uk"],
  };

  it("is the website's host without www, then the organiser's others", () => {
    expect(raceOfficialDomains(event)).toEqual([
      "example-marathon.com",
      "example-events.co.uk",
    ]);
  });

  it.each([
    ["https://www.example-marathon.com/enter", true],
    ["https://register.example-marathon.com/2027", true],
    ["https://example-events.co.uk/race", true],
    ["http://www.example-marathon.com/enter", false],
    ["https://example-marathon.com.evil.io/enter", false],
    ["https://notexample-marathon.com/enter", false],
    ["https://user@www.example-marathon.com/enter", false],
    ["https://www.example-marathon.com:8443/enter", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isOfficialRaceUrl(url, event)).toBe(expected);
  });
});

describe("raceEntryLink", () => {
  const event: SpaceEventInfo = {
    dateKey: "2027-04-18",
    distance: "marathon",
    city: "Manchester",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    websiteUrl: "https://www.example-marathon.com",
    entryUrl: "https://www.example-marathon.com/enter",
    entryNote: "Entry is by ballot.",
  };

  it("offers the entry page while the race is ahead", () => {
    expect(raceEntryLink(event, "2027-04-18")).toEqual({
      url: "https://www.example-marathon.com/enter",
      note: "Entry is by ballot.",
    });
  });

  it("offers nothing once race day has passed", () => {
    expect(raceEntryLink(event, "2027-04-19")).toBeNull();
  });

  it("offers nothing without a link, or with one off the race's domains", () => {
    expect(
      raceEntryLink({ ...event, entryUrl: undefined }, "2027-01-01")
    ).toBeNull();
    expect(
      raceEntryLink(
        { ...event, entryUrl: "https://www.letsdothis.com/gb/e/x" },
        "2027-01-01"
      )
    ).toBeNull();
  });
});
