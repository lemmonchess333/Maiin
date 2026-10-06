// @vitest-environment jsdom — renders the hook; the rest of this directory runs in the node environment.
/**
 * Whether a long or hard run finished in the 24 hours before a session
 * started (Lift4 (14)): the window is the day before the start, and a run
 * after the start, an easy one, or one that doesn't count says no.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const stats = vi.hoisted(() => ({
  runs: [] as Array<Record<string, unknown>>,
  evidenceReady: true,
}));
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    runs: stats.runs,
    evidenceReady: stats.evidenceReady,
  }),
}));
import { useHardRunBefore } from "../useEasierTodayRecommendation";

const START = new Date("2026-09-10T18:00:00").getTime();
const HOUR = 3_600_000;
const run = (hoursBefore: number, over: Record<string, unknown> = {}) => ({
  id: `run-${hoursBefore}`,
  distance: 12_000,
  duration: 3_600,
  completedAt: new Date(START - hoursBefore * HOUR),
  ...over,
});

function answer() {
  return renderHook(() => useHardRunBefore()).result.current(START);
}

describe("useHardRunBefore", () => {
  it("says yes for a long run in the 24 hours before the start", () => {
    stats.runs = [run(20)];
    expect(answer()).toBe(true);
    stats.runs = [run(24)];
    expect(answer()).toBe(true);
  });

  it("says no outside the window, or after the start", () => {
    stats.runs = [run(25)];
    expect(answer()).toBe(false);
    stats.runs = [run(-1)];
    expect(answer()).toBe(false);
  });

  it("says no for an easy run, and while the runs aren't read yet", () => {
    stats.runs = [run(5, { distance: 4_000, duration: 1_500 })];
    expect(answer()).toBe(false);
    stats.runs = [run(5)];
    stats.evidenceReady = false;
    expect(answer()).toBe(false);
    stats.evidenceReady = true;
  });
});
