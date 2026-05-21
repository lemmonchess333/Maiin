/**
 * PR-K Q9b — taper duration cap tests.
 *
 * Asserts that taper occupies the locked number of weeks per race
 * distance, and that the auxiliary `isCurrentWeekInTaper` predicate
 * lights up only inside the taper window.
 */
import { describe, it, expect } from "vitest";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "../runScheduler";

/* The internal getPhaseForWeek is not exported; we exercise it
   indirectly through the public getRacePhaseLabel + isCurrentWeekInTaper.
   That keeps the test pinned to user-observable behaviour. */

function countWeeksByPhase(
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon",
) {
  const counts = { Base: 0, Build: 0, Taper: 0, Race: 0 } as Record<
    string,
    number
  >;
  for (let w = 0; w < totalWeeks; w++) {
    const label = getRacePhaseLabel(w, totalWeeks, distance);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}

describe("PR-K Q9b — taper week cap", () => {
  it("5K plan: 1 taper week + 1 race week", () => {
    const counts = countWeeksByPhase(8, "5k");
    expect(counts.Taper).toBe(1);
    expect(counts.Race).toBe(1);
  });

  it("10K plan: 1 taper week + 1 race week", () => {
    const counts = countWeeksByPhase(10, "10k");
    expect(counts.Taper).toBe(1);
    expect(counts.Race).toBe(1);
  });

  it("half marathon plan: 2 taper weeks + 1 race week", () => {
    const counts = countWeeksByPhase(12, "half");
    expect(counts.Taper).toBe(2);
    expect(counts.Race).toBe(1);
  });

  it("marathon plan: 3 taper weeks + 1 race week", () => {
    const counts = countWeeksByPhase(16, "marathon");
    expect(counts.Taper).toBe(3);
    expect(counts.Race).toBe(1);
  });

  it("compressed 6-week marathon plan: still caps taper at 3", () => {
    const counts = countWeeksByPhase(6, "marathon");
    expect(counts.Taper).toBe(3);
    expect(counts.Race).toBe(1);
  });
});

describe("PR-K Q9b — taper placement", () => {
  it("places taper weeks immediately before race week (marathon, 16w)", () => {
    /* Race week is at index 15 (totalWeeks - 1). Taper occupies the
       three weeks immediately before: 12, 13, 14. Anything earlier
       must NOT be taper. */
    expect(getRacePhaseLabel(15, 16, "marathon")).toBe("Race");
    expect(getRacePhaseLabel(14, 16, "marathon")).toBe("Taper");
    expect(getRacePhaseLabel(13, 16, "marathon")).toBe("Taper");
    expect(getRacePhaseLabel(12, 16, "marathon")).toBe("Taper");
    expect(getRacePhaseLabel(11, 16, "marathon")).toBe("Build");
  });

  it("places taper week immediately before race (5K, 8w)", () => {
    expect(getRacePhaseLabel(7, 8, "5k")).toBe("Race");
    expect(getRacePhaseLabel(6, 8, "5k")).toBe("Taper");
    expect(getRacePhaseLabel(5, 8, "5k")).toBe("Build");
  });
});

describe("PR-K Q9d — isCurrentWeekInTaper predicate", () => {
  it("returns true when the current week is in the taper window", () => {
    expect(isCurrentWeekInTaper(14, 16, "marathon")).toBe(true);
    expect(isCurrentWeekInTaper(6, 8, "5k")).toBe(true);
  });

  it("returns false during the race week itself", () => {
    expect(isCurrentWeekInTaper(15, 16, "marathon")).toBe(false);
  });

  it("returns false during build / base weeks", () => {
    expect(isCurrentWeekInTaper(0, 16, "marathon")).toBe(false);
    expect(isCurrentWeekInTaper(11, 16, "marathon")).toBe(false);
  });

  it("returns false when the run plan is missing fields", () => {
    expect(isCurrentWeekInTaper(undefined, 16, "marathon")).toBe(false);
    expect(isCurrentWeekInTaper(14, undefined, "marathon")).toBe(false);
    expect(isCurrentWeekInTaper(14, 16, undefined)).toBe(false);
  });
});
