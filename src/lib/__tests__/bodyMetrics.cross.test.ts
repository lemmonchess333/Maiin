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

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { sanitizeProfileData } = require(
  resolve(here, "../../../functions/profileSanitizer.js")
) as {
  sanitizeProfileData: (
    input: Record<string, unknown>
  ) => Record<string, unknown>;
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
