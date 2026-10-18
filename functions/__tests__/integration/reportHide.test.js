/**
 * The moderation queue's Hide content, against the Firestore and Auth
 * emulators, read back by a third account through the rules.
 *
 * ../reportCallables.test.js pins resolveReport's writes on the in-memory
 * double, where a count change is stored as an `{ increment: -1 }` marker
 * and nothing applies the rules. Here the real handler runs on a real
 * database, and a signed-in account that is neither the author nor the
 * reporter reads what is left over the emulator's REST API, as the app's
 * client would: the reported Space comment, activity comment and Space post
 * are gone, and the post's and the activity's commentCount are each one
 * lower.
 *
 * Gated on both emulator hosts, as ./commentBoundary.test.js is.
 *
 * To run locally:
 *   firebase emulators:exec --only auth,firestore --project demo-tropos \
 *     'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *      FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *      GCLOUD_PROJECT=demo-tropos npm test --prefix functions'
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST;
const suite = enabled ? describe : describe.skip;

const RUN = Date.now();
const ADMIN = { auth: { uid: `moderator-${RUN}`, token: {} } };
const SPACE = "runners";
const POST = `hide-comment-post-${RUN}`;
const REPORTED_POST = `hide-post-${RUN}`;
const ACTIVITY = `hide-activity-${RUN}`;

let admin, db, resolveReport, reader, readerUid, previousAdminUids;

/** A document or collection as the reading account gets it. */
async function read(path, token = reader) {
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-tropos/databases/(default)/documents/${path}`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  );
  return { status: response.status, body: await response.json() };
}

async function ids(collectionPath) {
  const { status, body } = await read(collectionPath);
  expect(status).toBe(200);
  return (body.documents || []).map((d) => d.name.split("/").at(-1)).sort();
}

async function commentCount(docPath) {
  const { status, body } = await read(docPath);
  expect(status).toBe(200);
  return Number(body.fields.commentCount.integerValue);
}

function comment(authorId, text) {
  return {
    authorId,
    authorName: authorId,
    text,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/** A pending report and its authority, as createReport commits them. */
async function report(id, targetType, targetId, targetUid) {
  const { serverTimestamp } = admin.firestore.FieldValue;
  await db.doc(`reports/${id}`).set({
    reporterId: `reporter-${RUN}`,
    targetType,
    targetId,
    targetUid,
    reason: "harassment",
    category: "harassment",
    hideFromFeed: false,
    blockAuthor: false,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  await db.doc(`reportAuthority/${id}`).set({
    version: 1,
    targetType,
    targetId,
    targetUid,
    issuedAt: serverTimestamp(),
  });
  return id;
}

suite("resolveReport Hide content — what a third account reads after", () => {
  beforeAll(async () => {
    for (const host of [
      process.env.FIRESTORE_EMULATOR_HOST,
      process.env.FIREBASE_AUTH_EMULATOR_HOST,
    ]) {
      if (!/^127\.0\.0\.1:\d+$/.test(host))
        throw new Error("Loopback emulators required");
    }
    if (process.env.GCLOUD_PROJECT !== "demo-tropos")
      throw new Error("Demo project required");
    ({ resolveReport } = require("../../index"));
    admin = require("firebase-admin");
    db = admin.firestore();
    previousAdminUids = process.env.ADMIN_UIDS;
    process.env.ADMIN_UIDS = ADMIN.auth.uid;

    const signedUp = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `reader-${RUN}@example.test`,
          password: "Synthetic-reader-123",
          returnSecureToken: true,
        }),
      }
    ).then((r) => r.json());
    readerUid = signedUp.localId;
    reader = signedUp.idToken;
    expect(typeof reader).toBe("string");

    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const post = (body, commentTotal) => ({
      authorId: "poster",
      authorName: "Poster",
      body,
      likeCount: 0,
      commentCount: commentTotal,
      createdAt,
    });
    const posts = `spaces/${SPACE}/posts`;
    await db.doc(`${posts}/${POST}`).set(post("Long run done.", 2));
    await db.doc(`${posts}/${POST}/comments/rude`).set(comment("troll", "x"));
    await db
      .doc(`${posts}/${POST}/comments/kind`)
      .set(comment("friend", "Nice"));
    await db.doc(`${posts}/${REPORTED_POST}`).set(post("Reported post.", 1));
    await db.doc(`${posts}/${REPORTED_POST}/likes/friend`).set({ createdAt });
    await db
      .doc(`${posts}/${REPORTED_POST}/comments/reply`)
      .set(comment("friend", "Hm"));
    await db.doc(`activities/${ACTIVITY}`).set({
      authorId: "runner",
      authorName: "Runner",
      type: "run",
      visibility: "public",
      kudosCount: 0,
      commentCount: 2,
      createdAt,
    });
    await db.doc(`comments/${ACTIVITY}/items/rude`).set(comment("troll", "x"));
    await db
      .doc(`comments/${ACTIVITY}/items/kind`)
      .set(comment("friend", "Strong"));
  });

  afterAll(async () => {
    if (db) {
      for (const path of [
        `spaces/${SPACE}/posts/${POST}`,
        `spaces/${SPACE}/posts/${REPORTED_POST}`,
        `comments/${ACTIVITY}`,
        `activities/${ACTIVITY}`,
      ])
        await db.recursiveDelete(db.doc(path));
      for (const kind of ["space-comment", "activity-comment", "space-post"]) {
        await db.doc(`reports/${kind}-${RUN}`).delete();
        await db.doc(`reportAuthority/${kind}-${RUN}`).delete();
      }
      if (readerUid) await admin.auth().deleteUser(readerUid);
    }
    if (previousAdminUids === undefined) delete process.env.ADMIN_UIDS;
    else process.env.ADMIN_UIDS = previousAdminUids;
  });

  it("reads through the rules, not as an admin", async () => {
    expect((await read(`activities/${ACTIVITY}`, null)).status).toBe(403);
  });

  it("removes a Space comment and takes one off the post's count", async () => {
    const comments = `spaces/${SPACE}/posts/${POST}/comments`;
    expect(await ids(comments)).toEqual(["kind", "rude"]);
    const id = await report(
      `space-comment-${RUN}`,
      "space_post_comment",
      `${SPACE}:${POST}:rude`,
      "troll"
    );

    await resolveReport.run({ reportId: id, hideActivity: true }, ADMIN);

    expect(await ids(comments)).toEqual(["kind"]);
    expect(await commentCount(`spaces/${SPACE}/posts/${POST}`)).toBe(1);
  });

  it("removes an activity comment and takes one off the activity's count", async () => {
    const comments = `comments/${ACTIVITY}/items`;
    expect(await ids(comments)).toEqual(["kind", "rude"]);
    const id = await report(
      `activity-comment-${RUN}`,
      "comment",
      `${ACTIVITY}:rude`,
      "troll"
    );

    await resolveReport.run({ reportId: id, hideActivity: true }, ADMIN);

    expect(await ids(comments)).toEqual(["kind"]);
    expect(await commentCount(`activities/${ACTIVITY}`)).toBe(1);
  });

  it("removes a Space post with its likes and comments", async () => {
    const path = `spaces/${SPACE}/posts/${REPORTED_POST}`;
    expect((await read(path)).status).toBe(200);
    const id = await report(
      `space-post-${RUN}`,
      "space_post",
      `${SPACE}:${REPORTED_POST}`,
      "poster"
    );

    await resolveReport.run({ reportId: id, hideActivity: true }, ADMIN);

    expect((await read(path)).status).toBe(404);
    expect(await ids(`${path}/likes`)).toEqual([]);
    expect(await ids(`${path}/comments`)).toEqual([]);
    // Only that post: its neighbour in the space stays.
    expect((await read(`spaces/${SPACE}/posts/${POST}`)).status).toBe(200);
  });
});
