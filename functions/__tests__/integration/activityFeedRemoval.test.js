/**
 * Integration: a deleted post leaves every feed it was copied into.
 *
 * `onActivityCreated` copies each post into the author's feed and every
 * follower's (`feeds/{uid}/items/{activityId}`). Deleting the post, by the
 * finish screen's Undo or by deleting the session it came from, removed only
 * `activities/{id}`: every copy stayed, pointing at a post the rules now
 * refuse to read, and the Following page reads each one.
 *
 * Driven through the real create and delete triggers against the emulator,
 * because the part worth holding is how they interact. Undo comes seconds
 * after the post, so the delete trigger can run before the create trigger
 * has written its copies; a removal that only ran on delete would miss
 * exactly those.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onActivityCreated;
let onActivityDeleted;

const AUTHOR = "feedrm-alice";
const FOLLOWER = "feedrm-bob";
/** Followed the author when the post went out, and has unfollowed since. */
const FORMER = "feedrm-carol";
const POST_IDS = ["feedrm-a1", "feedrm-a2", "feedrm-b1", "feedrm-b2"];

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onActivityCreated = idx.onActivityCreated;
  onActivityDeleted = idx.onActivityDeleted;
  db = require("firebase-admin").firestore();
});

async function wipe() {
  const collections = [
    ...[AUTHOR, FOLLOWER, FORMER].map((uid) => `feeds/${uid}/items`),
    `notifications/${AUTHOR}/items`,
    `followers/${AUTHOR}/users`,
  ];
  for (const path of collections) {
    for (const ref of await db.collection(path).listDocuments()) {
      await ref.delete();
    }
  }
  for (const id of POST_IDS) await db.doc(`activities/${id}`).delete();
}

function activityRef(id) {
  return db.collection("activities").doc(id);
}

async function writePost(id) {
  await activityRef(id).set({
    authorId: AUTHOR,
    authorName: "Alice",
    type: "run",
    visibility: "followers",
    runName: "Morning run",
    distance: 5000,
    duration: 1800,
    kudosCount: 0,
    commentCount: 0,
  });
  return activityRef(id).get();
}

/** A post, and the create trigger it fires. */
async function post(id) {
  const snap = await writePost(id);
  await onActivityCreated.run(snap, { params: { activityId: id } });
  return snap;
}

/** Delete the post as a client does, then fire the delete trigger. */
async function takeBack(id) {
  const snap = await activityRef(id).get();
  await activityRef(id).delete();
  await onActivityDeleted.run(snap, { params: { activityId: id } });
}

async function hasCopy(uid, id) {
  return (await db.doc(`feeds/${uid}/items/${id}`).get()).exists;
}

suite("a deleted post leaves every feed it was copied into", () => {
  beforeEach(async () => {
    await wipe();
    await db.doc(`followers/${AUTHOR}/users/${FOLLOWER}`).set({});
  });

  it("removes the author's, a follower's and a former follower's copy, and nothing else", async () => {
    await post("feedrm-a1");
    await post("feedrm-a2");
    await db.doc(`feeds/${FORMER}/items/feedrm-a1`).set({
      activityId: "feedrm-a1",
      authorId: AUTHOR,
      type: "run",
    });
    await db.doc(`notifications/${AUTHOR}/items/feedrm-n1`).set({
      type: "kudos",
      activityId: "feedrm-a1",
      fromUserId: FOLLOWER,
    });
    // The fan-out half. Without it the removals below would pass against a
    // create trigger that copied nothing.
    expect(await hasCopy(AUTHOR, "feedrm-a1")).toBe(true);
    expect(await hasCopy(FOLLOWER, "feedrm-a1")).toBe(true);

    await takeBack("feedrm-a1");

    expect(await hasCopy(AUTHOR, "feedrm-a1")).toBe(false);
    expect(await hasCopy(FOLLOWER, "feedrm-a1")).toBe(false);
    expect(await hasCopy(FORMER, "feedrm-a1")).toBe(false);
    // Another post's copies, and a notification about this one, stay.
    expect(await hasCopy(AUTHOR, "feedrm-a2")).toBe(true);
    expect(await hasCopy(FOLLOWER, "feedrm-a2")).toBe(true);
    expect(
      (await db.doc(`notifications/${AUTHOR}/items/feedrm-n1`).get()).exists
    ).toBe(true);
  });

  it("copies a post taken back before its fan-out ran into no feed", async () => {
    // Anchor: a post that stays is copied as usual under the same setup.
    await post("feedrm-b2");
    expect(await hasCopy(FOLLOWER, "feedrm-b2")).toBe(true);

    const snap = await writePost("feedrm-b1");
    // Undo lands first, and its trigger runs before the create trigger's,
    // so there is nothing for it to remove yet.
    await activityRef("feedrm-b1").delete();
    await onActivityDeleted.run(snap, { params: { activityId: "feedrm-b1" } });
    await onActivityCreated.run(snap, { params: { activityId: "feedrm-b1" } });

    expect(await hasCopy(AUTHOR, "feedrm-b1")).toBe(false);
    expect(await hasCopy(FOLLOWER, "feedrm-b1")).toBe(false);
  });

  it("is safe when the delete trigger is delivered twice", async () => {
    await post("feedrm-a1");
    expect(await hasCopy(FOLLOWER, "feedrm-a1")).toBe(true);
    const snap = await activityRef("feedrm-a1").get();
    await activityRef("feedrm-a1").delete();

    const context = { params: { activityId: "feedrm-a1" } };
    await Promise.all([
      onActivityDeleted.run(snap, context),
      onActivityDeleted.run(snap, context),
    ]);

    expect(await hasCopy(AUTHOR, "feedrm-a1")).toBe(false);
    expect(await hasCopy(FOLLOWER, "feedrm-a1")).toBe(false);
  });
});
