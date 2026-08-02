/**
 * useRunningStats — account-switch request safety.
 *
 * On a shared device, account A's in-flight run query must not land after
 * the switch to B and overwrite B's rows. Both reads SUCCEED, so nothing
 * throws and nothing logs — B simply sees A's runs. That is a privacy
 * leak that looks like working software.
 *
 * This used to run on a hand-rolled deferred-promise harness whose
 * `getDocs` ignored its argument, so "A's rows" and "B's rows" were
 * fabricated objects rather than either user's data: the hook could have
 * queried the wrong uid entirely and every test still passed. It now runs
 * on the shared fake with per-uid documents seeded at real paths, so the
 * leak assertion is about actual isolation. Ordering comes from
 * `deferReads` / `releaseRead`, added to the fake for exactly this.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Controllable auth user.
let currentUser: { uid: string } | null = { uid: "A" };
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: currentUser }),
  useUid: () => ({ user: currentUser }).user?.uid ?? null,
}));

const logError = vi.fn();
vi.mock("../../lib/logger", () => ({
  logger: { error: (...a: unknown[]) => logError(...a) },
}));
vi.mock("firebase/firestore");
vi.mock("../../lib/firebase", () => ({ db: {} }));

import { useRunningStats } from "../useRunningStats";

import {
  seedFirestore,
  resetFirestore,
  deferReads,
  pendingReads,
  releaseRead,
  failNextFirestore,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

const A_RUNS = "users/A/runs";
const B_RUNS = "users/B/runs";

/** A run inside the 30-day window the hook queries. */
const run = () => ({
  distance: 5000,
  duration: 1500,
  avgPace: 300,
  completedAt: Timestamp.fromDate(new Date("2026-07-10T10:00:00Z")),
  activityType: "freerun",
});

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
  currentUser = { uid: "A" };
  logError.mockClear();
  // Each uid owns its OWN document, so a leak shows up as the wrong id.
  seedFirestore({
    [`${A_RUNS}/a-run`]: run(),
    [`${B_RUNS}/b-run`]: run(),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useRunningStats — account switch", () => {
  it("B's later data wins even when A resolves last", async () => {
    deferReads();
    const { result, rerender } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS]));

    currentUser = { uid: "B" };
    rerender();
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS, B_RUNS]));

    // B answers first, then A answers LATE — the leak interleaving.
    await act(async () => {
      expect(releaseRead(1)).toBe(true); // B
    });
    await act(async () => {
      expect(releaseRead(0)).toBe(true); // A, stale
    });

    // The id proves WHOSE document survived, not merely that a row did.
    expect(result.current.runs.map((r) => r.id)).toEqual(["b-run"]);
  });

  it("clears A's rows immediately on switch to B", async () => {
    deferReads();
    const { result, rerender } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS]));
    await act(async () => {
      releaseRead();
    });
    expect(result.current.runs.map((r) => r.id)).toEqual(["a-run"]);

    currentUser = { uid: "B" };
    rerender();
    // Before B resolves: A's rows are gone rather than lingering under B.
    expect(result.current.runs).toHaveLength(0);
    expect(result.current.loading).toBe(true);
  });

  it("a rejected read settles loading=false, empties, and logs once", async () => {
    failNextFirestore("getDocs", { path: A_RUNS });
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels the outstanding resolution (no state update)", async () => {
    deferReads();
    const { result, unmount } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS]));
    unmount();
    await act(async () => {
      releaseRead();
    });
    expect(result.current.runs).toEqual([]);
  });

  it("a same-uid refresh keeps current rows while loading", async () => {
    deferReads();
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS]));
    await act(async () => {
      releaseRead();
    });
    expect(result.current.runs).toHaveLength(1);

    // Seed BEFORE refreshing: a deferred read snapshots at ISSUE time, so
    // data added after the call can't appear in it. (Seeding afterwards
    // silently reduced this to "1 row, still 1 row" — which passes while
    // proving nothing about the refresh replacing anything.)
    seedFirestore({ [`${A_RUNS}/a-run-2`]: run() });

    // Pull-to-refresh (same uid): rows stay visible while in flight, so
    // the list doesn't blank out under the user's thumb.
    act(() => result.current.refresh());
    await waitFor(() => expect(pendingReads()).toEqual([A_RUNS]));
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      releaseRead();
    });
    await waitFor(() => expect(result.current.runs).toHaveLength(2));
  });
});
