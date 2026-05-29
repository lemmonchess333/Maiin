/**
 * Run9 phase 2 — freeform cadence line contract.
 *
 * Pins the three variants + the two lock guarantees: never a "0×" count
 * (R3-coldstart) and descriptive-only (no target). The hero maps each variant
 * to copy; these tests own the boundary logic.
 */
import { describe, it, expect } from "vitest";
import { getFreeformCadence } from "../freeformCadence";

const NOW = new Date("2026-05-29T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("getFreeformCadence", () => {
  it("cold-start when no runs have ever been logged", () => {
    expect(getFreeformCadence([], NOW)).toEqual({ kind: "cold-start" });
  });

  it("cadence with the count of runs inside the default 4-week window", () => {
    const runs = [daysAgo(1), daysAgo(8), daysAgo(20)];
    expect(getFreeformCadence(runs, NOW)).toEqual({
      kind: "cadence",
      count: 3,
      weeks: 4,
    });
  });

  it("counts only runs inside the window — older ones don't inflate the count", () => {
    // 2 inside 4 weeks (28d), 2 outside.
    const runs = [daysAgo(3), daysAgo(25), daysAgo(40), daysAgo(100)];
    expect(getFreeformCadence(runs, NOW)).toEqual({
      kind: "cadence",
      count: 2,
      weeks: 4,
    });
  });

  it("lapsed (not '0×') when runs exist but none in the window", () => {
    const runs = [daysAgo(40), daysAgo(90)];
    expect(getFreeformCadence(runs, NOW)).toEqual({
      kind: "lapsed",
      lastRunDaysAgo: 40,
    });
  });

  it("a single run in the window reads as 1× — the never-0× guarantee", () => {
    const result = getFreeformCadence([daysAgo(2)], NOW);
    expect(result).toEqual({ kind: "cadence", count: 1, weeks: 4 });
    // Whatever the inputs, a cadence result never carries a zero count.
    if (result.kind === "cadence") expect(result.count).toBeGreaterThan(0);
  });

  it("respects a custom window width", () => {
    const runs = [daysAgo(3), daysAgo(10)]; // only 1 within 1 week
    expect(getFreeformCadence(runs, NOW, 1)).toEqual({
      kind: "cadence",
      count: 1,
      weeks: 1,
    });
  });

  it("includes a run exactly at the window boundary (>= windowStart)", () => {
    // 4 weeks = 28 days; a run exactly 28d ago sits on the boundary.
    expect(getFreeformCadence([daysAgo(28)], NOW)).toEqual({
      kind: "cadence",
      count: 1,
      weeks: 4,
    });
  });

  it("ignores future-dated runs (clock skew) — they neither count nor lead lapsed", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    // Only a future run + one old run → the future one is dropped, leaving a
    // lapsed runner anchored on the real past run.
    expect(getFreeformCadence([future, daysAgo(50)], NOW)).toEqual({
      kind: "lapsed",
      lastRunDaysAgo: 50,
    });
  });

  it("a lone future-dated run reads as cold-start (no real history)", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(getFreeformCadence([future], NOW)).toEqual({ kind: "cold-start" });
  });
});
