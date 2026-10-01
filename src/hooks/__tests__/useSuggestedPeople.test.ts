/**
 * useSuggestedPeople — the Find tab's "Suggested people" list.
 *
 * `getSuggestedPeople` is replaced by a queue of promises the test settles
 * by hand (the same seam `useSocialFeed.ownership.test.tsx` uses for
 * `getFeed`), so a test can choose which account's answer lands, and when.
 *
 * Pinned: the lazy gate (nothing is fetched while the tab is closed), the
 * reopen reset (no stale list flashes), a same-account refetch keeping the
 * list on screen, and account ownership — another account's suggestions
 * are never shown, whether the switch happens while the next account's list
 * is loading or the previous account's list answers late. Each absence is
 * asserted after a positive has landed, so none can pass from the initial
 * empty state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const H = vi.hoisted(() => ({
  uid: "A" as string | null,
  calls: [] as {
    uid: string;
    resolve: (people: { uid: string; displayName: string }[]) => void;
    reject: (err: unknown) => void;
  }[],
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: H.uid ? { uid: H.uid } : null }),
  useUid: () => H.uid,
}));
vi.mock("@/lib/socialApi", () => ({
  getSuggestedPeople: vi.fn(
    (uid: string) =>
      new Promise((resolve, reject) => {
        H.calls.push({ uid, resolve, reject });
      })
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import { useSuggestedPeople } from "../useSuggestedPeople";

const person = (uid: string) => ({ uid, displayName: uid.toUpperCase() });
const uids = (people: { uid: string }[]) => people.map((p) => p.uid);

/** Settle the `index`-th fetch (issue order) with `people`. */
async function answer(index: number, people: { uid: string }[]) {
  const call = H.calls[index];
  expect(call).toBeDefined();
  await act(async () => {
    call.resolve(people.map((p) => person(p.uid)));
  });
}

const BLOCKED = new Set<string>();
const JOINED: string[] = [];

beforeEach(() => {
  H.uid = "A";
  H.calls = [];
  vi.clearAllMocks();
});

describe("useSuggestedPeople", () => {
  it("fetches nothing while the tab is closed", () => {
    const { result } = renderHook(() =>
      useSuggestedPeople(false, BLOCKED, JOINED)
    );
    expect(H.calls).toHaveLength(0);
    expect(result.current.loading).toBe(false);
  });

  it("is loading until the list lands, then shows it", async () => {
    const { result } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    expect(result.current.loading).toBe(true);
    expect(H.calls.map((c) => c.uid)).toEqual(["A"]);

    await answer(0, [person("p1"), person("p2")]);
    expect(uids(result.current.people)).toEqual(["p1", "p2"]);
    expect(result.current.loading).toBe(false);
  });

  it("a failed fetch settles to an empty, finished list", async () => {
    const { result } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    await act(async () => {
      H.calls[0].reject(new Error("offline"));
    });
    expect(result.current.people).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("refresh keeps the list on screen while it refetches", async () => {
    const { result } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    await answer(0, [person("p1")]);

    act(() => result.current.refresh());
    expect(H.calls).toHaveLength(2);
    expect(uids(result.current.people)).toEqual(["p1"]);
    expect(result.current.loading).toBe(true);

    await answer(1, [person("p3")]);
    expect(uids(result.current.people)).toEqual(["p3"]);
    expect(result.current.loading).toBe(false);
  });

  it("reopening the tab starts from empty rather than flashing the old list", async () => {
    const { result, rerender } = renderHook(
      ({ active }) => useSuggestedPeople(active, BLOCKED, JOINED),
      { initialProps: { active: true } }
    );
    await answer(0, [person("p1")]);

    rerender({ active: false });
    rerender({ active: true });
    expect(result.current.people).toEqual([]);
    expect(result.current.loading).toBe(true);

    await answer(1, [person("p2")]);
    expect(uids(result.current.people)).toEqual(["p2"]);
  });

  it("a rebuilt list of the same joined spaces is the same request", async () => {
    // People derives these ids from the directory, which handed it a new
    // array on every render. Compared by reference, every answer looked
    // stale, re-rendered, and started another fetch: a read loop for as
    // long as People was open, with the spinner never stopping.
    const { result, rerender } = renderHook(
      ({ joined }) => useSuggestedPeople(true, BLOCKED, joined),
      { initialProps: { joined: ["runners"] } }
    );
    await answer(0, [person("p1")]);
    expect(result.current.loading).toBe(false);

    rerender({ joined: ["runners"] });
    expect(H.calls).toHaveLength(1);
    expect(result.current.loading).toBe(false);
    expect(uids(result.current.people)).toEqual(["p1"]);
  });

  it("joining another space asks again", async () => {
    const { result, rerender } = renderHook(
      ({ joined }) => useSuggestedPeople(true, BLOCKED, joined),
      { initialProps: { joined: ["runners"] } }
    );
    await answer(0, [person("p1")]);

    rerender({ joined: ["runners", "lifters"] });
    expect(H.calls).toHaveLength(2);
    expect(result.current.loading).toBe(true);
    await answer(1, [person("p2")]);
    expect(uids(result.current.people)).toEqual(["p2"]);
    expect(result.current.loading).toBe(false);
  });

  it("remove drops a person at once", async () => {
    const { result } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    await answer(0, [person("p1"), person("p2")]);

    act(() => result.current.remove("p1"));
    expect(uids(result.current.people)).toEqual(["p2"]);
    expect(result.current.loading).toBe(false);
  });
});

describe("useSuggestedPeople — account ownership", () => {
  it("never shows account A's suggestions to account B while B's list loads", async () => {
    const { result, rerender } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    await answer(0, [person("friend-of-a")]);
    expect(uids(result.current.people)).toEqual(["friend-of-a"]);

    H.uid = "B";
    rerender();
    expect(H.calls.map((c) => c.uid)).toEqual(["A", "B"]);
    expect(result.current.people).toEqual([]);
    expect(result.current.loading).toBe(true);

    await answer(1, [person("friend-of-b")]);
    expect(uids(result.current.people)).toEqual(["friend-of-b"]);
  });

  it("A's list answering late never replaces B's", async () => {
    const { result, rerender } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    H.uid = "B";
    rerender();
    expect(H.calls.map((c) => c.uid)).toEqual(["A", "B"]);

    // B answers first, then A answers LATE — the leak interleaving.
    await answer(1, [person("friend-of-b")]);
    expect(uids(result.current.people)).toEqual(["friend-of-b"]);
    await answer(0, [person("friend-of-a")]);
    expect(uids(result.current.people)).toEqual(["friend-of-b"]);
    expect(result.current.loading).toBe(false);
  });

  it("shows nothing once signed out", async () => {
    const { result, rerender } = renderHook(() =>
      useSuggestedPeople(true, BLOCKED, JOINED)
    );
    await answer(0, [person("friend-of-a")]);
    expect(uids(result.current.people)).toEqual(["friend-of-a"]);

    H.uid = null;
    rerender();
    expect(result.current.people).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
