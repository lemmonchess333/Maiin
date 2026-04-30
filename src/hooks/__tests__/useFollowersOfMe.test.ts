import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* Same harness pattern as useBlockedUsers.test.ts. The hook owns a
 * module-level cache + listener registry and we want to exercise the
 * cross-instance notification behaviour without standing up a real
 * Firebase. */

const mockGetFollowerIds = vi.fn();

vi.mock("../../lib/firebase", () => ({
  db: "mock-db",
  auth: { currentUser: { uid: "user1" } },
}));

vi.mock("../../lib/socialApi", () => ({
  getFollowerIds: (uid: string) => mockGetFollowerIds(uid),
}));

let currentAuthUser: { uid: string } | null = { uid: "user1" };
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: currentAuthUser }),
}));

vi.mock("../../lib/errorReporting", () => ({
  captureError: vi.fn(),
}));

import { useFollowersOfMe } from "../useFollowersOfMe";

describe("useFollowersOfMe", () => {
  beforeEach(() => {
    mockGetFollowerIds.mockReset();
    mockGetFollowerIds.mockResolvedValue(new Set<string>());
  });

  it("propagates an addFollower call to a sibling hook instance synchronously", () => {
    /* Two parallel instances simulate the real wiring: a profile page
       might addFollower(uid) when a follow-back happens; suggested-
       people row needs to flip its "Follows you" badge in the same
       render pass without waiting for a refetch. */
    currentAuthUser = { uid: "test-propagate" };
    const a = renderHook(() => useFollowersOfMe());
    const b = renderHook(() => useFollowersOfMe());

    expect(a.result.current.followers.has("alice")).toBe(false);
    expect(b.result.current.followers.has("alice")).toBe(false);

    act(() => {
      a.result.current.addFollower("alice");
    });

    expect(a.result.current.followers.has("alice")).toBe(true);
    expect(b.result.current.followers.has("alice")).toBe(true);
  });

  it("removes a uid symmetrically", () => {
    currentAuthUser = { uid: "test-remove" };
    const hook = renderHook(() => useFollowersOfMe());

    act(() => hook.result.current.addFollower("alice"));
    expect(hook.result.current.followers.has("alice")).toBe(true);

    act(() => hook.result.current.removeFollower("alice"));
    expect(hook.result.current.followers.has("alice")).toBe(false);
  });

  it("isolates cached sets per uid (different signed-in users don't share followers)", () => {
    currentAuthUser = { uid: "test-isolation-a" };
    const a = renderHook(() => useFollowersOfMe());
    act(() => a.result.current.addFollower("alice"));

    currentAuthUser = { uid: "test-isolation-b" };
    const b = renderHook(() => useFollowersOfMe());
    expect(b.result.current.followers.has("alice")).toBe(false);
  });

  it("returns an empty set when there's no authenticated user", () => {
    currentAuthUser = null;
    const { result } = renderHook(() => useFollowersOfMe());
    expect(result.current.followers.size).toBe(0);

    /* addFollower no-ops without a user — pre-auth calls must not
       poison the cache for whoever signs in next. */
    act(() => result.current.addFollower("alice"));
    expect(result.current.followers.size).toBe(0);
  });
});
