/**
 * Your own followers and following lists (`followLists.ts`), a page at a
 * time, newest follow first, named from each person's public profile.
 * Driven through the one Firestore fake (ADR-0009), with edges seeded as
 * the app writes them: `followedAt` only, or with `fromRequest` when the
 * follow was accepted.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
const callable = vi.hoisted(() =>
  vi.fn(async (_name: string, _data: unknown) => ({ data: {} }))
);
vi.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    callable(name, data),
}));

import { Timestamp } from "firebase/firestore";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { getFollowListPage, removeFollower } from "@/lib/followLists";

const at = (minutes: number) =>
  Timestamp.fromMillis(Date.UTC(2026, 9, 1) + minutes * 60_000);

beforeEach(() => {
  resetFirestore();
  callable.mockClear();
  seedFirestore({
    "followers/me/users/ann": { followedAt: at(1) },
    "followers/me/users/bo": { followedAt: at(3), fromRequest: true },
    "followers/me/users/cy": { followedAt: at(2) },
    "following/me/users/ann": { followedAt: at(5) },
    "users/ann/public/profile": { displayName: "Ann", photoURL: "https://x/a" },
    "users/bo/public/profile": { displayName: "Bo" },
  });
});

describe("getFollowListPage", () => {
  it("lists followers newest first, named from their public profiles", async () => {
    const page = await getFollowListPage("me", "followers");
    expect(page.people).toEqual([
      { uid: "bo", displayName: "Bo" },
      // No public profile: the name every social surface falls back to.
      { uid: "cy", displayName: "Athlete" },
      { uid: "ann", displayName: "Ann", photoURL: "https://x/a" },
    ]);
    expect(page.next).toBeNull();
  });

  it("lists the people you follow from the other collection", async () => {
    const page = await getFollowListPage("me", "following");
    expect(page.people.map((p) => p.uid)).toEqual(["ann"]);
  });

  it("reads a page at a time, and the next page starts after the last", async () => {
    const first = await getFollowListPage("me", "followers", null, 2);
    expect(first.people.map((p) => p.uid)).toEqual(["bo", "cy"]);
    expect(first.next).not.toBeNull();
    const second = await getFollowListPage("me", "followers", first.next, 2);
    expect(second.people.map((p) => p.uid)).toEqual(["ann"]);
    expect(second.next).toBeNull();
  });
});

describe("removeFollower", () => {
  it("asks the server to remove the follow", async () => {
    await removeFollower("bo");
    expect(callable).toHaveBeenCalledWith("removeFollower", {
      followerUid: "bo",
    });
  });
});
