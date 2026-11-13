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
import { dateOfBirthProblem } from "../age";
import { addLocalDays, localDateString, parseLocalDate } from "../dateHelpers";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { sanitizeProfileData, cleanDateOfBirth, ...server } = require(
  resolve(here, "../../../functions/profileSanitizer.js")
) as {
  sanitizeProfileData: (
    input: Record<string, unknown>
  ) => Record<string, unknown>;
  cleanDateOfBirth: (value: unknown, now: Date) => string | undefined;
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

/* App1 (grill Q57): setup and Settings check a date of birth on the
   person's own day (src/lib/age.ts); the sanitizer checks it on the
   server's, in UTC, with a day's slack either side for the time zones. So
   every date the app takes, the server keeps, and the server keeps more
   only by the day the slack gives. */
describe("a date of birth the app takes is one the server keeps", () => {
  const today = "2026-11-13";
  // Noon UTC on the person's today.
  const now = new Date("2026-11-13T12:00:00Z");
  const shift = (key: string, days: number) =>
    localDateString(addLocalDays(parseLocalDate(key), days));
  // A fortnight either side of each boundary: turning 16, turning 121, and
  // today itself.
  const around = (centre: string) =>
    Array.from({ length: 29 }, (_, i) => shift(centre, i - 14));
  const dates = [
    ...around("2010-11-13"),
    ...around("1905-11-13"),
    ...around(today),
    "2008-02-29",
    "1990-06-15",
  ];

  it("holds the same ages", () => {
    expect(server.AGE_YEARS).toEqual(AGE_YEARS);
  });

  it.each(dates)("%s", (dateOfBirth) => {
    const kept = cleanDateOfBirth(dateOfBirth, now) === dateOfBirth;
    if (dateOfBirthProblem(dateOfBirth, today) === null)
      expect(kept, "the app takes it, so the server keeps it").toBe(true);
    if (kept)
      expect(
        [-1, 0, 1].some(
          (days) => dateOfBirthProblem(dateOfBirth, shift(today, days)) === null
        ),
        "the server keeps only what some time zone's today takes"
      ).toBe(true);
  });
});
