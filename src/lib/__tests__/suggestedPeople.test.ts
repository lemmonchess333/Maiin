/**
 * Who People suggests (`getSuggestedPeople`), read through the one
 * Firestore fake (ADR-0009).
 *
 * Someone who had asked to follow you was listed twice on People: in the
 * requests at the top, with Accept and Decline, and again in the
 * suggestions, with Follow (the Social capture, 2026-11-03). And someone
 * you had asked was suggested with a Follow button, though the request
 * stood: the suggestions tell their buttons that everyone listed is
 * someone you have not followed or asked, so no button checked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

vi.mock("firebase/firestore");
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));
vi.mock("../firebase", () => ({
  db: "mock-db",
  auth: { currentUser: { uid: "me" } },
}));
vi.mock("@/lib/errorReporting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/errorReporting")>()),
  captureError: vi.fn(),
}));

import { getSuggestedPeople } from "../socialApi";

/** A public post by each, newest first, and each one's public profile. */
function seedPosters(...names: string[]) {
  const tree: Record<string, Record<string, unknown>> = {};
  names.forEach((name, i) => {
    const uid = name.toLowerCase();
    tree[`activities/post-${uid}`] = {
      authorId: uid,
      authorName: name,
      type: "run",
      visibility: "public",
      createdAt: 100 - i,
    };
    tree[`users/${uid}/public/profile`] = { uid, displayName: name };
  });
  seedFirestore(tree);
}

const names = async () =>
  (await getSuggestedPeople("me")).map((p) => p.displayName);

beforeEach(() => resetFirestore());

describe("getSuggestedPeople", () => {
  it("leaves out someone who has asked to follow you", async () => {
    seedPosters("Dan", "Tom");
    seedFirestore({ "followRequests/me/users/dan": { requestedAt: 5 } });
    expect(await names()).toEqual(["Tom"]);
  });

  it("leaves out someone you have asked to follow", async () => {
    seedPosters("Eve", "Tom");
    seedFirestore({ "followRequests/eve/users/me": { requestedAt: 5 } });
    expect(await names()).toEqual(["Tom"]);
  });

  it("leaves them out when found through a shared space too", async () => {
    seedFirestore({
      "spaces/runners/members/dan": { displayName: "Dan" },
      "spaces/runners/members/eve": { displayName: "Eve" },
      "spaces/runners/members/priya": { displayName: "Priya" },
      "followRequests/me/users/dan": { requestedAt: 5 },
      "followRequests/eve/users/me": { requestedAt: 4 },
    });
    const people = await getSuggestedPeople("me", {
      joinedSpaceIds: ["runners"],
    });
    expect(people.map((p) => p.uid)).toEqual(["priya"]);
  });

  it("still suggests everyone else, followed and blocked people aside", async () => {
    // Someone else's request to a third person is nothing to do with you.
    seedPosters("Dan", "Tom", "Bo", "Cy");
    seedFirestore({
      "followRequests/dan/users/tom": { requestedAt: 5 },
      "following/me/users/bo": { followedAt: 1 },
    });
    const people = await getSuggestedPeople("me", {
      blockedUsers: new Set(["cy"]),
    });
    expect(people.map((p) => p.displayName)).toEqual(["Dan", "Tom"]);
  });

  it("still suggests when the requests cannot be read", async () => {
    seedPosters("Dan", "Tom");
    seedFirestore({
      "followRequests/me/users/dan": { requestedAt: 5 },
      "followRequests/tom/users/me": { requestedAt: 4 },
    });
    failNextFirestore("getDocs", {
      path: "followRequests/me/users",
      code: "unavailable",
    });
    failNextFirestore("getDoc", {
      path: "followRequests/tom/users/me",
      code: "unavailable",
    });
    // Neither read answered, so neither leaves anyone out.
    expect(await names()).toEqual(["Dan", "Tom"]);
    expect(unfiredFailures()).toEqual([]);
  });
});
