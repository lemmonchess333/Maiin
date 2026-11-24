import { describe, expect, it } from "vitest";
import type { SpaceDef } from "../../../src/features/spaces/spaceDefs";
import {
  checkEntryLink,
  checkEntryLinks,
  staleYear,
  type Fetcher,
} from "../entry-links";

const race = (entryUrl: string, extra: object = {}): SpaceDef => ({
  id: "test-marathon",
  name: "Test Marathon",
  tagline: "t",
  kind: "race",
  accent: "running",
  icon: "flag",
  event: {
    dateKey: "2027-04-18",
    distance: "marathon",
    city: "Testville",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    websiteUrl: "https://www.testmarathon.co.uk",
    entryUrl,
    ...extra,
  },
});

/** A fetcher answering from a table: url → [status, headers]. */
function site(
  pages: Record<string, [number, Record<string, string>?]>
): Fetcher {
  return async (url) => {
    const page = pages[url];
    if (!page)
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ENOTFOUND" },
      });
    return new Response(null, { status: page[0], headers: page[1] });
  };
}

describe("checkEntryLink", () => {
  it("passes a page that answers 200, after redirects on the race's domains", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({
        "https://www.testmarathon.co.uk/enter": [301, { location: "/enter/" }],
        "https://www.testmarathon.co.uk/enter/": [
          302,
          { location: "https://entries.testmarathon.co.uk/2027" },
        ],
        "https://entries.testmarathon.co.uk/2027": [200],
      })
    );
    expect(r).toMatchObject({
      status: "ok",
      finalUrl: "https://entries.testmarathon.co.uk/2027",
    });
  });

  it.each([
    [404, "HTTP 404"],
    [410, "HTTP 410"],
    [500, "HTTP 500"],
  ])("fails a %i", async (status, reason) => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({ "https://www.testmarathon.co.uk/enter": [status] })
    );
    expect(r).toMatchObject({ status: "broken", reason });
  });

  it("fails a name that does not resolve", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({})
    );
    expect(r).toMatchObject({
      status: "broken",
      reason: "Name does not resolve (ENOTFOUND)",
    });
  });

  it("fails a redirect off the race's domains, naming where it went", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({
        "https://www.testmarathon.co.uk/enter": [
          302,
          { location: "https://www.letsdothis.com/gb/e/1" },
        ],
      })
    );
    expect(r).toMatchObject({ status: "broken" });
    expect(r?.status !== "ok" && r?.reason).toContain("www.letsdothis.com");
  });

  it("follows a plain-http hop on the race's own host", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({
        "https://www.testmarathon.co.uk/enter": [
          301,
          { location: "http://www.testmarathon.co.uk/enter/" },
        ],
        "http://www.testmarathon.co.uk/enter/": [
          301,
          { location: "https://www.testmarathon.co.uk/enter/" },
        ],
        "https://www.testmarathon.co.uk/enter/": [200, {}],
      })
    );
    expect(r).toMatchObject({ status: "ok" });
  });

  it("still fails a plain-http hop to another host", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({
        "https://www.testmarathon.co.uk/enter": [
          302,
          { location: "http://www.letsdothis.com/gb/e/1" },
        ],
      })
    );
    expect(r).toMatchObject({ status: "broken" });
  });

  it("follows a redirect to a domain the organiser also runs", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter", {
        entryDomains: ["testevents.com"],
      }),
      site({
        "https://www.testmarathon.co.uk/enter": [
          302,
          { location: "https://testevents.com/marathon" },
        ],
        "https://testevents.com/marathon": [200],
      })
    );
    expect(r?.status).toBe("ok");
  });

  it("calls a bot check unverified, not broken", async () => {
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter"),
      site({
        "https://www.testmarathon.co.uk/enter": [
          403,
          { "cf-mitigated": "challenge" },
        ],
      })
    );
    expect(r).toMatchObject({ status: "unverified" });
  });

  it("fails a link to an earlier edition without requesting it", async () => {
    let requested = false;
    const r = await checkEntryLink(
      race("https://www.testmarathon.co.uk/enter-2026"),
      async () => {
        requested = true;
        return new Response(null, { status: 200 });
      }
    );
    expect(r).toMatchObject({ status: "broken" });
    expect(requested).toBe(false);
  });

  it("skips a race with no entry link", async () => {
    const def = race("");
    delete def.event!.entryUrl;
    expect(await checkEntryLink(def, site({}))).toBeNull();
    expect(await checkEntryLinks([def], site({}))).toEqual([]);
  });
});

describe("staleYear", () => {
  it.each([
    ["https://x.com/info-registration-2026/", "2026-12-06", null],
    ["https://x.com/info-registration-2026/", "2027-12-05", 2026],
    ["https://x.com/events/marathon-2027", "2027-05-02", null],
    ["https://x.com/e/12026/", "2027-05-02", null],
    ["https://x.com/enter", "2027-05-02", null],
  ])("%s for a race on %s → %s", (url, dateKey, year) => {
    expect(staleYear(url, dateKey)).toBe(year);
  });
});
