/**
 * Integration: a feed post whose shown text trips the word filter is made
 * private before it reaches any follower.
 *
 * Driven through the real create trigger against the emulator, so the test
 * holds what a follower ends up with, a feed copy or none, and not only
 * the filter's answer (activityModeration.test.js has that).
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

const AUTHOR = "autoflag-alice";
const FOLLOWER = "autoflag-bob";
const POST_IDS = ["autoflag-clean", "autoflag-title", "autoflag-name"];

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  onActivityCreated = require("../../index").onActivityCreated;
  db = require("firebase-admin").firestore();
});

async function wipe() {
  for (const uid of [AUTHOR, FOLLOWER]) {
    for (const ref of await db.collection(`feeds/${uid}/items`).listDocuments())
      await ref.delete();
  }
  for (const id of POST_IDS) await db.doc(`activities/${id}`).delete();
}

/** A public post as a client writes one, and the create trigger it fires. */
async function post(id, fields = {}) {
  const ref = db.collection("activities").doc(id);
  await ref.set({
    authorId: AUTHOR,
    authorName: "Alice",
    type: "run",
    visibility: "public",
    runName: "Morning run",
    activityTitle: "Morning run",
    distance: 5000,
    duration: 1800,
    avgPace: 360,
    kudosCount: 0,
    commentCount: 0,
    ...fields,
  });
  await onActivityCreated.run(await ref.get(), { params: { activityId: id } });
  return (await ref.get()).data();
}

async function followerHasCopy(id) {
  return (await db.doc(`feeds/${FOLLOWER}/items/${id}`).get()).exists;
}

suite("onActivityCreated reads every text a feed card shows", () => {
  beforeEach(async () => {
    await wipe();
    await db.doc(`followers/${AUTHOR}/users/${FOLLOWER}`).set({});
  });

  it("fans out a clean post", async () => {
    const after = await post("autoflag-clean");
    expect(after.visibility).toBe("public");
    expect(after.flagged).toBeUndefined();
    expect(await followerHasCopy("autoflag-clean")).toBe(true);
  });

  it.each([
    ["autoflag-title", { activityTitle: "shit head" }, "activityTitle"],
    ["autoflag-name", { authorName: "shit head" }, "authorName"],
  ])("flags %s and keeps it from followers", async (id, fields, field) => {
    const after = await post(id, fields);
    expect(after).toMatchObject({
      flagged: true,
      autoFlagged: true,
      flaggedField: field,
      visibility: "private",
    });
    expect(await followerHasCopy(id)).toBe(false);
  });
});
