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
  isCurrentWeekInRaceWindDown,
} from "../runScheduler";

/* The internal getPhaseForWeek is not exported; we exercise it
   indirectly through the public getRacePhaseLabel + isCurrentWeekInTaper.
   That keeps the test pinned to user-observable behaviour. */

function countWeeksByPhase(
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon"
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

/**
 * P1d pin 2 — the guard the deload-suggest banner reads.
 *
 * "Is load already being deliberately cut?" is a different question from
 * "which phase is this", and race week answers yes to the first and no to
 * the second — which is why this is its own predicate rather than a reuse
 * of `isCurrentWeekInTaper`.
 *
 * Derived from `getPhaseForWeek` rather than `runPlan.phase`: that field is
 * typed `"recovery"` and no writer ever sets "taper", so the lock's literal
 * wording would have produced a guard that never fired (PR #1775's
 * `templateId === "race"` shape).
 */
describe("isCurrentWeekInRaceWindDown — the deload-suggest guard", () => {
  it("covers BOTH taper and race week", () => {
    // The taper cases, same as the predicate above...
    expect(isCurrentWeekInRaceWindDown(14, 16, "marathon")).toBe(true);
    expect(isCurrentWeekInRaceWindDown(6, 8, "5k")).toBe(true);
    // ...plus the one it deliberately diverges on. Proposing a lifting
    // deload in race week is the advice the pin exists to prevent, one
    // week later.
    expect(isCurrentWeekInRaceWindDown(15, 16, "marathon")).toBe(true);
    expect(isCurrentWeekInTaper(15, 16, "marathon")).toBe(false);
  });

  it("stays false through base and build — the banner must still fire there", () => {
    // The other half of the contract. A guard that returned true too
    // often would silently disable deload suggestions for every race-prep
    // runner, which is a worse failure than the double-deload it prevents.
    expect(isCurrentWeekInRaceWindDown(0, 16, "marathon")).toBe(false);
    expect(isCurrentWeekInRaceWindDown(6, 16, "marathon")).toBe(false);
    expect(isCurrentWeekInRaceWindDown(11, 16, "marathon")).toBe(false);
  });

  it("is false for anyone without a race plan", () => {
    // Freeform runners and lift-only users have no currentWeek/totalWeeks/
    // distance. They must keep the unguarded behaviour exactly.
    expect(isCurrentWeekInRaceWindDown(undefined, 16, "marathon")).toBe(false);
    expect(isCurrentWeekInRaceWindDown(14, undefined, "marathon")).toBe(false);
    expect(isCurrentWeekInRaceWindDown(14, 16, undefined)).toBe(false);
    expect(isCurrentWeekInRaceWindDown(undefined, undefined, undefined)).toBe(
      false
    );
  });
});
