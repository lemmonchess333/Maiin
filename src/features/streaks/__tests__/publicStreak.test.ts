import { describe, expect, it } from "vitest";
import { publicStreakAsOf } from "../publicStreak";

describe("publicStreakAsOf", () => {
  it("shows a streak whose last day is today, yesterday or the day before", () => {
    expect(publicStreakAsOf(40, "2026-10-21", "2026-10-21")).toBe(40);
    expect(publicStreakAsOf(40, "2026-10-20", "2026-10-21")).toBe(40);
    expect(publicStreakAsOf(40, "2026-10-19", "2026-10-21")).toBe(40);
  });

  it("reads 0 for a person who lapsed", () => {
    expect(publicStreakAsOf(40, "2026-10-18", "2026-10-21")).toBe(0);
    expect(publicStreakAsOf(40, "2026-08-01", "2026-10-21")).toBe(0);
  });

  it("keeps the stored count when the profile does not say the day", () => {
    expect(publicStreakAsOf(12, undefined, "2026-10-21")).toBe(12);
    expect(publicStreakAsOf(12, "not a day", "2026-10-21")).toBe(12);
  });

  it("is never negative or fractional, and 0 for a missing count", () => {
    expect(publicStreakAsOf(-3, "2026-10-21", "2026-10-21")).toBe(0);
    expect(publicStreakAsOf(4.7, "2026-10-21", "2026-10-21")).toBe(4);
    expect(publicStreakAsOf(undefined, "2026-10-21", "2026-10-21")).toBe(0);
  });
});
