import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { createServer } from "node:http";

const require = createRequire(import.meta.url);
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST;
const suite = enabled ? describe : describe.skip;
let server, base, db, token, unverifiedToken, uid, admin;
const activityId = "security-boundary-activity";
const postId = "security-boundary-post";

suite("comment HTTP boundary with emulator identities", () => {
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
    const handlers = require("../../index");
    admin = require("firebase-admin");
    db = admin.firestore();
    const express = require("express");
    const app = express();
    app.use(express.json());
    for (const name of ["addCommentCallable", "addSpacePostCommentCallable"])
      app.post(`/${name}`, handlers[name]);
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    const authUrl = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:`;
    const credentials = {
      email: `security-${Date.now()}@example.test`,
      password: "Synthetic-audit-only-123",
      returnSecureToken: true,
    };
    const signedUp = await fetch(`${authUrl}signUp?key=emulator-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    }).then((r) => r.json());
    uid = signedUp.localId;
    unverifiedToken = signedUp.idToken;
    await admin.auth().updateUser(uid, { emailVerified: true });
    const signedIn = await fetch(
      `${authUrl}signInWithPassword?key=emulator-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      }
    ).then((r) => r.json());
    token = signedIn.idToken;
    expect(typeof token).toBe("string");
    // Own posts avoid push/notification side effects. Fixtures alone use Admin.
    await db
      .doc(`activities/${activityId}`)
      .set({ authorId: uid, visibility: "public", commentCount: 0 });
    await db
      .doc(`spaces/runners/posts/${postId}`)
      .set({ authorId: uid, commentCount: 0 });
  });

  afterAll(async () => {
    if (db) {
      await db.recursiveDelete(db.doc(`comments/${activityId}`));
      await db.doc(`activities/${activityId}`).delete();
      await db.recursiveDelete(db.doc(`spaces/runners/posts/${postId}`));
      if (uid) await admin.auth().deleteUser(uid);
    }
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  async function call(name, data, bearer = token) {
    const response = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify({ data }),
    });
    return { status: response.status, body: await response.json() };
  }

  const targets = [
    ["addCommentCallable", { activityId }, `comments/${activityId}/items`],
    [
      "addSpacePostCommentCallable",
      { spaceId: "runners", postId },
      `spaces/runners/posts/${postId}/comments`,
    ],
  ];

  it.each(targets)(
    "%s rejects missing and invalid authentication",
    async (name, target, path) => {
      const before = (await db.collection(path).get()).size;
      for (const bearer of [null, "invalid-token"]) {
        expect(
          await call(
            name,
            { ...target, text: "Synthetic", authorName: "Audit" },
            bearer
          )
        ).toMatchObject({
          status: 401,
          body: { error: { status: "UNAUTHENTICATED" } },
        });
      }
      expect((await db.collection(path).get()).size).toBe(before);
    }
  );

  it.each(targets)(
    "%s binds authorship to the token and drops an untrusted avatar",
    async (name, target, path) => {
      const response = await call(name, {
        ...target,
        text: "Synthetic",
        authorId: "another-user",
        uid: "another-user",
        authorName: "Audit",
        authorPhotoURL: "https://tracker.example.test/pixel",
      });
      expect(response.status).toBe(200);
      const saved = await db
        .doc(`${path}/${response.body.result.commentId}`)
        .get();
      expect(saved.data().authorId).toBe(uid);
      expect(saved.data()).not.toHaveProperty("authorPhotoURL");
    }
  );

  it.each(targets)(
    "%s preserves a supported avatar",
    async (name, target, path) => {
      const authorPhotoURL =
        "https://firebasestorage.googleapis.com/v0/b/demo-tropos.appspot.com/o/profile-photos%2Fa.jpg?alt=media";
      const response = await call(name, {
        ...target,
        text: "Synthetic",
        authorName: "Audit",
        authorPhotoURL,
      });
      expect(response.status).toBe(200);
      const saved = await db
        .doc(`${path}/${response.body.result.commentId}`)
        .get();
      expect(saved.data().authorPhotoURL).toBe(authorPhotoURL);
    }
  );

  it.each(targets)(
    "%s rejects an unverified token before writing",
    async (name, target, path) => {
      const before = (await db.collection(path).get()).size;
      expect(
        await call(
          name,
          {
            ...target,
            text: "Synthetic",
            authorName: "Audit",
            email_verified: true,
          },
          unverifiedToken
        )
      ).toMatchObject({
        status: 400,
        body: { error: { status: "FAILED_PRECONDITION" } },
      });
      expect((await db.collection(path).get()).size).toBe(before);
    }
  );

  it("refuses another account's private activity without changing its counter", async () => {
    const activity = db.doc(`activities/${activityId}`);
    const before = (await activity.get()).data().commentCount;
    await activity.update({
      authorId: "security-other-account",
      visibility: "private",
    });
    try {
      expect(
        await call("addCommentCallable", {
          activityId,
          text: "Synthetic",
          authorName: "Audit",
        })
      ).toMatchObject({
        status: 400,
        body: { error: { status: "FAILED_PRECONDITION" } },
      });
      expect((await activity.get()).data().commentCount).toBe(before);
    } finally {
      await activity.update({ authorId: uid, visibility: "public" });
    }
  });
});
