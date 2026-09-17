/** Running history uses live queries. Delay actual harness snapshots to
 * test stale callbacks, account isolation and cached/pending evidence. */
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
import { useEasierTodayRecommendation } from "@/features/program/useEasierTodayRecommendation";
import type { WorkoutDay } from "@/features/program/programTypes";
import { splitRouteSegments } from "@/lib/routeSegments";

import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";
import {
  Timestamp,
  type Query,
  type DocumentData,
  type QuerySnapshot,
  type SnapshotListenOptions,
} from "firebase/firestore";
import * as firestore from "firebase/firestore";
const originalOnSnapshot = firestore.onSnapshot;
type Delivery = {
  path: string;
  snapshot: QuerySnapshot<DocumentData>;
  next: (snapshot: QuerySnapshot<DocumentData>) => void;
};
let deliveries: Delivery[] = [];
let hold = false;
function deferSnapshots() {
  hold = true;
}
function pendingSnapshots() {
  return deliveries.map((d) => d.path);
}
function releaseSnapshot(
  index = 0,
  metadata = { fromCache: false, hasPendingWrites: false }
) {
  const delivery = deliveries.splice(index, 1)[0];
  if (!delivery) return false;
  delivery.next(Object.assign(delivery.snapshot, { metadata }));
  return true;
}

const A_RUNS = "users/A/runs";
const B_RUNS = "users/B/runs";

/** A run inside the 30-day window the hook queries. */
const run = () => ({
  distance: 5000,
  duration: 1500,
  avgPace: 300,
  completedAt: Timestamp.fromDate(new Date(2026, 6, 10, 10)),
  activityType: "freerun",
});

beforeEach(async () => {
  resetFirestore();
  deliveries = [];
  hold = false;
  vi.spyOn(firestore, "onSnapshot").mockImplementation(((
    query: Query<DocumentData>,
    options: SnapshotListenOptions,
    next: (snapshot: QuerySnapshot<DocumentData>) => void,
    error: (error: Error) => void
  ) =>
    originalOnSnapshot(
      query,
      options,
      (snapshot) => {
        if (hold)
          deliveries.push({
            path: (query as unknown as { path: string }).path,
            snapshot,
            next,
          });
        else next(snapshot);
      },
      error
    )) as typeof firestore.onSnapshot);
  vi.useFakeTimers({ toFake: ["Date"] });
  /* LOCAL components. "Yesterday" in this suite is a local day, and the
     run fixtures below are already built locally — a `Z` clock made the
     two disagree at a far offset. At Pacific/Kiritimati (UTC+14) noon on
     the 15th UTC is the 16th locally, so the run on the 14th stopped
     being yesterday and the coaching line never appeared. */
  vi.setSystemTime(new Date(2026, 6, 15, 12));
  currentUser = { uid: "A" };
  logError.mockClear();
  // Each uid owns its OWN document, so a leak shows up as the wrong id.
  seedFirestore({
    [`${A_RUNS}/a-run`]: run(),
    [`${B_RUNS}/b-run`]: run(),
  });
  await Promise.resolve();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("useRunningStats — account switch", () => {
  it("preserves privacy gaps in saved-run previews used by Space attachments", async () => {
    const west = Array.from({ length: 25 }, (_, i) => ({
      lat: 51.5,
      lon: -0.1 + i * 0.001,
    }));
    const east = Array.from({ length: 25 }, (_, i) => ({
      lat: 51.5,
      lon: 0.01 + i * 0.001,
      ...(i === 0 ? { breakBefore: true } : {}),
    }));
    seedFirestore({
      [`${A_RUNS}/a-run`]: { ...run(), points: [...west, ...east] },
    });

    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const preview = result.current.runs[0].routePreview!;
    expect(preview.length).toBeLessThanOrEqual(20);
    const sections = splitRouteSegments(preview);
    expect(sections).toHaveLength(2);
    expect(sections[0][0]).toEqual(west[0]);
    expect(sections[0].at(-1)).toEqual(west.at(-1));
    expect(sections[1][0]).toEqual(east[0]);
    expect(sections[1].at(-1)).toEqual(east.at(-1));
  });

  it("B's later data wins even when A resolves last", async () => {
    deferSnapshots();
    const { result, rerender } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS]));

    currentUser = { uid: "B" };
    rerender();
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS, B_RUNS]));

    // B answers first, then A answers LATE — the leak interleaving.
    await act(async () => {
      expect(releaseSnapshot(1)).toBe(true); // B
    });
    await act(async () => {
      expect(releaseSnapshot(0)).toBe(true); // A, stale
    });

    // The id proves WHOSE document survived, not merely that a row did.
    expect(result.current.runs.map((r) => r.id)).toEqual(["b-run"]);
  });

  it("clears A's rows immediately on switch to B", async () => {
    deferSnapshots();
    const { result, rerender } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS]));
    await act(async () => {
      releaseSnapshot();
    });
    expect(result.current.runs.map((r) => r.id)).toEqual(["a-run"]);

    currentUser = { uid: "B" };
    rerender();
    // Before B resolves: A's rows are gone rather than lingering under B.
    expect(result.current.runs).toHaveLength(0);
    expect(result.current.loading).toBe(true);
  });

  it("a rejected read settles loading=false, empties, and logs once", async () => {
    failNextFirestore("onSnapshot", { path: A_RUNS });
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("a rejected read is DISTINGUISHABLE from an empty one", async () => {
    // `runs: []` is the same value both ways, and History's Tier-1
    // suppression turns it into "this user has never run" — so a failed
    // read used to delete the Running section rather than report itself.
    // The log line above is not a substitute: users don't read consoles.
    failNextFirestore("onSnapshot", { path: A_RUNS });
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
  });

  it("a successful read does NOT claim failure — including an empty one", async () => {
    // Two controls in one. Without the empty case, `failed` could be
    // pinned to "did we get zero rows" and still pass, which would show
    // an error to every user who has not run yet.
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.failed).toBe(false);

    resetFirestore();
    const empty = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(empty.result.current.loading).toBe(false));
    expect(empty.result.current.runs).toEqual([]);
    expect(empty.result.current.failed).toBe(false);
  });

  it("a successful retry clears the failure", async () => {
    // Otherwise the "Try again" button would leave the error card up
    // forever and read as broken even once the read recovered.
    failNextFirestore("onSnapshot", { path: A_RUNS });
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.failed).toBe(true));

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.runs).toHaveLength(1);
  });

  it("unmount cancels the outstanding resolution (no state update)", async () => {
    deferSnapshots();
    const { result, unmount } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS]));
    unmount();
    await act(async () => {
      releaseSnapshot();
    });
    expect(result.current.runs).toEqual([]);
  });

  it("a same-uid refresh keeps current rows while loading", async () => {
    deferSnapshots();
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS]));
    await act(async () => {
      releaseSnapshot();
    });
    expect(result.current.runs).toHaveLength(1);

    // Hold the live update, then ask for a new subscription against two rows.
    await act(async () => {
      seedFirestore({ [`${A_RUNS}/a-run-2`]: run() });
    });
    deliveries = [];

    // Pull-to-refresh (same uid): rows stay visible while in flight, so
    // the list doesn't blank out under the user's thumb.
    act(() => result.current.refresh());
    await waitFor(() => expect(pendingSnapshots()).toEqual([A_RUNS]));
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      releaseSnapshot();
    });
    await waitFor(() => expect(result.current.runs).toHaveLength(2));
  });
});

describe("running evidence authority", () => {
  it("the actual lifting recommendation waits through cached and pending snapshots", () => {
    seedFirestore({
      [`${A_RUNS}/a-run`]: {
        ...run(),
        date: "2026-07-14",
        activityType: "tempo",
        completedAt: Timestamp.fromDate(new Date(2026, 6, 14, 12)),
      },
    });
    deferSnapshots();
    const day = {
      exercises: [{ movementCategory: "knee_dominant" }],
    } as WorkoutDay;
    const { result } = renderHook(() =>
      useEasierTodayRecommendation(day, [], false)
    );
    const initial = deliveries[0];
    for (const metadata of [
      { fromCache: true, hasPendingWrites: false },
      { fromCache: false, hasPendingWrites: true },
    ]) {
      act(() => initial.next(Object.assign(initial.snapshot, { metadata })));
      expect(result.current?.recommended).toBe(false);
    }
    act(() => {
      releaseSnapshot();
    });
    expect(result.current?.reason).toContain("hard run yesterday");
  });
  it("displays cached facts but waits for server confirmation before coaching", () => {
    deferSnapshots();
    const { result } = renderHook(() => useRunningStats(30));
    const initial = deliveries[0];
    act(() =>
      initial.next(
        Object.assign(initial.snapshot, {
          metadata: { fromCache: true, hasPendingWrites: false },
        })
      )
    );
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.evidenceReady).toBe(false);
    act(() =>
      initial.next(
        Object.assign(initial.snapshot, {
          metadata: { fromCache: false, hasPendingWrites: true },
        })
      )
    );
    expect(result.current.evidenceReady).toBe(false);
    act(() => {
      releaseSnapshot();
    });
    expect(result.current.evidenceReady).toBe(true);
  });

  it("preserves known rows but withholds advice when refresh fails; retry recovers", async () => {
    const { result } = renderHook(() => useRunningStats(30));
    await waitFor(() => expect(result.current.evidenceReady).toBe(true));
    failNextFirestore("onSnapshot", { path: A_RUNS });
    act(() => result.current.refresh());
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.evidenceReady).toBe(false);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.evidenceReady).toBe(true));
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
