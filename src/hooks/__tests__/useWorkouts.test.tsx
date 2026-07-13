// @vitest-environment jsdom
/**
 * useWorkouts coverage contract (packet 16). Pins that the default "recent"
 * listener stays bounded to 50, that "complete" subscribes to every workout
 * (the lifetime-history surfaces), and that an account switch can't let a late
 * account-A snapshot repopulate account B.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const H = vi.hoisted(() => ({
  authUser: { uid: "A" } as { uid: string } | null,
  snapCalls: [] as Array<{
    constraints: unknown[];
    onNext: (s: unknown) => void;
    onErr: (e: unknown) => void;
    unsub: ReturnType<typeof vi.fn>;
  }>,
  noteActivity: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: H.authUser, profile: {} }),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/activationTracker", () => ({
  noteActivitySnapshot: (...a: unknown[]) => H.noteActivity(...a),
}));
vi.mock("@/lib/exercises", () => ({ estimateCalories: () => 0 }));
vi.mock("@/lib/workoutBurn", () => ({ estimateLiftBurn: () => 0 }));
vi.mock("@/lib/offlineQueue", () => ({ safeMerge: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/dateHelpers", () => ({ localDateString: () => "2026-01-01" }));

vi.mock("firebase/firestore", () => ({
  collection: (...a: unknown[]) => ({ _path: a.join("/") }),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  query: (_ref: unknown, ...constraints: unknown[]) => ({ constraints }),
  orderBy: (field: string, dir: string) => ({ type: "orderBy", field, dir }),
  limit: (n: number) => ({ type: "limit", n }),
  onSnapshot: (
    q: { constraints: unknown[] },
    onNext: (s: unknown) => void,
    onErr: (e: unknown) => void
  ) => {
    const unsub = vi.fn();
    H.snapCalls.push({ constraints: q.constraints, onNext, onErr, unsub });
    return unsub;
  },
  Timestamp: { now: () => ({}) },
}));

import { useWorkouts } from "../useWorkouts";

const snap = (ids: string[], extra: (i: number) => object = () => ({})) => ({
  docs: ids.map((id, i) => ({
    id,
    data: () => ({
      date: "2026-01-0" + ((i % 9) + 1),
      exercises: [],
      ...extra(i),
    }),
  })),
});
const last = () => H.snapCalls[H.snapCalls.length - 1];
const hasLimit = (c: unknown[]) =>
  c.some((x) => (x as { type?: string }).type === "limit");

beforeEach(() => {
  H.authUser = { uid: "A" };
  H.snapCalls = [];
  H.noteActivity = vi.fn();
});

describe("useWorkouts coverage", () => {
  it("recent (default) queries orderBy date desc + limit(50)", () => {
    renderHook(() => useWorkouts());
    const c = last().constraints;
    expect(c).toContainEqual({ type: "orderBy", field: "date", dir: "desc" });
    expect(c).toContainEqual({ type: "limit", n: 50 });
  });

  it("complete queries orderBy date desc and NO limit", () => {
    renderHook(() => useWorkouts({ coverage: "complete" }));
    const c = last().constraints;
    expect(c).toContainEqual({ type: "orderBy", field: "date", dir: "desc" });
    expect(hasLimit(c)).toBe(false);
  });

  it("complete returns all 51 documents, including the oldest", () => {
    const { result } = renderHook(() => useWorkouts({ coverage: "complete" }));
    const ids = Array.from({ length: 51 }, (_, i) => "w" + i);
    act(() => last().onNext(snap(ids)));
    expect(result.current.workouts).toHaveLength(51);
    expect(result.current.workouts[50].id).toBe("w50");
  });

  it("filters out docs with a missing date or non-array exercises", () => {
    const { result } = renderHook(() => useWorkouts());
    act(() =>
      last().onNext({
        docs: [
          { id: "ok", data: () => ({ date: "2026-01-01", exercises: [] }) },
          { id: "nodate", data: () => ({ exercises: [] }) },
          { id: "badex", data: () => ({ date: "2026-01-01", exercises: 5 }) },
        ],
      })
    );
    expect(result.current.workouts.map((w) => w.id)).toEqual(["ok"]);
  });

  it("switching recent → complete unsubscribes and makes one new subscription", () => {
    const { rerender } = renderHook(
      ({ coverage }: { coverage?: "recent" | "complete" }) =>
        useWorkouts({ coverage }),
      { initialProps: { coverage: "recent" as "recent" | "complete" } }
    );
    const first = last();
    rerender({ coverage: "complete" });
    expect(first.unsub).toHaveBeenCalled();
    expect(hasLimit(last().constraints)).toBe(false);
  });

  it("recent notes activity; complete does not", () => {
    const recent = renderHook(() => useWorkouts());
    act(() => last().onNext(snap(["a"])));
    expect(H.noteActivity).toHaveBeenCalledTimes(1);

    H.noteActivity.mockClear();
    recent.unmount();
    renderHook(() => useWorkouts({ coverage: "complete" }));
    act(() => last().onNext(snap(["b"])));
    expect(H.noteActivity).not.toHaveBeenCalled();
  });

  it("no user clears, loading false, and creates no listener", () => {
    H.authUser = null;
    const { result } = renderHook(() => useWorkouts());
    expect(result.current.workouts).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(H.snapCalls).toHaveLength(0);
  });

  it("a late account-A snapshot cannot repopulate after switching to B", () => {
    const { result, rerender } = renderHook(() => useWorkouts());
    const aCall = last();
    // Switch to B before A's snapshot fires.
    H.authUser = { uid: "B" };
    rerender();
    const bCall = last();
    act(() => bCall.onNext(snap(["b1"])));
    // The stale A callback arrives late — must be ignored.
    act(() => aCall.onNext(snap(["a1", "a2"])));
    expect(result.current.workouts.map((w) => w.id)).toEqual(["b1"]);
  });
});
