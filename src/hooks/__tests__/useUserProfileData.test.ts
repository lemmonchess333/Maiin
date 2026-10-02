/**
 * useUserProfileData — everything the profile page reads, for one
 * (viewer, profile) pair. Firestore runs on the one fake (ADR-0009); the
 * fake applies no rules, so which visibilities a profile may ask for is
 * pinned on `profilePostVisibilities` here and in firestore.rules.test.ts
 * ("profile:" cases), where the refusal itself lives.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const counts = vi.hoisted(() => ({ followers: 2 }));
vi.mock("@/lib/socialApi", () => ({
  getFollowerCount: async () => counts.followers,
  getFollowingCount: async () => 1,
  batchGetKudos: async (ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, id === "liked"])),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

import {
  profilePostVisibilities,
  useUserProfileData,
  PROFILE_BADGES_SHOWN,
} from "../useUserProfileData";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const post = (
  id: string,
  createdAt: number,
  visibility = "public",
  authorId = "alice"
) => ({
  [`activities/${id}`]: {
    authorId,
    authorName: authorId,
    type: "run",
    visibility,
    createdAt,
  },
});

beforeEach(() => {
  resetFirestore();
  counts.followers = 2;
});

async function settled(uid: string, viewer: string | null) {
  const hook = renderHook(() => useUserProfileData(uid, viewer));
  await waitFor(() => expect(hook.result.current.status).not.toBe("loading"));
  await waitFor(() => expect(hook.result.current.postsLoading).toBe(false));
  return hook;
}

describe("useUserProfileData — someone else's profile", () => {
  it("names them from the public profile and lists posts newest first, liked state included", async () => {
    seedFirestore({
      "users/alice/public/profile": { displayName: "Alice", currentStreak: 5 },
      ...post("old", 1),
      ...post("liked", 3),
      ...post("fol", 2, "followers"),
      ...post("bob", 9, "public", "bob"),
    });
    const { result } = await settled("alice", "viewer");
    expect(result.current.status).toBe("ready");
    expect(result.current.identity).toEqual({ displayName: "Alice" });
    expect(result.current.streak).toBe(5);
    expect(result.current.posts.map((p) => p.id)).toEqual([
      "liked",
      "fol",
      "old",
    ]);
    expect(result.current.posts.map((p) => p.liked)).toEqual([
      true,
      false,
      false,
    ]);
    await waitFor(() => expect(result.current.followers).toBe(2));
    expect(result.current.followingCount).toBe(1);
  });

  it("shows their newest badges from the public summary, at most four", async () => {
    seedFirestore({
      "users/alice/public/profile": {
        displayName: "Alice",
        badgeSummary: {
          earnedMap: {
            first_step: "2026-01-01",
            first_5k: "2026-02-01",
            "10k_club": "2026-03-01",
            first_pr: "2026-04-01",
            week_warrior: "2026-05-01",
            not_a_badge: "2026-06-01",
          },
        },
      },
    });
    const { result } = await settled("alice", "viewer");
    expect(result.current.badges.map((b) => b.id)).toEqual([
      "week_warrior",
      "first_pr",
      "10k_club",
      "first_5k",
    ]);
    expect(PROFILE_BADGES_SHOWN).toBe(4);
  });

  it("asks for public and followers-only posts in separate queries", () => {
    expect(profilePostVisibilities(false)).toEqual(["public", "followers"]);
  });
});

describe("useUserProfileData — your own profile", () => {
  it("names you from your own document and leaves private sessions out", async () => {
    seedFirestore({
      "users/alice": { displayName: "Alice A", photoURL: "https://x/p.jpg" },
      "users/alice/public/profile": { displayName: "Alice" },
      "users/alice/streaks/data": { badges: { first_pr: "2026-04-01" } },
      ...post("pub", 3),
      ...post("fol", 2, "followers"),
      ...post("priv", 1, "private"),
    });
    const { result } = await settled("alice", "alice");
    expect(result.current.identity).toEqual({
      displayName: "Alice A",
      photoURL: "https://x/p.jpg",
    });
    expect(result.current.posts.map((p) => p.id)).toEqual(["pub", "fol"]);
    await waitFor(() =>
      expect(result.current.badges.map((b) => b.id)).toEqual(["first_pr"])
    );
  });

  it("asks for both kinds in one query, and never private", () => {
    expect(profilePostVisibilities(true)).toEqual([["public", "followers"]]);
  });
});

describe("useUserProfileData — when there is nothing to show", () => {
  it("a profile with no document is missing, not loading forever", async () => {
    const { result } = await settled("ghost", "viewer");
    expect(result.current.status).toBe("missing");
    expect(result.current.identity).toBeNull();
  });

  it("a failed read is an error, and a retry can recover", async () => {
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    failNextFirestore("getDoc", {
      path: "users/alice/public/profile",
      code: "unavailable",
    });
    const { result } = await settled("alice", "viewer");
    expect(result.current.status).toBe("error");
    expect(unfiredFailures()).toEqual([]);
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});

describe("useUserProfileData — following from the page", () => {
  it("moves the follower count at once, never below zero", async () => {
    counts.followers = 0;
    seedFirestore({ "users/alice/public/profile": { displayName: "Alice" } });
    const { result } = await settled("alice", "viewer");
    await waitFor(() => expect(result.current.followers).toBe(0));
    act(() => result.current.adjustFollowers(-1));
    expect(result.current.followers).toBe(0);
    act(() => result.current.adjustFollowers(1));
    expect(result.current.followers).toBe(1);
  });
});
