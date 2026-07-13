import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firebase modules before importing socialApi
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockWriteBatch = vi.fn();
const mockDeleteUser = vi.fn();
// 2026-05-26 audit PR 2 — toggleKudos / addComment / deleteComment
// now route through Cloud Function callables. Provide a stub for
// httpsCallable so the unit tests assert "the callable was invoked
// with the right payload" rather than direct Firestore writes.
const mockCallableInvoke = vi.fn();
const mockHttpsCallable = vi.fn() as ReturnType<typeof vi.fn> &
  ((...args: unknown[]) => unknown);
mockHttpsCallable.mockImplementation(() => mockCallableInvoke);

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args: string[]) => args.join("/")),
  doc: vi.fn((...args: string[]) => args.join("/")),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
  query: vi.fn((...args: unknown[]) => args[0]),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  increment: vi.fn((n: number) => n),
  Timestamp: { now: () => ({ seconds: 1000 }) },
  serverTimestamp: () => "SERVER_TIMESTAMP",
  collectionGroup: vi.fn((...args: string[]) => args.join("/")),
  type: {},
}));

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
} from "../socialApi";

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockAddDoc.mockResolvedValue({ id: "new-doc-id" });
  // Default callable response — tests override via mockCallableInvoke
  // when they care about the server's reply.
  mockCallableInvoke.mockResolvedValue({ data: {} });
  mockHttpsCallable.mockReturnValue(mockCallableInvoke);
});

describe("followUser", () => {
  it("creates follow documents in both directions", async () => {
    await followUser("user1", "user2");
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
  });
});

describe("unfollowUser", () => {
  it("deletes follow documents in both directions", async () => {
    await unfollowUser("user1", "user2");
    expect(mockDeleteDoc).toHaveBeenCalledTimes(2);
  });
});

describe("isFollowing", () => {
  it("returns true when document exists", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true });
    const result = await isFollowing("user1", "user2");
    expect(result).toBe(true);
  });

  it("returns false when document does not exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const result = await isFollowing("user1", "user2");
    expect(result).toBe(false);
  });
});

describe("getFollowerCount", () => {
  it("returns the number of follower docs", async () => {
    mockGetDocs.mockResolvedValue({ size: 42 });
    const count = await getFollowerCount("user1");
    expect(count).toBe(42);
  });
});

describe("getFollowingCount", () => {
  it("returns the number of following docs", async () => {
    mockGetDocs.mockResolvedValue({ size: 10 });
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
    // at the rules layer post-PR-2 (audit finding #2).
    expect(mockDeleteDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it("returns true when the server reports kudos were added", async () => {
    mockCallableInvoke.mockResolvedValue({ data: { kudosed: true } });
    const result = await toggleKudos("activity1", "user1");
    expect(result).toBe(true);
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).not.toHaveBeenCalled();
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
    mockGetDoc.mockResolvedValue({ exists: () => true });
    expect(await hasGivenKudos("act1", "user1")).toBe(true);
  });

  it("returns false when kudos doc does not exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    expect(await hasGivenKudos("act1", "user1")).toBe(false);
  });
});

describe("fetchActivitiesByIds", () => {
  it("returns empty object for empty input", async () => {
    const result = await fetchActivitiesByIds([]);
    expect(result).toEqual({});
  });

  it("fetches activities and returns by id", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: "act1",
      data: () => ({ type: "workout" }),
    });
    const result = await fetchActivitiesByIds(["act1"]);
    expect(result.act1).toBeDefined();
    expect(result.act1.type).toBe("workout");
  });

  it("skips non-existent activities", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, id: "act1" });
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
    mockGetDoc.mockResolvedValue({ exists: () => true });
    const result = await batchGetKudos(["act1", "act2"], "user1");
    expect(result.act1).toBe(true);
    expect(result.act2).toBe(true);
  });

  it("treats a permission-denied child read as not-liked and keeps the rest (packet 13)", async () => {
    // act2's parent activity became inaccessible → its kudos child read is
    // denied. That must NOT fail the whole batch; only act2 becomes false.
    mockGetDoc.mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("/kudos/act2/")) {
        return Promise.reject({ code: "permission-denied" });
      }
      return Promise.resolve({ exists: () => true });
    });
    const result = await batchGetKudos(["act1", "act2"], "user1");
    expect(result.act1).toBe(true);
    expect(result.act2).toBe(false);
  });

  it("rethrows a non-permission-denied error", async () => {
    mockGetDoc.mockRejectedValue({ code: "unavailable" });
    await expect(batchGetKudos(["act1"], "user1")).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("blockUser", () => {
  it("creates block doc and removes follow relationships", async () => {
    mockDeleteDoc.mockResolvedValue(undefined);
    await blockUser("user1", "user2");
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    // 4 deleteDoc calls for bidirectional unfollow
    expect(mockDeleteDoc).toHaveBeenCalledTimes(4);
  });
});

describe("unblockUser", () => {
  it("deletes the block document", async () => {
    await unblockUser("user1", "user2");
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

describe("isBlocked", () => {
  it("returns true when blocked", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true });
    expect(await isBlocked("user1", "user2")).toBe(true);
  });

  it("returns false when not blocked", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    expect(await isBlocked("user1", "user2")).toBe(false);
  });
});

describe("getBlockedUsers", () => {
  it("returns list of blocked user IDs", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: "blocked1" }, { id: "blocked2" }],
    });
    const result = await getBlockedUsers("user1");
    expect(result).toEqual(["blocked1", "blocked2"]);
  });
});
