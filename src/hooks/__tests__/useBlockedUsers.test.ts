import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* The hook depends on Firebase + auth context. We mock both at the
 * module boundary so the tests exercise just the cache-and-listener
 * behaviour the hook owns. The cache lives at module scope, which is
 * the contract under test — multiple hook consumers must see the same
 * blocked Set and receive notifications when one of them mutates it. */

const mockGetBlockedUsers = vi.fn();

vi.mock("../../lib/firebase", () => ({
  db: "mock-db",
  auth: { currentUser: { uid: "user1" } },
}));

vi.mock("../../lib/socialApi", () => ({
  getBlockedUsers: (uid: string) => mockGetBlockedUsers(uid),
}));

let currentAuthUser: { uid: string } | null = { uid: "user1" };
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: currentAuthUser }),
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
});
