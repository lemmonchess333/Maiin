/**
 * Onboarding's answers survive the server's sanitizer.
 *
 * `completeOnboarding` saves the profile through
 * `functions/profileSanitizer.js`, which DROPS a value it does not accept,
 * silently. Two answers fell through that gap. Onboarding took a height of
 * 100–250 cm against the sanitizer's 120–230, and a dropped height failed
 * the save as a missing field, shown as "Check your connection". And
 * "Prefer not to say" went as "unspecified", which the sanitizer's gender
 * list did not have, so the answer vanished.
 *
 * Each bound is checked from both sides: the bound survives, the step past
 * it is dropped. A bound moved on either side alone fails here.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGE_YEARS,
  HEIGHT_CM,
  WEIGHT_KG,
  heightRangeInFeet,
  parseAgeYears,
} from "../bodyMetrics";
import { DRAFT_GENDERS } from "../onboardingDraft";
import { birthYearProblem } from "../age";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { sanitizeProfileData, cleanBirthYear, ...server } = require(
  resolve(here, "../../../functions/profileSanitizer.js")
) as {
  sanitizeProfileData: (
    input: Record<string, unknown>
  ) => Record<string, unknown>;
  cleanBirthYear: (value: unknown, now: Date) => number | undefined;
  AGE_YEARS: { min: number; max: number };
};

const kept = (field: string, value: unknown) =>
  sanitizeProfileData({ [field]: value })[field];

describe("onboarding's body metrics are the server's", () => {
  it.each([
    ["heightCm", HEIGHT_CM],
    ["weightKg", WEIGHT_KG],
  ] as const)(
    "%s: both bounds survive, a step past either is dropped",
    (field, range) => {
      expect(kept(field, range.min)).toBe(range.min);
      expect(kept(field, range.max)).toBe(range.max);
      expect(kept(field, range.min - 0.1)).toBeUndefined();
      expect(kept(field, range.max + 0.1)).toBeUndefined();
    }
  );

  it("states the height range in feet inside the centimetre bounds", () => {
    // 4 ft is 121.9 cm and 7 ft 6 in is 228.6 cm; one inch further either
    // way (3 ft 11 in, 7 ft 7 in) is outside 120-230.
    expect(heightRangeInFeet()).toBe("4 ft to 7 ft 6 in");
  });
});

/* Settings' age field took any number and saved it; the sanitizer keeps
   whole years from 16 to 120, so the field takes the same. */
describe("the age a profile keeps is the server's", () => {
  it("both bounds survive, a year past either and a fraction are dropped", () => {
    expect(kept("age", AGE_YEARS.min)).toBe(AGE_YEARS.min);
    expect(kept("age", AGE_YEARS.max)).toBe(AGE_YEARS.max);
    expect(kept("age", AGE_YEARS.min - 1)).toBeUndefined();
    expect(kept("age", AGE_YEARS.max + 1)).toBeUndefined();
    expect(kept("age", 30.5)).toBeUndefined();
  });

  it.each([
    ["30", 30],
    [" 16 ", 16],
    ["120", 120],
  ])("parses %j as %i", (text, years) => {
    expect(parseAgeYears(text)).toBe(years);
    expect(kept("age", years)).toBe(years);
  });

  it.each(["", "15", "121", "0", "-5", "30.5", "3e1", "abc"])(
    "refuses %j",
    (text) => {
      expect(parseAgeYears(text)).toBeNull();
    }
  );
});

describe("onboarding's gender answers are the server's", () => {
  it.each(DRAFT_GENDERS)("%s survives", (gender) => {
    expect(kept("gender", gender)).toBe(gender);
  });
});

/* App1 (grill Q57): setup and Settings hold a year of birth to this year
   less 120 up to this year less 16, on the person's own year
   (src/lib/age.ts); the sanitizer checks it on the server's, in UTC, and
   takes one year more at the young end for a person whose own year is
   already the next one at New Year. So the server keeps every year the app
   takes there, and keeps more only by that one year. */
describe("a year of birth the app takes is one the server keeps", () => {
  const years = Array.from({ length: 140 }, (_, i) => 1895 + i);

  it("holds the same ages", () => {
    expect(server.AGE_YEARS).toEqual(AGE_YEARS);
  });

  it.each([
    // A person already in 2027 while UTC is still in 2026.
    ["2027-01-01", new Date("2026-12-31T23:30:00Z")],
    ["2026-12-31", new Date("2026-12-31T23:30:00Z")],
    ["2026-11-13", new Date("2026-11-13T12:00:00Z")],
  ] as const)("at the young end, on a person's %s", (today, now) => {
    for (const year of years.filter((y) => y > 1950)) {
      if (birthYearProblem(year, today) === null)
        expect(cleanBirthYear(year, now), `${year}`).toBe(year);
    }
  });

  it("differs from the app by the one year of young-end slack, and no more", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const serverOnly = years.filter(
      (year) =>
        cleanBirthYear(year, now) === year &&
        birthYearProblem(year, "2026-11-13") !== null
    );
    const appOnly = years.filter(
      (year) =>
        cleanBirthYear(year, now) === undefined &&
        birthYearProblem(year, "2026-11-13") === null
    );
    expect(serverOnly).toEqual([2011]);
    expect(appOnly).toEqual([]);
  });
});
