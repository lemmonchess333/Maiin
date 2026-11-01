/**
 * Props show who gave them (Mob2's Mobbin finding 8): toggleKudos keeps
 * the newest RECENT_PROPS_MAX givers on the post, each with their public
 * name and photo, in the transaction that flips the count, and
 * identityResync carries a giver's new name or photo to them. Driven
 * against the in-memory Firestore.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { toggleKudos, RECENT_PROPS_MAX } = require("../lib/socialCounters");
const { resyncAuthorIdentity } = require("../lib/identityResync");

const POST = "activities/p1";
const increment = (n) => n;
const serverTimestamp = () => Date.UTC(2026, 9, 1);

/** A public post, its givers' public profiles, and kudos already given. */
function seeded({ post = {}, kudos = [] } = {}) {
  const seed = {
    [POST]: {
      authorId: "author",
      type: "run",
      visibility: "public",
      kudosCount: kudos.length,
      createdAt: Date.UTC(2026, 9, 1),
      ...post,
    },
    "users/ann/public/profile": {
      displayName: "Ann",
      photoURL:
        "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.appspot.com/o/profile-photos%2Fann%2Fa.jpg",
    },
    "users/bo/public/profile": { displayName: "Bo" },
    "users/cy/public/profile": { displayName: "Cy" },
    "users/di/public/profile": { displayName: "Di" },
  };
  for (const uid of kudos) seed[`kudos/p1/users/${uid}`] = { createdAt: 1 };
  return memoryFirestore(seed);
}

/** The counter is a plain number in the fake: an increment is applied by
 *  the test, as Firestore would. */
async function give(db, uid) {
  const before = db.data.get(POST).kudosCount;
  const result = await toggleKudos({
    firestore: db,
    uid,
    activityId: "p1",
    increment,
    serverTimestamp,
  });
  const post = db.data.get(POST);
  db.data.set(POST, {
    ...post,
    kudosCount: before + (result.kudosed ? 1 : -1),
  });
  return result;
}

const names = (db) => db.data.get(POST).recentPropsBy.map((g) => g.name);

describe("toggleKudos keeps the newest givers on the post", () => {
  it("names a giver with their public name and photo", async () => {
    const db = seeded();
    await give(db, "ann");
    expect(db.data.get(POST).recentPropsBy).toEqual([
      {
        uid: "ann",
        name: "Ann",
        photoURL:
          "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.appspot.com/o/profile-photos%2Fann%2Fa.jpg",
      },
    ]);
    expect(db.data.get(POST).recentPropsByUids).toEqual(["ann"]);
  });

  it("puts the newest first and keeps three", async () => {
    expect(RECENT_PROPS_MAX).toBe(3);
    const db = seeded();
    for (const uid of ["ann", "bo", "cy", "di"]) await give(db, uid);
    expect(names(db)).toEqual(["Di", "Cy", "Bo"]);
    expect(db.data.get(POST).recentPropsByUids).toEqual(["di", "cy", "bo"]);
  });

  it("names someone with no public profile as every social surface does", async () => {
    const db = seeded();
    await give(db, "zed");
    expect(db.data.get(POST).recentPropsBy).toEqual([
      { uid: "zed", name: "Athlete" },
    ]);
  });

  it("takes a giver off when they take their props back", async () => {
    const db = seeded();
    await give(db, "ann");
    await give(db, "bo");
    await give(db, "bo");
    expect(names(db)).toEqual(["Ann"]);
    expect(db.data.get(POST).recentPropsByUids).toEqual(["ann"]);
  });

  it("names the next giver when one of the three takes props back", async () => {
    // Di gave props before the post kept names; Ann, Bo and Cy after.
    const db = seeded({
      kudos: ["di"],
      post: {
        recentPropsBy: [],
        recentPropsByUids: [],
      },
    });
    for (const uid of ["ann", "bo", "cy"]) await give(db, uid);
    expect(names(db)).toEqual(["Cy", "Bo", "Ann"]);
    await give(db, "bo");
    expect(names(db).slice(0, 2)).toEqual(["Cy", "Ann"]);
    expect(names(db)).toHaveLength(3);
    expect(names(db)[2]).toBe("Di");
  });
});

describe("identityResync carries a giver's new name to the posts that name them", () => {
  it("rewrites only their own entry", async () => {
    const db = seeded();
    await give(db, "ann");
    await give(db, "bo");
    db.data.set("users/ann/public/profile", { displayName: "Annie" });
    const result = await resyncAuthorIdentity({
      firestore: db,
      uid: "ann",
      fields: { name: true, photo: true },
      now: Date.UTC(2026, 9, 2),
      deleteField: () => undefined,
    });
    expect(result.updated.propsGiver).toBe(1);
    expect(db.data.get(POST).recentPropsBy).toEqual([
      { uid: "bo", name: "Bo" },
      // The photo she took down is gone from her entry too.
      { uid: "ann", name: "Annie" },
    ]);
  });

  it("writes nothing a second time", async () => {
    const db = seeded();
    await give(db, "ann");
    db.data.set("users/ann/public/profile", { displayName: "Annie" });
    const run = () =>
      resyncAuthorIdentity({
        firestore: db,
        uid: "ann",
        fields: { name: true, photo: false },
        now: Date.UTC(2026, 9, 2),
        deleteField: () => undefined,
      });
    await run();
    expect((await run()).updated.propsGiver).toBeUndefined();
  });

  it("the givers query has its index declared", () => {
    const { indexes } = require("../../firestore.indexes.json");
    expect(indexes).toContainEqual({
      collectionGroup: "activities",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "recentPropsByUids", arrayConfig: "CONTAINS" },
        { fieldPath: "createdAt", order: "DESCENDING" },
      ],
    });
  });
});
