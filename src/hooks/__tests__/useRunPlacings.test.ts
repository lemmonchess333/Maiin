/**
 * useRunPlacings — a saved run's top three on its page (Run29): the place
 * it took among the runs before it, from one read of every saved run,
 * made only for a run that could place.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useRunPlacings } from "../useRunPlacings";
import type { PlacedRun } from "@/lib/runPlacings";
import {
  failNextFirestore,
  readsAt,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";

const DAY = 86_400_000;
const NOW = Date.now();

function stored(daysAgo: number, fiveK: number, extra = {}) {
  return {
    completedAt: NOW - daysAgo * DAY,
    distance: 5200,
    duration: 1600,
    avgPace: 307,
    activityType: "freerun",
    isInvalid: false,
    bestEfforts: [{ distance: 5000, time: fiveK }],
    ...extra,
  };
}

function subject(over: Partial<PlacedRun> = {}): PlacedRun {
  return {
    id: "this",
    completedAt: new Date(NOW - 5 * DAY),
    distance: 5200,
    duration: 1600,
    avgPace: 307,
    activityType: "freerun",
    place: null,
    isInvalid: false,
    savedAnyway: false,
    bestEfforts: [{ distance: 5000, time: 1541 }],
    ...over,
  };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("useRunPlacings", () => {
  it("places the run among the runs before it, not those after", async () => {
    seedFirestore({
      "users/u1/runs/a": stored(20, 1510),
      "users/u1/runs/b": stored(15, 1600),
      "users/u1/runs/c": stored(10, 1650),
      "users/u1/runs/this": stored(5, 1541),
      // Later and faster: it does not move the place the run took.
      "users/u1/runs/later": stored(2, 1400),
    });
    const run = subject();
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await waitFor(() =>
      expect(result.current).toEqual([
        { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
      ])
    );
    // The read the treadmill case below must not make.
    expect(readsAt("users/u1/runs").length).toBeGreaterThan(0);
  });

  it("reads nothing for a treadmill run, which places nowhere", async () => {
    seedFirestore({ "users/u1/runs/a": stored(20, 1510) });
    const run = subject({ place: "treadmill" });
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
    expect(readsAt("users/u1/runs")).toHaveLength(0);
  });

  it("shows nothing when the history could not be read", async () => {
    failNextFirestore("getDocs", { path: "users/u1/runs" });
    const run = subject();
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
  });
});
