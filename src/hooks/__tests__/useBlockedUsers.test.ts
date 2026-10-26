import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* The hook depends on Firebase + auth context. We mock both at the
 * module boundary so the tests exercise just the cache-and-listener
 * behaviour the hook owns. The cache lives at module scope, which is
 * the contract under test — multiple hook consumers must see the same
 * blocked Set and receive notifications when one of them mutates it. */

const mockGetBlockedUsers = vi.fn();

/* The live list of who blocked the signed-in account. Each subscription
   is recorded so a test can deliver snapshots or fail it. */
interface Subscription {
  uid: string;
  deliver: (ids: string[]) => void;
  fail: (err: unknown) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}
const subscriptions: Subscription[] = [];
const mockSubscribeBlockedBy = vi.fn(
  (
    uid: string,
    onChange: (ids: string[]) => void,
    onError: (err: unknown) => void
  ) => {
    const unsubscribe = vi.fn();
    subscriptions.push({ uid, deliver: onChange, fail: onError, unsubscribe });
    return unsubscribe;
  }
);
const latest = (uid: string) =>
  [...subscriptions].reverse().find((s) => s.uid === uid)!;

vi.mock("../../lib/firebase", () => ({
  db: "mock-db",
  auth: { currentUser: { uid: "user1" } },
}));

vi.mock("../../lib/socialApi", () => ({
  getBlockedUsers: (uid: string) => mockGetBlockedUsers(uid),
  subscribeBlockedBy: (
    uid: string,
    onChange: (ids: string[]) => void,
    onError: (err: unknown) => void
  ) => mockSubscribeBlockedBy(uid, onChange, onError),
}));

let currentAuthUser: { uid: string } | null = { uid: "user1" };
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: currentAuthUser }),
  useUid: () => ({ user: currentAuthUser }).user?.uid ?? null,
}));

vi.mock("../../lib/errorReporting", () => ({
  captureError: vi.fn(),
}));

import { useBlockedUsers } from "../useBlockedUsers";

describe("useBlockedUsers", () => {
  /* The hook holds a module-level cache; using a fresh uid per test
     keeps tests independent without needing to reach in and clear
     internal state. */
  beforeEach(() => {
    mockGetBlockedUsers.mockReset();
    mockGetBlockedUsers.mockResolvedValue([]);
    mockSubscribeBlockedBy.mockClear();
    subscriptions.length = 0;
  });

  it("propagates an addBlocked call to a sibling hook instance synchronously", () => {
    /* Two parallel hook instances simulate the real wiring: ActivityCard
       fires `addBlocked(authorId)` on the block flow; Social.tsx is
       reading from a separate hook instance and must filter the post
       in the next render without waiting for a refresh. */
    currentAuthUser = { uid: "test-propagate" };
    const a = renderHook(() => useBlockedUsers());
    const b = renderHook(() => useBlockedUsers());

    expect(a.result.current.blocked.has("baduser")).toBe(false);
    expect(b.result.current.blocked.has("baduser")).toBe(false);

    act(() => {
      a.result.current.addBlocked("baduser");
    });

    expect(a.result.current.blocked.has("baduser")).toBe(true);
    expect(b.result.current.blocked.has("baduser")).toBe(true);
  });

  it("removes a uid symmetrically when removeBlocked is called", () => {
    currentAuthUser = { uid: "test-remove" };
    const hook = renderHook(() => useBlockedUsers());
    act(() => {
      hook.result.current.addBlocked("baduser");
    });
    expect(hook.result.current.blocked.has("baduser")).toBe(true);

    act(() => {
      hook.result.current.removeBlocked("baduser");
    });
    expect(hook.result.current.blocked.has("baduser")).toBe(false);
  });

  it("isolates cached sets per uid so different signed-in users don't share blocks", () => {
    currentAuthUser = { uid: "test-isolation-a" };
    const a = renderHook(() => useBlockedUsers());
    act(() => {
      a.result.current.addBlocked("X");
    });
    expect(a.result.current.blocked.has("X")).toBe(true);

    currentAuthUser = { uid: "test-isolation-b" };
    const b = renderHook(() => useBlockedUsers());
    expect(b.result.current.blocked.has("X")).toBe(false);
  });

  it("returns an empty set when there is no authenticated user", () => {
    currentAuthUser = null;
    const { result } = renderHook(() => useBlockedUsers());
    expect(result.current.blocked.size).toBe(0);
    /* addBlocked should be a no-op when there's no user — pre-auth
       calls must not poison the cache for whoever signs in next. */
    act(() => {
      result.current.addBlocked("someoneelse");
    });
    expect(result.current.blocked.size).toBe(0);
  });

  /* SOCIAL-PRIVACY-01 — `ready` distinguishes "block list loaded" from
     "no blocks", so Feed/Find reads can defer until the exclude set is
     known and a blocked user's content can't flash on first paint. */
  it("is not ready until the initial fetch settles, then ready", async () => {
    currentAuthUser = { uid: "test-ready-resolve" };
    let resolveFetch: (ids: string[]) => void = () => {};
    mockGetBlockedUsers.mockImplementation(
      () => new Promise<string[]>((res) => (resolveFetch = res))
    );

    const { result } = renderHook(() => useBlockedUsers());
    // Fetch in flight — NOT ready (empty set here means "unknown").
    expect(result.current.ready).toBe(false);
    act(() => latest("test-ready-resolve").deliver([]));

    await act(async () => {
      resolveFetch(["blocked-1"]);
      await Promise.resolve();
    });
    expect(result.current.ready).toBe(true);
    expect(result.current.blocked.has("blocked-1")).toBe(true);
  });

  it("becomes ready (fail-open) even if the block-list fetch rejects", async () => {
    currentAuthUser = { uid: "test-ready-reject" };
    let rejectFetch: (e: Error) => void = () => {};
    mockGetBlockedUsers.mockImplementation(
      () => new Promise<string[]>((_res, rej) => (rejectFetch = rej))
    );

    const { result } = renderHook(() => useBlockedUsers());
    expect(result.current.ready).toBe(false);
    act(() => latest("test-ready-reject").deliver([]));

    await act(async () => {
      rejectFetch(new Error("network"));
      await Promise.resolve();
    });
    // Fail-open: a transient error must not wedge the feed forever.
    expect(result.current.ready).toBe(true);
    expect(result.current.blocked.size).toBe(0);
  });

  it("has no user → not ready (nothing to gate)", () => {
    currentAuthUser = null;
    const { result } = renderHook(() => useBlockedUsers());
    expect(result.current.ready).toBe(false);
  });
});

/* Polish3 call 1: blocking hides each person from the other. `blocked`
   holds both directions, `youBlocked` and `blockedYou` each one. */
describe("useBlockedUsers — both directions", () => {
  beforeEach(() => {
    mockGetBlockedUsers.mockReset();
    mockGetBlockedUsers.mockResolvedValue([]);
    mockSubscribeBlockedBy.mockClear();
    subscriptions.length = 0;
  });

  const settle = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("hides the people who blocked you as well as the people you blocked", async () => {
    currentAuthUser = { uid: "both-merge" };
    mockGetBlockedUsers.mockResolvedValue(["you-blocked"]);
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-merge").deliver(["blocked-you"]));

    expect([...result.current.blocked].sort()).toEqual([
      "blocked-you",
      "you-blocked",
    ]);
    expect([...result.current.youBlocked]).toEqual(["you-blocked"]);
    expect([...result.current.blockedYou]).toEqual(["blocked-you"]);
    expect(mockSubscribeBlockedBy).toHaveBeenCalledWith(
      "both-merge",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("is not ready until who blocked you is known too", async () => {
    currentAuthUser = { uid: "both-ready" };
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    // Your own list has loaded; theirs has not.
    expect(result.current.ready).toBe(false);
    act(() => latest("both-ready").deliver([]));
    expect(result.current.ready).toBe(true);
  });

  it("follows a block made while you are using the app, and its lifting", async () => {
    currentAuthUser = { uid: "both-live" };
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-live").deliver([]));
    expect(result.current.blocked.has("later")).toBe(false);

    act(() => latest("both-live").deliver(["later"]));
    expect(result.current.blocked.has("later")).toBe(true);

    act(() => latest("both-live").deliver([]));
    expect(result.current.blocked.has("later")).toBe(false);
  });

  it("keeps someone hidden after you unblock them while they still block you", async () => {
    currentAuthUser = { uid: "both-mutual" };
    mockGetBlockedUsers.mockResolvedValue(["mutual"]);
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-mutual").deliver(["mutual"]));

    act(() => result.current.removeBlocked("mutual"));
    expect(result.current.youBlocked.has("mutual")).toBe(false);
    expect(result.current.blockedYou.has("mutual")).toBe(true);
    expect(result.current.blocked.has("mutual")).toBe(true);
  });

  it("is ready, with your own blocks still hidden, when the listener fails", async () => {
    currentAuthUser = { uid: "both-fail" };
    mockGetBlockedUsers.mockResolvedValue(["you-blocked"]);
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-fail").fail(new Error("permission-denied")));

    expect(result.current.ready).toBe(true);
    expect([...result.current.blocked]).toEqual(["you-blocked"]);
  });

  it("shares one listener between consumers and stops it when the last goes", async () => {
    currentAuthUser = { uid: "both-shared" };
    const a = renderHook(() => useBlockedUsers());
    const b = renderHook(() => useBlockedUsers());
    await settle();
    expect(subscriptions.filter((s) => s.uid === "both-shared")).toHaveLength(
      1
    );
    const sub = latest("both-shared");

    a.unmount();
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    b.unmount();
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("hands out the same set until it changes, so feed hooks do not refetch", async () => {
    currentAuthUser = { uid: "both-stable" };
    const { result, rerender } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-stable").deliver(["someone"]));
    const first = result.current.blocked;
    rerender();
    expect(result.current.blocked).toBe(first);

    act(() => latest("both-stable").deliver(["someone", "another"]));
    expect(result.current.blocked).not.toBe(first);
  });

  it("never hides you from yourself", async () => {
    currentAuthUser = { uid: "both-self" };
    mockGetBlockedUsers.mockResolvedValue(["both-self"]);
    const { result } = renderHook(() => useBlockedUsers());
    await settle();
    act(() => latest("both-self").deliver(["both-self"]));
    expect(result.current.blocked.has("both-self")).toBe(false);
  });
});
