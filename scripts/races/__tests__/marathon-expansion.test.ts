import { describe, expect, it } from "vitest";
import { DATE_SOURCES } from "../sources";
import { parseOfficialDate } from "../date-parser";
import { spaceDef } from "../../../src/features/spaces/spaceDefs";

// The organiser's exact date elements, inspected on 2026-10-17. Dates elsewhere
// are deliberate decoys: expo days and other distances must never become race day.
const cases = [
  [
    "cape-town-marathon",
    "FAQ | Sanlam Cape Town Marathon",
    '<p class="p1">The 42.2km Sanlam Cape Town Marathon (23 May 2027) has two starts.</p><p class="p1">Peace Runs: 22 May 2027</p>',
    "2027-05-23",
  ],
  [
    "rome-marathon",
    "The marathon | Run Rome The Marathon",
    '<span class="red">14 March 2027 is your day</span><p>Expo 13 March 2027</p>',
    "2027-03-14",
  ],
  [
    "athens-marathon",
    "Athens Marathon. The Authentic",
    '<div class="race_box">MARATHON RACE 8 November 2026 08:30 More</div><div class="race_box">5km ROAD RACE 7 November 2026</div>',
    "2026-11-08",
  ],
  [
    "prague-marathon",
    "Vodafone Prague Marathon 2027",
    '<div class="c-races__item-title">Vodafone Prague Marathon Distance: 42.195km Date: Sunday 2. 5. 2027 From 08:00</div><div class="c-races__item-title">dm family mile Date: Saturday 1. 5. 2027</div>',
    "2027-05-02",
  ],
  [
    "vienna-marathon",
    "Vienna City Marathon - Marathon",
    '<div class="vcm-eventinfo-box"><div>Date: Sunday, 18 April 2027Distance: 42.195 km</div></div><p>Saturday events 17 April 2027</p>',
    "2027-04-18",
  ],
  [
    "frankfurt-marathon",
    "Mainova Frankfurt Marathon",
    "<h3>31st OCTOBER 2027</h3><p>Previous edition: 25 October 2026</p>",
    "2027-10-31",
  ],
  [
    "honolulu-marathon",
    "Honolulu Marathon",
    '<header><div class="header__date">December 13, 2026</div></header><p>Expo: December 10, 2026</p>',
    "2026-12-13",
  ],
  [
    "los-angeles-marathon",
    "ASICS Los Angeles Marathon",
    '<div class="hero-panel single-event"><h4>March 7, 2027</h4></div><p>Expo: March 5, 2027</p>',
    "2027-03-07",
  ],
] as const;

describe("new destination marathon date sources", () => {
  it.each(cases)(
    "%s reads only its reviewed race-day field",
    (id, title, body, date) => {
      expect(
        parseOfficialDate(`<title>${title}</title>${body}`, DATE_SOURCES[id])
      ).toBe(date);
      expect(spaceDef(id)?.event?.distance).toBe("marathon");
    }
  );

  it("Prague's numeric date rejects ambiguity and impossible dates", () => {
    const source = DATE_SOURCES["prague-marathon"];
    const page = (date: string) =>
      `<title>Vodafone Prague Marathon</title><div class="c-races__item-title">Vodafone Prague Marathon Distance: 42.195km Date: Sunday ${date}</div>`;
    expect(() => parseOfficialDate(page("31. 2. 2027"), source)).toThrow();
    expect(() =>
      parseOfficialDate(page("2. 5. 2027 / 9. 5. 2027"), source)
    ).toThrow();
    expect(() =>
      parseOfficialDate(
        page("2. 5. 2027").replace("42.195km", "21.0975km"),
        source
      )
    ).toThrow();
  });
});
