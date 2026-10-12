import { describe, expect, it, vi } from "vitest";
import { checkDateSource } from "../check-source";
import { parseOfficialDates } from "../date-parser";
import { DATE_SOURCES } from "../sources";

// Small structural fixtures for the repaired official-page adapters. Dates
// outside the reviewed field deliberately differ from the actual race day.
const fixtures: Array<[string, string, string[]]> = [
  [
    "supernova-kelpies-5k",
    "<title>Supernova Run - 7th November 2026, 12th/13th March 2027</title>",
    ["2027-03-12", "2027-03-13"],
  ],
  [
    "race-to-the-stones-100k",
    '<title>Race to the Stones 2027</title><li>Date: 10-11th July 2027</li><div class="card-body"><h3 class="card-title">100K NON-STOP</h3><p>Saturday 10th July 2027</p></div><div class="card-body"><h3 class="card-title">50K DAY TWO</h3><p>Sunday 11th July 2027</p></div>',
    ["2027-07-10"],
  ],
  [
    "chiltern-50",
    '<title>Ultra Challenge</title><h2 class="elementor-heading-title">Chiltern 50<br>Ultra Challenge<sup>®</sup></h2><h2 class="elementor-heading-title">Sat 25 SEPT 2027</h2><p class="elementor-image-box-description">Sat 10 October 2026</p>',
    ["2027-09-25"],
  ],
  [
    "chester-marathon",
    "<title>Chester Marathon</title><main><h1>Chester Marathon</h1><div><span>11 October 2026</span></div></main>",
    ["2026-10-11"],
  ],
  [
    "amsterdam-marathon",
    '<title>TCS Amsterdam Marathon</title><div class="faq-item">The next edition is on 18 October 2026</div>',
    ["2026-10-18"],
  ],
  [
    "houston-marathon",
    '<title>Houston Marathon</title><div class="et_pb_toggle_content"><p>The Chevron Houston Marathon and Aramco Houston Half Marathon will take place on Jan. 17, 2027.</p></div>',
    ["2027-01-17"],
  ],
  [
    "seville-marathon",
    "<title>Seville Marathon</title><h3>Date</h3><p>The Zurich Seville Marathon 2027 will take place on 21 February 2027.</p>",
    ["2027-02-21"],
  ],
  [
    "paris-marathon",
    "<title>Marathon de Paris</title><details><p>The 50th edition of the ASICS Marathon de Paris will take place on 11 April 2027.</p></details>",
    ["2027-04-11"],
  ],
  [
    "new-york-city-marathon",
    '<title>New York City Marathon</title><section data-block-type="countdown-block"><time datetime="2026-11-01T04:00:00.000Z">November 1, 2026</time></section>',
    ["2026-11-01"],
  ],
  [
    "great-birmingham-run",
    '<title>Support</title><a href="/support/solutions/folders/80000704445">Great Birmingham Run 2 May 2027</a>',
    ["2027-05-02"],
  ],
  [
    "great-manchester-run",
    '<title>Support</title><a href="/support/solutions/folders/80000699828">Great Manchester Run 23 May 2027</a>',
    ["2027-05-23"],
  ],
  [
    "great-bristol-10k",
    '<title>Great Bristol 10K</title><p class="css-1ldkydh">9th May 2027</p>',
    ["2027-05-09"],
  ],
  [
    "great-north-run",
    '<title>Great North Run</title><div class="event-details"><span>12 September 2027</span></div>',
    ["2027-09-12"],
  ],
  [
    "london-marathon",
    '<title>London Marathon</title><div class="event-meta__date">24 &amp; 25 April 2027</div>',
    ["2027-04-24", "2027-04-25"],
  ],
];

describe("repaired date sources", () => {
  it.each(fixtures)("reads only the event date for %s", (id, html, dates) => {
    expect(
      parseOfficialDates(
        `${html}<p>Registration closes 1 January 2027</p><time>2026-01-01</time>`,
        DATE_SOURCES[id]
      )
    ).toEqual(dates);
  });

  it.each(["great-bristol-10k", "great-north-run"])(
    "requires both entry sources for %s",
    async (id) => {
      const source = DATE_SOURCES[id];
      const [, html, dates] = fixtures.find((f) => f[0] === id)!;
      const partner = source.corroborate![0];
      const fetcher = vi.fn(async (s: typeof source) => ({
        url: s.url,
        html:
          s === source
            ? html
            : `<title>${partner.identity}</title><div class="generic-hero-bannner__copy__text">${dates[0]}</div>`,
      }));
      const result = await checkDateSource(source, fetcher);
      expect(result.dateKeys).toEqual(dates);
      expect(result.sources.map((s) => s.url)).toEqual([
        source.url,
        partner.url,
      ]);
      expect(result.sources.every((s) => /^[a-f0-9]{64}$/.test(s.sha256))).toBe(
        true
      );
      expect(fetcher).toHaveBeenCalledTimes(2);

      await expect(
        checkDateSource(source, async (s) => ({
          url: s.url,
          html:
            s === source
              ? html
              : `<title>${partner.identity}</title><div class="generic-hero-bannner__copy__text">2028-06-01</div>`,
        }))
      ).rejects.toThrow("disagree");
      await expect(
        checkDateSource(source, async (s) => {
          if (s === partner) throw new Error("HTTP 403");
          return { url: s.url, html };
        })
      ).rejects.toThrow("HTTP 403");
    }
  );
});
