/**
 * useLifetimeRunStats — the "Lifetime totals" footer on History.
 *
 * Two things here are easy to get wrong and invisible when you do:
 *
 *   1. It deliberately reads the WHOLE runs collection, because the sibling
 *      `useRunningStats` applies a `where('completedAt', '>=')` window that
 *      would silently drop pre-window runs from a total labelled "lifetime".
 *   2. `enabled: false` must actually skip the read. That flag exists so an
 *      established user with hundreds of runs doesn't pay for a
 *      full-collection scan on a surface that stopped consuming it.
 *
 * A stub returning a fixed array can express neither. The seam (ADR-0009)
 * lets both be asserted — the second via an armed-but-unfired failure,
 * which is the only way to tell "skipped the read" from "read nothing".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

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

import { useLifetimeRunStats } from "../useLifetimeRunStats";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

function run(distance: number, over: Record<string, unknown> = {}) {
  return { distance, duration: distance / 3, ...over };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockUser = { uid: "u1" };
});

describe("useLifetimeRunStats", () => {
  it("sums every run, however old", async () => {
    // The point of the hook: a windowed query would drop the 2019 run.
    seedFirestore({
      "users/u1/runs/ancient": run(10000, { completedAt: 1_550_000_000_000 }),
      "users/u1/runs/recent": run(5000, { completedAt: 1_800_000_000_000 }),
    });
    const { result } = renderHook(() => useLifetimeRunStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runCount).toBe(2);
    expect(result.current.totalDistanceM).toBe(15000);
  });

  it("excludes ineligible runs from BOTH the count and the distance", async () => {
    // A 40km/0:08 misclick would otherwise inflate a lifetime total that a
    // user reads as an achievement.
    seedFirestore({
      "users/u1/runs/good": run(5000),
      "users/u1/runs/bogus": run(40000, { duration: 8, isInvalid: true }),
    });
    const { result } = renderHook(() => useLifetimeRunStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current).toMatchObject({ runCount: 1, totalDistanceM: 5000 });
  });

  it("reports zero — not a spinner — for a user with no runs", async () => {
    const { result } = renderHook(() => useLifetimeRunStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ runCount: 0, totalDistanceM: 0 });
  });

  it("`enabled: false` performs NO read at all", async () => {
    // The whole reason the flag exists. Arming a failure on the read and
    // finding it UNFIRED proves the query never ran — asserting on the
    // returned zeros alone could not tell "skipped" from "read nothing".
    seedFirestore({ "users/u1/runs/r1": run(5000) });
    failNextFirestore("getDocs", { path: "users/u1/runs" });

    const { result } = renderHook(() =>
      useLifetimeRunStats({ enabled: false })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runCount).toBe(0);
    expect(unfiredFailures()).toHaveLength(1); // never attempted
  });

  it("leaves totals at zero when the read fails", async () => {
    seedFirestore({ "users/u1/runs/r1": run(5000) });
    failNextFirestore("getDocs", { path: "users/u1/runs" });
    const { result } = renderHook(() => useLifetimeRunStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runCount).toBe(0);
    expect(unfiredFailures()).toEqual([]); // and it really did fire
  });

  it("stops loading when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useLifetimeRunStats());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
