import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * SOCIAL-PRIVACY-01 — uid + generation ownership. A feed fetch captured
 * under account A must not commit its items after a switch to account B
 * (shared browser / account switch mid-fetch).
 */

const authUser = vi.hoisted(() => ({
  current: { uid: "A" } as { uid: string } | null,
}));
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: authUser.current }),
  useUid: () => ({ user: authUser.current }).user?.uid ?? null,
}));

// getFeed returns a promise we resolve by hand so we can switch accounts
// while a fetch is in flight.
const getFeedDeferred = vi.hoisted(
  () =>
    ({ resolve: null }) as {
      resolve: ((v: { items: unknown[]; lastDoc: undefined }) => void) | null;
    }
);
vi.mock("../../lib/socialApi", () => ({
  getFeed: vi.fn(
    () =>
      new Promise((res) => {
        getFeedDeferred.resolve = res;
      })
  ),
  fetchActivitiesByIds: vi.fn(async () => ({})),
  batchGetKudos: vi.fn(async () => ({})),
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { useSocialFeed } from "../useSocialFeed";

function feedItem(id: string, authorId: string) {
  return {
    id,
    activityId: id,
    authorId,
    authorName: "x",
    type: "workout",
    summary: "",
    createdAt: null,
  };
}

describe("useSocialFeed — uid/generation ownership", () => {
  beforeEach(() => {
    authUser.current = { uid: "A" };
    getFeedDeferred.resolve = null;
  });

  it("drops a fetch resolved under account A after a switch to account B", async () => {
    const { result, rerender } = renderHook(() =>
      useSocialFeed(false, new Set(), true)
    );

    // A's fetch is in flight.
    await waitFor(() => expect(getFeedDeferred.resolve).not.toBeNull());
    const resolveA = getFeedDeferred.resolve!;

    // Switch to account B before A's fetch resolves — bumps the generation.
    getFeedDeferred.resolve = null;
    authUser.current = { uid: "B" };
    rerender();

    // Now resolve A's stale fetch. Its items must NOT commit under B.
    await act(async () => {
      resolveA({ items: [feedItem("a1", "A")], lastDoc: undefined });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.items).toEqual([]);
  });
});
