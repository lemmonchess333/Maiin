/**
 * A new name or photo, carried to the copies of a person other people read
 * (lib/identityResync.js), against an in-memory Firestore with real paths,
 * queries and transactions.
 *
 * What these hold: the copies that are the person's and recent change, and
 * nothing else does (someone else's post, a post from months ago, a feed
 * copy, a Tropos Team post, a challenge long over); only the field that
 * changed is carried; a refused name, a restricted account's new name or
 * photo, and an account being deleted carry nothing; a second run writes
 * nothing.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  resyncAuthorIdentity,
  wantedIdentity,
  ACTIVITY_CAP,
} = require("../lib/identityResync");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const DAY = 86400000;
const ago = (days) => new Date(NOW - days * DAY);
const DELETED = "<field deleted>";
const OLD_PHOTO = "https://firebasestorage.googleapis.com/v0/b/x/o/old.jpg";
const NEW_PHOTO = "https://firebasestorage.googleapis.com/v0/b/x/o/new.jpg";

const OLD = { authorName: "Alice Old", authorPhotoURL: OLD_PHOTO };

/** Alice, renamed and with a new photo, and every kind of copy of her. */
function world(profile = { displayName: "Alice New", photoURL: NEW_PHOTO }) {
  return memoryFirestore({
    "users/alice/public/profile": profile,
    // Her activities: one this week, one from months ago, and Bob's.
    "activities/a1": {
      authorId: "alice",
      visibility: "public",
      createdAt: ago(1),
      ...OLD,
    },
    "activities/a2": {
      authorId: "alice",
      visibility: "followers",
      createdAt: ago(120),
      ...OLD,
    },
    "activities/b1": {
      authorId: "bob",
      visibility: "public",
      createdAt: ago(1),
      authorName: "Bob",
    },
    // Her comment on Bob's post, and the feed copy of her post in Bob's
    // feed, which shares the `items` group and an authorId.
    "comments/b1/items/c1": {
      authorId: "alice",
      text: "Nice one",
      createdAt: ago(2),
      ...OLD,
    },
    "feeds/bob/items/a1": {
      schemaVersion: 2,
      activityId: "a1",
      authorId: "alice",
      createdAt: ago(1),
    },
    // Her Space post, her Tropos Team note, and her comment on a post.
    "spaces/runners/posts/p1": {
      authorId: "alice",
      body: "Long run",
      createdAt: ago(3),
      ...OLD,
    },
    "spaces/runners/posts/team": {
      authorId: "alice",
      official: true,
      body: "Welcome",
      createdAt: ago(3),
      authorName: "Tropos Team",
    },
    "spaces/runners/posts/p2/comments/k1": {
      authorId: "alice",
      text: "Same",
      createdAt: ago(4),
      ...OLD,
    },
    // Her memberships.
    "spaces/runners/members/alice": {
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
    },
    "goalSpaces/g1/members/alice": {
      uid: "alice",
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
      role: "member",
    },
    // A challenge running now and one long over.
    "challenges/now": { endDate: new Date(NOW + 5 * DAY) },
    "challenges/past": { endDate: ago(200) },
    "challenges/now/participants/alice": {
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
      currentValue: 3,
    },
    "challenges/past/participants/alice": {
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
      currentValue: 9,
    },
  });
}

function run(firestore, fields = { name: true, photo: true }) {
  return resyncAuthorIdentity({
    firestore,
    uid: "alice",
    fields,
    now: NOW,
    deleteField: () => DELETED,
  });
}

const doc = (firestore, path) => firestore.data.get(path);

describe("resyncAuthorIdentity — what it reaches", () => {
  it("carries the new name and photo to each of her recent copies", async () => {
    const firestore = world();
    const result = await run(firestore);
    for (const path of [
      "activities/a1",
      "comments/b1/items/c1",
      "spaces/runners/posts/p1",
      "spaces/runners/posts/p2/comments/k1",
    ]) {
      expect(doc(firestore, path), path).toMatchObject({
        authorName: "Alice New",
        authorPhotoURL: NEW_PHOTO,
      });
    }
    for (const path of [
      "spaces/runners/members/alice",
      "goalSpaces/g1/members/alice",
      "challenges/now/participants/alice",
    ]) {
      expect(doc(firestore, path), path).toMatchObject({
        displayName: "Alice New",
        photoURL: NEW_PHOTO,
      });
    }
    expect(result.updated).toEqual({
      activity: 1,
      comment: 1,
      spacePost: 1,
      spaceComment: 1,
      spaceMember: 1,
      circleMember: 1,
      participant: 1,
    });
    expect(result.stopped).toBeNull();
  });

  it("leaves old posts, other people's, feed copies, team posts and old challenges alone", async () => {
    const firestore = world();
    await run(firestore);
    expect(doc(firestore, "activities/a2").authorName).toBe("Alice Old");
    expect(doc(firestore, "activities/b1").authorName).toBe("Bob");
    expect(doc(firestore, "feeds/bob/items/a1")).toEqual({
      schemaVersion: 2,
      activityId: "a1",
      authorId: "alice",
      createdAt: ago(1),
    });
    expect(doc(firestore, "spaces/runners/posts/team").authorName).toBe(
      "Tropos Team"
    );
    expect(
      doc(firestore, "challenges/past/participants/alice").displayName
    ).toBe("Alice Old");
    // Progress is never touched.
    expect(
      doc(firestore, "challenges/now/participants/alice").currentValue
    ).toBe(3);
  });

  it("carries only the field that changed", async () => {
    const firestore = world();
    await run(firestore, { name: true, photo: false });
    expect(doc(firestore, "activities/a1")).toMatchObject({
      authorName: "Alice New",
      authorPhotoURL: OLD_PHOTO,
    });
  });

  it("a second run writes nothing", async () => {
    const firestore = world();
    await run(firestore);
    const writes = firestore.operations.length;
    const again = await run(firestore);
    expect(again.updated).toEqual({});
    expect(firestore.operations.length).toBe(writes);
  });

  it("a removed photo is taken off every copy, in the shape each one keeps", async () => {
    const firestore = world({ displayName: "Alice Old" });
    await run(firestore, { name: false, photo: true });
    expect(doc(firestore, "activities/a1").authorPhotoURL).toBe(DELETED);
    expect(doc(firestore, "spaces/runners/members/alice").photoURL).toBe(
      DELETED
    );
    // A Circle member stores no photo as null.
    expect(doc(firestore, "goalSpaces/g1/members/alice").photoURL).toBeNull();
  });
});

describe("resyncAuthorIdentity — what it never carries", () => {
  it("a name the word filter refuses, or none, leaves the last good name", async () => {
    for (const displayName of ["shit head", null, "   "]) {
      const firestore = world({ displayName, photoURL: OLD_PHOTO });
      const result = await run(firestore, { name: true, photo: false });
      expect(result.stopped).toBe("nothing-to-carry");
      expect(doc(firestore, "activities/a1").authorName).toBe("Alice Old");
    }
  });

  it("a photo from outside the app's origins is carried as no photo", async () => {
    const firestore = world({
      displayName: "Alice Old",
      photoURL: "https://example.com/tracker.gif",
    });
    await run(firestore, { name: false, photo: true });
    expect(doc(firestore, "activities/a1").authorPhotoURL).toBe(DELETED);
  });

  it("a restricted account's new name and photo reach no one; a removed photo still comes down", async () => {
    const restricted = world();
    restricted.data.set("globalRestrictedUids/alice", { at: 1 });
    const result = await run(restricted);
    expect(result.stopped).toBe("nothing-to-carry");
    expect(doc(restricted, "activities/a1")).toMatchObject(OLD);

    const removed = world({ displayName: "Alice New" });
    removed.data.set("globalRestrictedUids/alice", { at: 1 });
    await run(removed);
    expect(doc(removed, "activities/a1")).toMatchObject({
      authorName: "Alice Old",
      authorPhotoURL: DELETED,
    });
  });

  it("an account being deleted is left alone", async () => {
    const firestore = world();
    firestore.data.set("accountDeletionRequests/alice", { status: "running" });
    const result = await run(firestore);
    expect(result.stopped).toBe("deleting");
    expect(doc(firestore, "activities/a1")).toMatchObject(OLD);
  });

  it("a copy deleted before its batch is not written back", async () => {
    const firestore = world();
    const realTransaction = firestore.runTransaction;
    firestore.runTransaction = async (fn) => {
      // The deletion (or its author) removes the comment between the
      // search and the write.
      firestore.data.delete("comments/b1/items/c1");
      return realTransaction(fn);
    };
    await run(firestore);
    expect(firestore.data.has("comments/b1/items/c1")).toBe(false);
  });

  it("a rename that lands mid-run wins: each batch reads the profile it writes from", async () => {
    const firestore = world();
    const realTransaction = firestore.runTransaction;
    firestore.runTransaction = async (fn) => {
      firestore.data.set("users/alice/public/profile", {
        displayName: "Alice Newer",
        photoURL: NEW_PHOTO,
      });
      return realTransaction(fn);
    };
    await run(firestore);
    expect(doc(firestore, "activities/a1").authorName).toBe("Alice Newer");
  });
});

describe("resyncAuthorIdentity — bounds", () => {
  it("updates at most ACTIVITY_CAP activities and says it was cut short", async () => {
    const firestore = world();
    for (let i = 0; i < ACTIVITY_CAP + 5; i++) {
      firestore.data.set(`activities/x${String(i).padStart(4, "0")}`, {
        authorId: "alice",
        visibility: "public",
        createdAt: ago(1),
        ...OLD,
      });
    }
    const result = await run(firestore, { name: true, photo: false });
    expect(result.updated.activity).toBe(ACTIVITY_CAP);
    expect(result.truncated).toContain("activity");
  });
});

describe("wantedIdentity", () => {
  it("trims a name and cuts it at the display-name limit", () => {
    expect(
      wantedIdentity(
        { displayName: `  ${"a".repeat(60)}  ` },
        { fields: { name: true }, restricted: false }
      ).name
    ).toHaveLength(50);
  });
});
