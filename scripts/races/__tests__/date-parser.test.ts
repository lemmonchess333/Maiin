import { describe, expect, it } from "vitest";
import {
  extractDates,
  isNextEdition,
  parseOfficialDate,
  parseOfficialDates,
  validDateKey,
} from "../date-parser";
import { preservedDate } from "../remote-events";

const source = {
  url: "https://example.org/race",
  identity: "Example Marathon",
  selector: ".race-date",
};
const page = (text: string, extra = "") =>
  `<title>Example Marathon</title><div class="race-date">${text}</div>${extra}`;

describe("official date parsing", () => {
  it("reads the event field and ignores results, registration deadlines and other races", () => {
    expect(
      parseOfficialDate(
        page(
          "Sunday 26 September 2027",
          "<p>Entries close 1 September 2027</p><time>2026-09-27</time>"
        ),
        source
      )
    ).toBe("2027-09-26");
  });
  it("understands both English date orders without UTC-shifting the day", () => {
    expect(extractDates("2026-11-01T04:00:00.000Z")).toEqual(["2026-11-01"]);
    expect(extractDates("Jan. 17, 2027")).toEqual(["2027-01-17"]);
    expect(
      extractDates(
        "September 26, 2027 / 26th September 2027 / 2027-09-26T23:00:00-07:00"
      )
    ).toEqual(["2027-09-26"]);
    expect(validDateKey("2027-02-29")).toBe(false);
    expect(validDateKey("2028-02-29")).toBe(true);
  });
  it("uses only explicitly configured numeric date order and rejects invalid dates", () => {
    expect(
      parseOfficialDate(page("11/04/2027"), { ...source, dateFormat: "dmy" })
    ).toBe("2027-04-11");
    expect(() => parseOfficialDate(page("11/04/2027"), source)).toThrow(
      "No unambiguous"
    );
    expect(() =>
      parseOfficialDate(page("31/04/2027"), { ...source, dateFormat: "dmy" })
    ).toThrow("No unambiguous");
  });
  it("prefers an inspected date field over obsolete structured data", () => {
    const obsolete =
      '<script type="application/ld+json">{"@type":"SportsEvent","name":"Example Marathon","startDate":"2026-09-27"}</script>';
    expect(parseOfficialDate(page("26 September 2027", obsolete), source)).toBe(
      "2027-09-26"
    );
  });
  it("rejects conflicting fields, missing identity, cancellation and a weekend range", () => {
    expect(() =>
      parseOfficialDate(
        page(
          "26 September 2027",
          '<div class="race-date">27 September 2027</div>'
        ),
        source
      )
    ).toThrow("Multiple");
    expect(() => parseOfficialDate(page("24 & 25 April 2027"), source)).toThrow(
      "Ambiguous"
    );
    expect(() => parseOfficialDate(page("29th/30th May 2027"), source)).toThrow(
      "Ambiguous"
    );
    expect(() =>
      parseOfficialDate(page("Cancelled: 26 September 2027"), source)
    ).toThrow("Ambiguous");
    expect(() =>
      parseOfficialDate(
        page("26 September 2027").replace("Example Marathon", "Other Race"),
        source
      )
    ).toThrow("identity");
  });
  it("requires an exact event identity in structured data, not a random page date", () => {
    const html =
      '<script type="application/ld+json">' +
      JSON.stringify({
        "@graph": [
          {
            "@type": "SportsEvent",
            name: "Example Marathon",
            startDate: "2027-09-26T09:00:00+01:00",
            endDate: "2027-09-26T17:00:00+01:00",
          },
          { "@type": "Event", name: "Example 5K", startDate: "2027-09-25" },
        ],
      }) +
      "</script>";
    expect(parseOfficialDate(html, { ...source, selector: undefined })).toBe(
      "2027-09-26"
    );
    expect(() =>
      parseOfficialDate(html.replace("2027-09-26T17", "2027-09-27T17"), {
        ...source,
        selector: undefined,
      })
    ).toThrow("multi-day");
  });
  it("refuses past, same-edition, and implausibly far-ahead candidates", () => {
    expect(isNextEdition("2027-09-26", "2026-09-27", "2026-10-04")).toBe(true);
    expect(isNextEdition("2026-10-11", "2026-09-27", "2026-10-04")).toBe(false);
    expect(isNextEdition("2030-09-26", "2026-09-27", "2026-10-04")).toBe(false);
    expect(isNextEdition("2027-09-26", "2026-09-27", "2027-10-04")).toBe(false);
  });
});

it("accepts only explicitly reviewed adjacent race days and preserves both", () => {
  const reviewed = { ...source, multipleRaceDays: true };
  expect(parseOfficialDates(page("24 & 25 April 2027"), reviewed)).toEqual([
    "2027-04-24",
    "2027-04-25",
  ]);
  expect(() => parseOfficialDate(page("24 & 25 April 2027"), reviewed)).toThrow(
    "require date selection"
  );
  for (const invalid of [
    "24 & 26 April 2027",
    "24 & 25 April 2027 or 26 April 2027",
    "23, 24 & 25 April 2027",
    "Cancelled: 24 & 25 April 2027",
  ])
    expect(() => parseOfficialDates(page(invalid), reviewed)).toThrow();
});

it("retains an automatic date across metadata syncs, but lets reviewed corrections win", () => {
  const evidence = { bundledDateKey: "2026-09-27", dateKey: "2027-09-26" };
  expect(preservedDate("2026-09-27", "2027-09-26", evidence)).toBe(
    "2027-09-26"
  );
  expect(preservedDate("2027-09-25", "2027-09-26", evidence)).toBe(
    "2027-09-25"
  );
  expect(preservedDate("2026-09-27", "2099-01-01", evidence)).toBe(
    "2026-09-27"
  );
  expect(preservedDate("2026-09-27", "2027-09-26", undefined)).toBe(
    "2026-09-27"
  );
});
