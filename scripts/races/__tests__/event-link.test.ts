import { describe, expect, it, vi } from "vitest";
import { resolveOfficialEventLink } from "../date-parser";
import { checkDateSource } from "../check-source";
import { DATE_SOURCES } from "../sources";

const source = DATE_SOURCES["prague-marathon"];
const path = (year: number) => `/en/events/vodafone-prague-marathon-${year}`;
const calendar = (...hrefs: string[]) =>
  `<title>Races | RunCzech</title><div class="c-events__item--prague-inter-marathon"><div class="c-events__item-headline">${hrefs.map((href) => `<a href="${href}">Vodafone Prague Marathon</a>`).join("")}</div></div>`;

describe("official calendar event links", () => {
  it("discovers future editions without an annual URL change", () => {
    expect(
      resolveOfficialEventLink(calendar(path(2028), path(2028)), source)
    ).toBe("https://www.runczech.com" + path(2028));
  });

  it("ignores other races and fails closed on absent, ambiguous or changed calendars", () => {
    expect(() =>
      resolveOfficialEventLink(
        calendar("/en/events/prague-half-marathon-2028"),
        source
      )
    ).toThrow("single");
    expect(() =>
      resolveOfficialEventLink(calendar(path(2027), path(2028)), source)
    ).toThrow("single");
    expect(() =>
      resolveOfficialEventLink(
        calendar(path(2028)).replace("Races | RunCzech", "Other organiser"),
        source
      )
    ).toThrow("identity");
  });

  it.each([
    "https://example.org" + path(2028),
    "http://www.runczech.com" + path(2028),
    "https://untrusted@www.runczech.com" + path(2028),
  ])("never follows an unreviewed target: %s", (href) => {
    expect(() => resolveOfficialEventLink(calendar(href), source)).toThrow(
      "Unreviewed"
    );
  });

  it("reads the actual race day after discovery and records that edition as evidence", async () => {
    const eventUrl = "https://www.runczech.com" + path(2028);
    const fetcher = vi.fn(async (s: typeof source) => ({
      url: s.url,
      html:
        s.url === source.url
          ? calendar(path(2028))
          : '<title>Vodafone Prague Marathon 2028</title><div class="c-races__item-title">Vodafone Prague Marathon Distance: 42.195km Date: Sunday 7. 5. 2028 From 08:00</div>',
    }));
    const result = await checkDateSource(source, fetcher);
    expect(result.dateKeys).toEqual(["2028-05-07"]);
    expect(result.sources).toEqual([
      { url: eventUrl, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(fetcher.mock.calls.map(([s]) => s.url)).toEqual([
      source.url,
      eventUrl,
    ]);
  });

  it("does not use a calendar date if the linked race page cannot be read", async () => {
    await expect(
      checkDateSource(source, async (s) => {
        if (s.url !== source.url) throw new Error("HTTP 503");
        return { url: source.url, html: calendar(path(2028)) };
      })
    ).rejects.toThrow("HTTP 503");
  });
});
