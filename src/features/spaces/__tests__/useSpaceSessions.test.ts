/**
 * A Space's members' sessions (Run27 call 11), as the page reads them: the
 * server's rows for the Space, newest first, and each post read on its own.
 *
 * What these pin, against the Firestore fake:
 *   - only a post that is still public shows: a followers-only or private
 *     post with a row left behind does not;
 *   - someone blocked, either way, does not show, and a post the rules
 *     refuse across a block is left out without failing the page;
 *   - a post the viewer hid does not show;
 *   - a public post with no row (a restricted author's: the server keeps
 *     none, functions/lib/spaceFeed.js) does not show, since the page reads
 *     the rows and never lists posts itself;
 *   - nothing is read before the Sessions tab opens or before the block
 *     list is known; pages follow with Load more.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

const H = vi.hoisted(() => ({
  blocked: new Set<string>(),
  ready: true,
  hidden: new Set<string>(),
  toastError: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "viewer" }));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({ blocked: H.blocked, ready: H.ready }),
}));
vi.mock("@/hooks/useHiddenActivities", () => ({
  useHiddenActivities: () => ({ hidden: H.hidden }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => H.toastError(...a) },
}));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

import {
  SPACE_SESSIONS_PAGE_SIZE,
  useSpaceSessions,
} from "../useSpaceSessions";
import {
  failNextFirestore,
  readLog,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const SPACE = "runners";
const BASE = Date.now();
/** `minutes` before the clock, so the order is fixed and today's. */
const at = (minutes: number) => Timestamp.fromMillis(BASE - minutes * 60_000);

function post(
  id: string,
  authorId: string,
  minutes: number,
  visibility = "public"
) {
  return {
    [`activities/${id}`]: {
      authorId,
      authorName: authorId,
      type: "run",
      visibility,
      distance: 5000,
      kudosCount: 0,
      commentCount: 0,
      createdAt: at(minutes),
    },
  };
}
function row(id: string, authorId: string, minutes: number) {
  return {
    [`spaces/${SPACE}/sessions/${id}`]: {
      activityId: id,
      authorId,
      createdAt: at(minutes),
    },
  };
}
/** A public post with its row, as the server writes them. */
const shared = (id: string, authorId: string, minutes: number) => ({
  ...post(id, authorId, minutes),
  ...row(id, authorId, minutes),
});

const ids = (items: { activityId: string }[] | null) =>
  items?.map((i) => i.activityId) ?? null;

beforeEach(() => {
  resetFirestore();
  H.blocked = new Set();
  H.ready = true;
  H.hidden = new Set();
  H.toastError.mockReset();
});

afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
});

describe("what a Space's sessions show", () => {
  it("shows its members' public sessions, newest first", async () => {
    seedFirestore({
      ...shared("older", "ana", 60),
      ...shared("newer", "ben", 5),
    });
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(ids(result.current.items)).toEqual(["newer", "older"]);
    expect(result.current.items?.[0].authorId).toBe("ben");
  });

  it("leaves out a followers-only post and a private one, even with a row left behind", async () => {
    seedFirestore({
      ...shared("public", "ana", 30),
      ...post("followers", "ana", 20, "followers"),
      ...row("followers", "ana", 20),
      ...post("private", "ana", 10, "private"),
      ...row("private", "ana", 10),
    });
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(ids(result.current.items)).toEqual(["public"]);
  });

  it("leaves out someone blocked either way, and a post the rules refuse across a block", async () => {
    seedFirestore({
      ...shared("anas", "ana", 30),
      // Carl blocked the viewer or the viewer blocked Carl: the merged list.
      ...shared("carls", "carl", 20),
      // Dan's block is not in the list yet; the rules refuse the read.
      ...shared("dans", "dan", 10),
    });
    H.blocked = new Set(["carl"]);
    failNextFirestore("getDoc", {
      path: "activities/dans",
      code: "permission-denied",
    });
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(ids(result.current.items)).toEqual(["anas"]);
    expect(result.current.failed).toBe(false);
  });

  it("drops someone the viewer blocks while the list is open", async () => {
    seedFirestore({
      ...shared("anas", "ana", 30),
      ...shared("bens", "ben", 5),
    });
    const { result, rerender } = renderHook(() =>
      useSpaceSessions(SPACE, true)
    );
    await waitFor(() =>
      expect(ids(result.current.items)).toEqual(["bens", "anas"])
    );
    H.blocked = new Set(["ben"]);
    rerender();
    expect(ids(result.current.items)).toEqual(["anas"]);
  });

  it("leaves out a post the viewer hid", async () => {
    seedFirestore({
      ...shared("anas", "ana", 30),
      ...shared("bens", "ben", 5),
    });
    H.hidden = new Set(["bens"]);
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(ids(result.current.items)).toEqual(["anas"]);
  });

  it("shows no public post the server gave no row: a restricted author's", async () => {
    seedFirestore({
      ...shared("anas", "ana", 30),
      // Public, but restricted: the server keeps no row for it.
      ...post("restricted", "res", 5),
    });
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(ids(result.current.items)).toEqual(["anas"]);
    // The page never lists posts; it reads the Space's rows.
    expect(
      readLog().some((r) => r.op === "getDocs" && r.path === "activities")
    ).toBe(false);
  });
});

describe("when it reads", () => {
  it("reads nothing until the Sessions tab opens", async () => {
    seedFirestore(shared("anas", "ana", 30));
    const { result, rerender } = renderHook(
      ({ on }) => useSpaceSessions(SPACE, on),
      { initialProps: { on: false } }
    );
    await act(async () => {});
    expect(result.current.items).toBeNull();
    expect(readLog()).toEqual([]);
    rerender({ on: true });
    await waitFor(() => expect(ids(result.current.items)).toEqual(["anas"]));
  });

  it("waits for the block list before reading", async () => {
    seedFirestore(shared("anas", "ana", 30));
    H.ready = false;
    const { result, rerender } = renderHook(() =>
      useSpaceSessions(SPACE, true)
    );
    await act(async () => {});
    expect(readLog()).toEqual([]);
    H.ready = true;
    rerender();
    await waitFor(() => expect(ids(result.current.items)).toEqual(["anas"]));
  });

  it("reads a page at a time, and Load more appends the next", async () => {
    const seed: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i <= SPACE_SESSIONS_PAGE_SIZE; i++)
      Object.assign(seed, shared(`p${String(i).padStart(2, "0")}`, "ana", i));
    seedFirestore(seed);
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.items).not.toBeNull());
    expect(result.current.items).toHaveLength(SPACE_SESSIONS_PAGE_SIZE);
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.items).toHaveLength(SPACE_SESSIONS_PAGE_SIZE + 1)
    );
    expect(result.current.hasMore).toBe(false);
    // The oldest comes last.
    expect(result.current.items?.at(-1)?.activityId).toBe(
      `p${SPACE_SESSIONS_PAGE_SIZE}`
    );
  });

  it("says so when the first page cannot be read, and tries again", async () => {
    seedFirestore(shared("anas", "ana", 30));
    failNextFirestore("getDocs", { path: `spaces/${SPACE}/sessions` });
    const { result } = renderHook(() => useSpaceSessions(SPACE, true));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.items).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(ids(result.current.items)).toEqual(["anas"]));
    expect(result.current.failed).toBe(false);
  });
});
