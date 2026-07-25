/**
 * useTrainingLoadSeries — the fitness/fatigue/form curve's data feed.
 *
 * The load maths is pinned in `trainingLoad`'s own tests. What was
 * uncovered is the adapter, and its three interesting rules are all about
 * turning heterogeneous documents into comparable sessions:
 *
 *   - It fetches displayDays + 60 days of WARMUP history, because the
 *     42-day fitness EWMA needs context before the window edge or the curve
 *     fake-ramps from zero. A test that seeded only in-window data would
 *     pass while the warmup contract silently broke.
 *   - Runs and workouts carry their date DIFFERENTLY — runs a `completedAt`
 *     Timestamp, workouts a local "YYYY-MM-DD" string — so the two queries
 *     are not interchangeable and the fake has to honour both.
 *   - A workout saved without a duration falls back to 3 minutes per logged
 *     set, so an untimed session still contributes load rather than
 *     silently counting as rest.
 *
 * Failure degrades to an empty series so Analytics renders the card's empty
 * state instead of crashing the page — also pinned here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
}));

import { useTrainingLoadSeries } from "../useTrainingLoadSeries";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

const NOW = new Date(2026, 6, 15, 9, 0, 0); // Wed 15 Jul 2026

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
}
function keyOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A run doc as the app stores one — dated by `completedAt` Timestamp. */
function run(n: number, over: Record<string, unknown> = {}) {
  return {
    completedAt: Timestamp.fromDate(daysAgo(n)),
    duration: 1800,
    distance: 5000,
    activityType: "easy",
    ...over,
  };
}
/** A workout doc — dated by a local "YYYY-MM-DD" string. */
function workout(n: number, over: Record<string, unknown> = {}) {
  return {
    date: keyOf(daysAgo(n)),
    durationMinutes: 45,
    exercises: [{ sets: [{}, {}, {}] }],
    ...over,
  };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockUser = { uid: "u1" };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTrainingLoadSeries", () => {
  it("returns one point per displayed day", async () => {
    seedFirestore({ "users/u1/runs/r1": run(3) });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toHaveLength(30);
  });

  it("registers load from BOTH disciplines", async () => {
    // The curve spans run + lift; a feed that dropped either would still
    // render a plausible-looking chart.
    seedFirestore({
      "users/u1/runs/r1": run(2),
      "users/u1/workouts/w1": workout(1),
    });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fatigue = result.current.points.at(-1)?.fatigue ?? 0;
    expect(fatigue).toBeGreaterThan(0);
  });

  it("counts WARMUP history outside the display window", async () => {
    // The 42-day EWMA needs ~60 days of context. Seeding only at day 70
    // (outside a 30-day window, inside the 90-day fetch) must still lift
    // fitness at the window's start — otherwise the curve fake-ramps.
    seedFirestore({
      "users/u1/runs/old1": run(70),
      "users/u1/runs/old2": run(68),
      "users/u1/runs/old3": run(65),
    });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points[0].fitness).toBeGreaterThan(0);
  });

  it("excludes ineligible runs — an invalid save must not train you", async () => {
    seedFirestore({
      "users/u1/runs/bogus": run(2, {
        distance: 40000,
        duration: 8,
        isInvalid: true,
      }),
    });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points.every((p) => p.fatigue === 0)).toBe(true);
  });

  it("falls back to per-set minutes for an untimed workout", async () => {
    // A session saved without a duration must still count as training, not
    // silently register as rest.
    seedFirestore({
      "users/u1/workouts/w1": workout(1, {
        durationMinutes: 0,
        exercises: [{ sets: [{}, {}, {}, {}, {}] }],
      }),
    });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points.at(-1)?.fatigue).toBeGreaterThan(0);
  });

  it("skips a run with no usable completedAt", async () => {
    seedFirestore({ "users/u1/runs/broken": run(2, { completedAt: null }) });
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.points.every((p) => p.fatigue === 0)).toBe(true);
  });

  it("degrades to an empty series when a read fails", async () => {
    // Analytics renders the card's empty state rather than crashing.
    seedFirestore({ "users/u1/runs/r1": run(2) });
    failNextFirestore("getDocs", { path: "users/u1/runs" });

    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toEqual([]);
  });

  it("returns nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toEqual([]);
  });
});
