/**
 * useTrainingLoadSeries — the fitness/fatigue/form curve's data feed.
 *
 * The load maths is pinned in `trainingLoad`'s own tests. What was
 * uncovered is the adapter, and its three interesting rules are all about
 * turning heterogeneous documents into comparable sessions:
 *
 *   - It fetches a consistent history floor across chart ranges, with
 *     warmup before the longest chart. The 42-day fitness EWMA needs context;
 *     changing a chart range must not change the current estimate.
 *   - Runs and workouts carry their date DIFFERENTLY — modern runs have a
 *     local `date` key and legacy runs use `completedAt`; workouts have a
 *     local "YYYY-MM-DD" string. The run reader needs both queries.
 *   - A workout saved without a duration falls back to 3 minutes per logged
 *     set, so an untimed session still contributes load rather than
 *     silently counting as rest.
 *
 * Failure is distinguished from an empty history so Analytics can offer retry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
  useUid: () => ({ user: mockUser, profile: {} }).user?.uid ?? null,
}));

import { useTrainingLoadSeries } from "../useTrainingLoadSeries";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  deferReads,
  pendingReads,
  readLog,
  releaseAllReads,
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
    // (outside a 30-day window, inside the history fetch) must still lift
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

  it("reports a failed read separately and recovers on retry", async () => {
    // A failed fetch is not evidence that the runner has never trained.
    seedFirestore({ "users/u1/runs/r1": run(2) });
    failNextFirestore("getDocs", { path: "users/u1/runs" });

    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toEqual([]);
    expect(result.current.failed).toBe(true);
    act(() => result.current.refresh());
    expect(result.current.loading).toBe(true);
    expect(result.current.failed).toBe(false);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.points).toHaveLength(30);
  });

  it("reads nothing while it is not enabled, and reads once it is", async () => {
    // History draws the curve on its Performance page only.
    seedFirestore({ "users/u1/runs/r1": run(3) });
    const { result, rerender } = renderHook(
      ({ enabled }) => useTrainingLoadSeries(30, { enabled }),
      { initialProps: { enabled: false } }
    );
    await act(async () => {});
    expect(readLog()).toEqual([]);
    expect(result.current).toMatchObject({
      points: [],
      loading: false,
      failed: false,
    });

    rerender({ enabled: true });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toHaveLength(30);
  });

  it("returns nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toEqual([]);
  });
});

/* The curve is one account's training. A mount that stays up across a
   sign-out or an account switch must drop it in the render where the uid
   changes — not after an effect, and not once the next account's reads
   land. Each case first waits for the first account's curve to carry real
   load, so the absence it then asserts cannot be the initial empty state. */
describe("useTrainingLoadSeries — account ownership", () => {
  it("drops the series on sign-out", async () => {
    seedFirestore({ "users/u1/runs/r1": run(2) });
    const { result, rerender } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() =>
      expect(result.current.points.at(-1)?.fatigue ?? 0).toBeGreaterThan(0)
    );

    mockUser = null;
    rerender();
    expect(result.current.points).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("never returns account A's series to account B while B's reads are in flight", async () => {
    seedFirestore({
      "users/u1/runs/r1": run(2),
      "users/u2/workouts/w1": workout(1),
    });
    const { result, rerender } = renderHook(() => useTrainingLoadSeries(30));
    await waitFor(() =>
      expect(result.current.points.at(-1)?.fatigue ?? 0).toBeGreaterThan(0)
    );

    deferReads();
    mockUser = { uid: "u2" };
    rerender();
    await waitFor(() =>
      expect([...pendingReads()].sort()).toEqual([
        "users/u2/runs",
        "users/u2/runs",
        "users/u2/workouts",
      ])
    );
    expect(result.current.points).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      releaseAllReads();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toHaveLength(30);
    expect(result.current.points.at(-1)?.fatigue ?? 0).toBeGreaterThan(0);
  });
});

it("does not expose a previous account's read failure", async () => {
  failNextFirestore("getDocs", { path: "users/u1/runs" });
  const { result, rerender } = renderHook(() => useTrainingLoadSeries(30));
  await waitFor(() => expect(result.current.failed).toBe(true));
  deferReads();
  mockUser = { uid: "u2" };
  rerender();
  expect(result.current.failed).toBe(false);
  expect(result.current.loading).toBe(true);
  await act(async () => releaseAllReads());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.failed).toBe(false);
});

it("keeps today's training load unchanged when only the chart range changes", async () => {
  seedFirestore(
    Object.fromEntries(
      Array.from({ length: 365 }, (_, i) => [
        `users/u1/runs/daily-${i}`,
        run(i),
      ])
    )
  );
  const { result, rerender } = renderHook(
    ({ days }) => useTrainingLoadSeries(days),
    {
      initialProps: { days: 7 },
    }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const latest = result.current.points.at(-1);
  for (const days of [30, 90, 180, 365]) {
    rerender({ days });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.points).toHaveLength(days);
    expect(result.current.points.at(-1)).toEqual(latest);
  }
});

it("uses the same 28-day load baseline even when only one week is drawn", async () => {
  seedFirestore(
    Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `users/u1/runs/ramp-${i}`,
        run(i, { duration: i < 7 ? 7200 : 1800 }),
      ])
    )
  );
  const { result, rerender } = renderHook(
    ({ days }) => useTrainingLoadSeries(days),
    {
      initialProps: { days: 7 },
    }
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  const guardrails = result.current.guardrails;
  expect(guardrails?.advisory?.kind).toBe("ramp_spike");
  expect(guardrails?.acwr).toBeGreaterThan(1.5);
  rerender({ days: 30 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.guardrails).toEqual(guardrails);
});
