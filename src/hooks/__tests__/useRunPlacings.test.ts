/**
 * useRunPlacings — a saved run's top three on its page (Run29): the place
 * it holds among the runs that started before it, ranked from the history
 * the session holds, read only when none is held and only for a run that
 * could place.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useRunPlacings } from "../useRunPlacings";
import type { PlacedRun } from "@/lib/runPlacings";
import { readRunHistory } from "@/lib/savedRuns";
import { dropPlacedRun, forgetPlacingHistory } from "@/lib/runPlacingHistory";
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
  forgetPlacingHistory();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Runs a, b and c before `this`, 5K times 1510, 1600, 1650. */
function seedHistory() {
  seedFirestore({
    "users/u1/runs/a": stored(20, 1510),
    "users/u1/runs/b": stored(15, 1600),
    "users/u1/runs/c": stored(10, 1650),
    "users/u1/runs/this": stored(5, 1541),
  });
}

const SECOND = [{ meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 }];

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

  it("counts a run saved after this one when it started before it", async () => {
    seedFirestore({
      // Started 8 days ago and left on the finish screen until 3 days ago.
      "users/u1/runs/late": stored(3, 1510, {
        startedAt: NOW - 8 * DAY,
      }),
      "users/u1/runs/this": stored(5, 1541, { startedAt: NOW - 5 * DAY }),
    });
    const run = subject({ startedAt: new Date(NOW - 5 * DAY) });
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await waitFor(() =>
      expect(result.current).toEqual([
        { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
      ])
    );
  });

  it("reads nothing for a treadmill run, which places nowhere", async () => {
    seedFirestore({ "users/u1/runs/a": stored(20, 1510) });
    const run = subject({ place: "treadmill" });
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
    expect(readsAt("users/u1/runs")).toHaveLength(0);
  });

  it("reads no runs when the finish or Bests already read the history", async () => {
    seedHistory();
    // The finish's read of every run (Bests' goes through the same reader).
    await readRunHistory("u1");
    const before = readsAt("users/u1/runs").length;
    const { result } = renderHook(() => useRunPlacings("u1", subject()));
    expect(result.current).toEqual(SECOND);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(readsAt("users/u1/runs")).toHaveLength(before);
  });

  it("reads the history once, and not again for the next run opened", async () => {
    seedHistory();
    const first = renderHook(() => useRunPlacings("u1", subject()));
    await waitFor(() => expect(first.result.current).toEqual(SECOND));
    expect(readsAt("users/u1/runs")).toHaveLength(1);
    first.unmount();
    // Another run's page, later in the session.
    const next = renderHook(() =>
      useRunPlacings(
        "u1",
        subject({
          id: "c",
          completedAt: new Date(NOW - 10 * DAY),
          bestEfforts: [{ distance: 5000, time: 1650 }],
        })
      )
    );
    expect(next.result.current).toEqual([
      { meters: 5000, seconds: 1650, place: 3, bestSeconds: 1510 },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(readsAt("users/u1/runs")).toHaveLength(1);
  });

  it("shows no place offline, when the history may be incomplete", async () => {
    seedHistory();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderHook(() => useRunPlacings("u1", subject()));
    // POSITIVE anchor: the read was made and came back.
    await waitFor(() =>
      expect(readsAt("users/u1/runs").length).toBeGreaterThan(0)
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
  });

  it("moves the place when an earlier run is deleted on this phone", async () => {
    seedHistory();
    const { result } = renderHook(() => useRunPlacings("u1", subject()));
    await waitFor(() => expect(result.current).toEqual(SECOND));
    act(() => dropPlacedRun("u1", "a"));
    expect(result.current).toEqual([
      { meters: 5000, seconds: 1541, place: 1, bestSeconds: 1600 },
    ]);
  });

  it("holds one account's history for that account only", async () => {
    seedHistory();
    await readRunHistory("u1");
    const { result } = renderHook(() => useRunPlacings("u2", subject()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
    expect(readsAt("users/u2/runs")).toHaveLength(1);
  });

  it("shows nothing when the history could not be read", async () => {
    failNextFirestore("getDocs", { path: "users/u1/runs" });
    const run = subject();
    const { result } = renderHook(() => useRunPlacings("u1", run));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toEqual([]);
  });
});
