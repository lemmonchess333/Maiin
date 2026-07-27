import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  allPaths,
  writeLog,
  failNextFirestore,
} from "@/test/firestoreHarness";

// Mock Firebase modules before importing socialApi
const mockDeleteUser = vi.fn();
// 2026-05-26 audit PR 2 — toggleKudos / addComment / deleteComment
// now route through Cloud Function callables. Provide a stub for
// httpsCallable so the unit tests assert "the callable was invoked
// with the right payload" rather than direct Firestore writes.
const mockCallableInvoke = vi.fn();
const mockHttpsCallable = vi.fn() as ReturnType<typeof vi.fn> &
  ((...args: unknown[]) => unknown);
mockHttpsCallable.mockImplementation(() => mockCallableInvoke);

/**
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 *
 * It stubbed `doc`/`collection` as `args.join("/")` and asserted call
 * COUNTS — `expect(mockSetDoc).toHaveBeenCalledTimes(2)` for a follow.
 * That says two writes happened; it does not say which two documents,
 * in which direction, or with what content. Both halves of a follow
 * could have landed on the same path and the test would not have moved.
 * Follows are now real documents, asserted by path.
 *
 * The callable stubs stay: `toggleKudos` / `addComment` / `reportContent`
 * route through Cloud Functions, so the callable IS their boundary — the
 * same reasoning that keeps `firestoreWrite` on a spy permanently.
 */
vi.mock("firebase/firestore");

vi.mock("firebase/auth", () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => "mock-functions"),
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

vi.mock("../firebase", () => ({
  db: "mock-db",
  auth: { currentUser: { uid: "user1" } },
}));

import {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowerCount,
  getFollowingCount,
  toggleKudos,
  hasGivenKudos,
  fetchActivitiesByIds,
  batchGetKudos,
  blockUser,
  unblockUser,
  isBlocked,
  getBlockedUsers,
  reportContent,
} from "../socialApi";

beforeEach(() => {
  vi.clearAllMocks();
  resetFirestore();
  // Default callable response — tests override via mockCallableInvoke
  // when they care about the server's reply.
  mockCallableInvoke.mockResolvedValue({ data: {} });
  mockHttpsCallable.mockReturnValue(mockCallableInvoke);
});

describe("followUser", () => {
  it("creates follow documents in both directions", async () => {
    await followUser("user1", "user2");
    // Both directions, by path. The old count-only assertion could not
    // tell two correct writes from two writes to the same document.
    expect(readDoc("following/user1/users/user2")).toBeTruthy();
    expect(readDoc("followers/user2/users/user1")).toBeTruthy();
  });
});

describe("unfollowUser", () => {
  it("deletes follow documents in both directions", async () => {
    seedFirestore({
      "following/user1/users/user2": { createdAt: 1 },
      "followers/user2/users/user1": { createdAt: 1 },
    });
    await unfollowUser("user1", "user2");
    expect(readDoc("following/user1/users/user2")).toBeUndefined();
    expect(readDoc("followers/user2/users/user1")).toBeUndefined();
  });
});

describe("isFollowing", () => {
  it("returns true when document exists", async () => {
    seedFirestore({ "following/user1/users/user2": { createdAt: 1 } });
    const result = await isFollowing("user1", "user2");
    expect(result).toBe(true);
  });

  it("returns false when document does not exist", async () => {
    const result = await isFollowing("user1", "user2");
    expect(result).toBe(false);
  });
});

describe("getFollowerCount", () => {
  it("returns the number of follower docs", async () => {
    const tree: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 42; i++) tree[`followers/user1/users/f${i}`] = { i };
    // A follower of someone ELSE must not be counted — the collection
    // path is the whole contract here, and a stubbed `{ size: 42 }`
    // asserted nothing about which collection was read.
    tree["followers/other/users/x"] = { i: -1 };
    seedFirestore(tree);
    const count = await getFollowerCount("user1");
    expect(count).toBe(42);
  });
});

describe("getFollowingCount", () => {
  it("returns the number of following docs", async () => {
    const tree: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 10; i++) tree[`following/user1/users/f${i}`] = { i };
    tree["following/other/users/x"] = { i: -1 };
    seedFirestore(tree);
    const count = await getFollowingCount("user1");
    expect(count).toBe(10);
  });
});

describe("toggleKudos", () => {
  // 2026-05-26 audit PR 2 (finding #2) — toggleKudos now invokes
  // `toggleKudosCallable`. The server flips the kudos doc and the
  // activity counter atomically; the client just relays the user
  // intent + receives the resulting `kudosed` boolean.
  it("routes to the toggleKudosCallable Cloud Function with the activity id", async () => {
    mockCallableInvoke.mockResolvedValue({ data: { kudosed: true } });
    await toggleKudos("activity1", "user1");
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      "mock-functions",
      "toggleKudosCallable"
    );
    expect(mockCallableInvoke).toHaveBeenCalledWith({
      activityId: "activity1",
    });
  });

  it("returns false when the server reports kudos were removed", async () => {
    mockCallableInvoke.mockResolvedValue({ data: { kudosed: false } });
    const result = await toggleKudos("activity1", "user1");
    expect(result).toBe(false);
    // Client must NOT touch Firestore directly — that path is denied
    // at the rules layer post-PR-2 (audit finding #2). Asserted against
    // the real write log, so any operation counts, not just the three
    // the old suite spied on.
    expect(writeLog()).toEqual([]);
  });

  it("returns true when the server reports kudos were added", async () => {
    mockCallableInvoke.mockResolvedValue({ data: { kudosed: true } });
    const result = await toggleKudos("activity1", "user1");
    expect(result).toBe(true);
    // Packet 14: the callable is the only writer. Asserted against the
    // real write log, so ANY direct write shows up — not just the three
    // operations the old suite happened to spy on.
    expect(writeLog()).toEqual([]);
  });

  it("throws an identity mismatch before invoking the callable", async () => {
    await expect(toggleKudos("activity1", "someone-else")).rejects.toThrow(
      /identity mismatch/i
    );
    expect(mockHttpsCallable).not.toHaveBeenCalled();
    expect(mockCallableInvoke).not.toHaveBeenCalled();
  });
});

describe("hasGivenKudos", () => {
  it("returns true when kudos doc exists", async () => {
    seedFirestore({ "kudos/act1/users/user1": { at: 1 } });
    expect(await hasGivenKudos("act1", "user1")).toBe(true);
  });

  it("returns false when kudos doc does not exist", async () => {
    // Another user's kudos on the same activity must not read as mine.
    seedFirestore({ "kudos/act1/users/someone-else": { at: 1 } });
    expect(await hasGivenKudos("act1", "user1")).toBe(false);
  });
});

describe("fetchActivitiesByIds", () => {
  it("returns empty object for empty input", async () => {
    const result = await fetchActivitiesByIds([]);
    expect(result).toEqual({});
  });

  it("fetches activities and returns by id", async () => {
    seedFirestore({ "activities/act1": { type: "workout" } });
    const result = await fetchActivitiesByIds(["act1"]);
    expect(result.act1).toBeDefined();
    expect(result.act1.type).toBe("workout");
  });

  it("skips non-existent activities", async () => {
    const result = await fetchActivitiesByIds(["act1"]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("batchGetKudos", () => {
  it("returns empty object for empty input", async () => {
    expect(await batchGetKudos([], "user1")).toEqual({});
  });

  it("returns empty object for empty userId", async () => {
    expect(await batchGetKudos(["act1"], "")).toEqual({});
  });

  it("returns kudos status per activity", async () => {
    seedFirestore({
      "kudos/act1/users/user1": { at: 1 },
      "kudos/act2/users/user1": { at: 1 },
    });
    const result = await batchGetKudos(["act1", "act2"], "user1");
    expect(result.act1).toBe(true);
    expect(result.act2).toBe(true);
  });

  it("treats a permission-denied child read as not-liked and keeps the rest (packet 13)", async () => {
    // act2's parent activity became inaccessible → its kudos child read is
    // denied. That must NOT fail the whole batch; only act2 becomes false.
    seedFirestore({
      "kudos/act1/users/user1": { at: 1 },
      "kudos/act2/users/user1": { at: 1 },
    });
    failNextFirestore("getDoc", {
      path: "kudos/act2/users/user1",
      code: "permission-denied",
    });
    const result = await batchGetKudos(["act1", "act2"], "user1");
    expect(result.act1).toBe(true);
    expect(result.act2).toBe(false);
  });

  it("rethrows a non-permission-denied error", async () => {
    failNextFirestore("getDoc", {
      path: "kudos/act1/users/user1",
      code: "unavailable",
    });
    await expect(batchGetKudos(["act1"], "user1")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("reportContent (packet 14 — callable-only)", () => {
  it("routes to the createReport callable with the safe payload and no direct write", async () => {
    mockCallableInvoke.mockResolvedValue({ data: { reportId: "r1" } });
    await reportContent({
      targetType: "activity",
      targetId: "act1",
      category: "harassment",
      freeformNote: "bad",
    });
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      "mock-functions",
      "createReport"
    );
    expect(mockCallableInvoke).toHaveBeenCalledWith({
      targetType: "activity",
      targetId: "act1",
      category: "harassment",
      freeformNote: "bad",
    });
    // No direct Firestore write — the report goes through the callable.
    // Against the real write log, so any write of any kind is caught.
    expect(writeLog()).toEqual([]);
  });
});

describe("blockUser", () => {
  it("creates block doc and removes follow relationships", async () => {
    // A pre-existing follow in BOTH directions, so "removes follow
    // relationships" has something real to remove. The old count-only
    // assertion (1 set, 4 deletes) passed without any follow existing.
    seedFirestore({
      "following/user1/users/user2": { at: 1 },
      "followers/user1/users/user2": { at: 1 },
      "following/user2/users/user1": { at: 1 },
      "followers/user2/users/user1": { at: 1 },
      // An unrelated follow that must SURVIVE the block.
      "following/user1/users/user3": { at: 1 },
    });
    await blockUser("user1", "user2");

    expect(readDoc("blocks/user1/users/user2")).toBeTruthy();
    for (const p of [
      "following/user1/users/user2",
      "followers/user1/users/user2",
      "following/user2/users/user1",
      "followers/user2/users/user1",
    ]) {
      expect(allPaths(), p).not.toContain(p);
    }
    expect(readDoc("following/user1/users/user3")).toBeTruthy();
  });
});

describe("unblockUser", () => {
  it("deletes the block document", async () => {
    seedFirestore({ "blocks/user1/users/user2": { at: 1 } });
    await unblockUser("user1", "user2");
    expect(readDoc("blocks/user1/users/user2")).toBeUndefined();
  });
});

describe("isBlocked", () => {
  it("returns true when blocked", async () => {
    seedFirestore({ "blocks/user1/users/user2": { at: 1 } });
    expect(await isBlocked("user1", "user2")).toBe(true);
  });

  it("returns false when not blocked", async () => {
    // Blocked by someone else, and blocking someone else — neither
    // means user1 blocked user2. Direction is the whole contract.
    seedFirestore({
      "blocks/user2/users/user1": { at: 1 },
      "blocks/user1/users/user3": { at: 1 },
    });
    expect(await isBlocked("user1", "user2")).toBe(false);
  });
});

describe("getBlockedUsers", () => {
  it("returns list of blocked user IDs", async () => {
    seedFirestore({
      "blocks/user1/users/blocked1": { at: 1 },
      "blocks/user1/users/blocked2": { at: 2 },
      "blocks/other/users/nope": { at: 3 },
    });
    const result = await getBlockedUsers("user1");
    expect(result.sort()).toEqual(["blocked1", "blocked2"]);
  });
});
