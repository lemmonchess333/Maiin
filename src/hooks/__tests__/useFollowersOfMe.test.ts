import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

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
  useUid: () => ({ user: currentAuthUser }).user?.uid ?? null,
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

  /* Two tests retired here drove the shared Set through `addFollower` /
     `removeFollower`. Those mutators were speculative: the hook's own note
     said they served "a follow-back from another device" — a remote event
     with no listener — or "a UI surface that knows the change happened",
     and no surface can know that someone else followed the signed-in user.
     Nothing outside the hook ever called them. The property they
     exercised, one cache notifying sibling instances, is the same
     mechanism `useBlockedUsers` uses, where a consumer genuinely mutates
     it; coverage of that shape lives with the hook that has a caller. */
  it("isolates cached sets per uid (different signed-in users don't share followers)", async () => {
    /* Seeded through the fetch — the only path that fills the cache now
       that the imperative mutators are gone. Alice follows user A only. */
    mockGetFollowerIds.mockImplementation(
      async (uid: string) =>
        new Set<string>(uid === "test-isolation-a" ? ["alice"] : [])
    );
    currentAuthUser = { uid: "test-isolation-a" };
    const a = renderHook(() => useFollowersOfMe());
    await waitFor(() =>
      expect(a.result.current.followers.has("alice")).toBe(true)
    );

    currentAuthUser = { uid: "test-isolation-b" };
    const b = renderHook(() => useFollowersOfMe());
    await waitFor(() =>
      expect(mockGetFollowerIds).toHaveBeenCalledWith("test-isolation-b")
    );
    expect(b.result.current.followers.has("alice")).toBe(false);
  });

  it("returns an empty set when there's no authenticated user", () => {
    currentAuthUser = null;
    const { result } = renderHook(() => useFollowersOfMe());
    expect(result.current.followers.size).toBe(0);
  });
});
