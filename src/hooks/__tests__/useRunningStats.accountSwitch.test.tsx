/**
 * useRunningStats — account-switch request safety.
 *
 * Proves the run-history read is cancelable by effect generation and always
 * settles `loading`, so on a shared device account A's in-flight query can't
 * overwrite B's data, and a failed read doesn't load forever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Controllable auth user.
let currentUser: { uid: string } | null = { uid: "A" };
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

// Deferred getDocs so we control resolution order.
type Deferred = {
  promise: Promise<{ docs: unknown[] }>;
  resolve: (docs: unknown[]) => void;
  reject: (e: unknown) => void;
};
function defer(): Deferred {
  let resolve!: (docs: unknown[]) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<{ docs: unknown[] }>((res, rej) => {
    resolve = (docs) => res({ docs });
    reject = rej;
  });
  return { promise, resolve, reject };
}

let pending: Deferred[] = [];
const logError = vi.fn();
vi.mock("../../lib/logger", () => ({
  logger: { error: (...a: unknown[]) => logError(...a) },
}));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  getDocs: () => {
    const d = defer();
    pending.push(d);
    return d.promise;
  },
  // Must be a class so the hook's `x instanceof Timestamp` check is callable.
  Timestamp: class {
    static fromDate(d: Date) {
      return d;
    }
  },
}));
vi.mock("../../lib/firebase", () => ({ db: {} }));

import { useRunningStats } from "../useRunningStats";

const runDoc = (id: string) => ({
  id,
  data: () => ({
    distance: 5000,
    duration: 1500,
    avgPace: 300,
    completedAt: new Date("2026-07-10T10:00:00Z"),
    activityType: "freerun",
  }),
});

beforeEach(() => {
  currentUser = { uid: "A" };
  pending = [];
  logError.mockClear();
});
afterEach(() => vi.clearAllMocks());

describe("useRunningStats — account switch", () => {
  it("B's later data wins even when A resolves last", async () => {
    const { result, rerender } = renderHook(() => useRunningStats(30));
    // A's request is pending (pending[0]).
    expect(pending).toHaveLength(1);

    // Switch to B — a new request starts (pending[1]).
    currentUser = { uid: "B" };
    rerender();
    await waitFor(() => expect(pending.length).toBe(2));

    // Resolve B first, then A (out of order).
    await act(async () => {
      pending[1].resolve([runDoc("b-run")]);
    });
    await act(async () => {
      pending[0].resolve([runDoc("a-run")]);
    });

    // B's data must remain — A's stale resolution is dropped.
    expect(result.current.runs.map((r) => r.id)).toEqual(["b-run"]);
  });

  it("clears A's rows immediately on switch to B", async () => {
    const { result, rerender } = renderHook(() => useRunningStats(30));
    await act(async () => {
      pending[0].resolve([runDoc("a-run")]);
    });
    expect(result.current.runs).toHaveLength(1);

    currentUser = { uid: "B" };
    rerender();
    // Before B resolves, A's rows are gone.
    expect(result.current.runs).toHaveLength(0);
    expect(result.current.loading).toBe(true);
  });

  it("a rejected read settles loading=false, empties, and logs once", async () => {
    const { result } = renderHook(() => useRunningStats(30));
    await act(async () => {
      pending[0].reject(new Error("network"));
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runs).toEqual([]);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels the outstanding resolution (no state update)", async () => {
    const { result, unmount } = renderHook(() => useRunningStats(30));
    unmount();
    await act(async () => {
      pending[0].resolve([runDoc("a-run")]);
    });
    // Component unmounted before resolve — runs never populate.
    expect(result.current.runs).toEqual([]);
  });

  it("a same-uid refresh keeps current rows while loading", async () => {
    const { result } = renderHook(() => useRunningStats(30));
    await act(async () => {
      pending[0].resolve([runDoc("a-run")]);
    });
    expect(result.current.runs).toHaveLength(1);

    // Pull-to-refresh (same uid).
    act(() => result.current.refresh());
    await waitFor(() => expect(pending.length).toBe(2));
    // Rows stay visible while the refresh is in flight.
    expect(result.current.runs).toHaveLength(1);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      pending[1].resolve([runDoc("a-run"), runDoc("a-run-2")]);
    });
    expect(result.current.runs).toHaveLength(2);
  });
});
