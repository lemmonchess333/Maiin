import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * A feed copy outlives its post for a moment after the post is deleted
 * (Undo on the finish screen, or deleting a shared session), and copies of
 * posts removed before the server trigger existed stay for good. The
 * Following feed draws only copies whose post it could read.
 */

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
  useUid: () => "me",
}));

function feedItem(id: string) {
  return {
    id,
    activityId: id,
    authorId: "friend",
    authorName: "Friend",
    type: "workout",
    summary: "Push day",
    createdAt: null,
  };
}

vi.mock("../../lib/socialApi", () => ({
  getFeed: vi.fn(async () => ({
    items: [feedItem("live"), feedItem("removed")],
    lastDoc: undefined,
  })),
  // The removed post is left out, as a missing or refused read is.
  fetchActivitiesByIds: vi.fn(async () => ({
    live: { id: "live", authorId: "friend", type: "workout" },
  })),
  batchGetKudos: vi.fn(async () => ({})),
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { useSocialFeed } from "../useSocialFeed";

describe("useSocialFeed — a copy whose post is gone", () => {
  it("draws the copies it could read the post for, and not the others", async () => {
    const { result } = renderHook(() => useSocialFeed(false, new Set(), true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Anchored on the live post, so the absence below is not the empty
    // feed of a load that has not landed.
    expect(result.current.items.map((i) => i.activityId)).toEqual(["live"]);
    expect(result.current.error).toBeNull();
  });
});
