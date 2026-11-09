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

describe("Dublin's yearly event-dates page", () => {
  const dublin = DATE_SOURCES["dublin-marathon"];
  const datesPath = (year: number) => `/${year}-event-dates-entry-information/`;
  const home = (...hrefs: string[]) =>
    `<title>Irish Life Dublin Marathon ¦ Dublin City Marathon ¦ Dublin Marathon</title>${hrefs
      .map(
        (href) =>
          `<a class="kb-nav-link-content" href="${href}"><strong>Key Dates &amp; Entry Information</strong></a>`
      )
      .join("")}`;
  /* The page's shape: the marathon's KEY DETAILS list straight after its
     heading, then the Race Series events, whose "Race Date:" items are
     laid out differently and are decoys here. */
  const datesPage = (year: number) =>
    `<title>${year} Event Dates &amp; Entry Information - Irish Life Dublin Marathon</title>` +
    `<h2>${year} Irish Life Dublin Marathon</h2><p><strong>KEY DETAILS</strong></p>` +
    `<ul><li><strong>Race Date:</strong> Sunday 24 October ${year}</li><li><strong>Location:</strong> Dublin City Centre</li></ul>` +
    `<ul><li><strong>Entry opens:</strong> Wednesday 10 February ${year}</li></ul>` +
    `<h2>${year} Irish Life Dublin Race Series</h2><p>Three events from July to September.</p>` +
    `<h3>10K</h3><ul><li><strong>Race Date:</strong> Sunday 11 July ${year}</li></ul>` +
    `<h3>Half</h3><ul><li><strong>Race Date:</strong> Sunday 19 September ${year}</li></ul>`;

  it("finds next year's page from the menu without a yearly URL change", () => {
    expect(
      resolveOfficialEventLink(
        home("https://irishlifedublinmarathon.ie" + datesPath(2028)),
        dublin
      )
    ).toBe("https://irishlifedublinmarathon.ie" + datesPath(2028));
    expect(() =>
      resolveOfficialEventLink(home(datesPath(2027), datesPath(2028)), dublin)
    ).toThrow("single");
  });

  it("reads the marathon's race date, not the Race Series' or the entry dates", async () => {
    const fetcher = vi.fn(async (s: typeof dublin) => ({
      url: s.url,
      html: s.url === dublin.url ? home(datesPath(2027)) : datesPage(2027),
    }));
    const result = await checkDateSource(dublin, fetcher);
    expect(result.dateKeys).toEqual(["2027-10-24"]);
    expect(result.sources[0].url).toBe(
      "https://irishlifedublinmarathon.ie" + datesPath(2027)
    );
  });

  it("fails closed when a second race date lands in the marathon's list", async () => {
    const fetcher = vi.fn(async (s: typeof dublin) => ({
      url: s.url,
      html:
        s.url === dublin.url
          ? home(datesPath(2027))
          : datesPage(2027).replace(
              "<li><strong>Location:",
              "<li><strong>Race Date:</strong> Sunday 31 October 2027</li><li><strong>Location:"
            ),
    }));
    await expect(checkDateSource(dublin, fetcher)).rejects.toThrow();
  });
});
