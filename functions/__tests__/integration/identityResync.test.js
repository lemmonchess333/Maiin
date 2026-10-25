/**
 * Integration: a new public name or photo reaches the copies other people
 * read, through the real onPublicProfileIdentityChanged trigger against
 * the emulator.
 *
 * Driven here, not only in memory, because the parts worth holding meet
 * only in Firestore: the activities query (authorId, visibility in, a
 * createdAt range), the `items` group read ordered by `text`, which leaves
 * out feed copies, the `items` group read by fromUserId and a createdAt
 * range, which finds notifications and no comment or feed copy, the
 * challenge read with `select()`, FieldValue.delete inside the
 * transaction, and the trigger's own gates.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onPublicProfileIdentityChanged;

const UID = "identity-resync-alice";
const OTHER = "identity-resync-bob";
const OLD_PHOTO = "https://firebasestorage.googleapis.com/v0/b/x/o/old.jpg";
const NEW_PHOTO = "https://firebasestorage.googleapis.com/v0/b/x/o/new.jpg";
const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY);

const PATHS = {
  profile: `users/${UID}/public/profile`,
  activity: `activities/${UID}-a1`,
  oldActivity: `activities/${UID}-a2`,
  comment: `comments/${OTHER}-b1/items/${UID}-c1`,
  feedCopy: `feeds/${OTHER}/items/${UID}-a1`,
  post: `spaces/runners/posts/${UID}-p1`,
  postComment: `spaces/runners/posts/${UID}-p2/comments/${UID}-k1`,
  spaceMember: `spaces/runners/members/${UID}`,
  circleMember: `goalSpaces/${UID}-g1/members/${UID}`,
  challenge: `challenges/${UID}-now`,
  participant: `challenges/${UID}-now/participants/${UID}`,
  notification: `notifications/${OTHER}/items/${UID}-n1`,
  oldNotification: `notifications/${OTHER}/items/${UID}-n2`,
  deletion: `accountDeletionRequests/${UID}`,
  restriction: `globalRestrictedUids/${UID}`,
};

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ onPublicProfileIdentityChanged } = require("../../index"));
  db = require("firebase-admin").firestore();
});

async function seed() {
  for (const path of Object.values(PATHS)) await db.doc(path).delete();
  const old = { authorName: "Alice Old", authorPhotoURL: OLD_PHOTO };
  await Promise.all([
    db
      .doc(PATHS.profile)
      .set({ displayName: "Alice Old", photoURL: OLD_PHOTO }),
    db.doc(PATHS.activity).set({
      authorId: UID,
      visibility: "followers",
      createdAt: ago(1),
      ...old,
    }),
    db.doc(PATHS.oldActivity).set({
      authorId: UID,
      visibility: "public",
      createdAt: ago(120),
      ...old,
    }),
    db.doc(PATHS.comment).set({
      authorId: UID,
      text: "Nice one",
      createdAt: ago(2),
      ...old,
    }),
    db.doc(PATHS.feedCopy).set({
      schemaVersion: 2,
      activityId: `${UID}-a1`,
      authorId: UID,
      createdAt: ago(1),
    }),
    db.doc(PATHS.post).set({
      authorId: UID,
      body: "Long run",
      createdAt: ago(3),
      ...old,
    }),
    db.doc(PATHS.postComment).set({
      authorId: UID,
      text: "Same",
      createdAt: ago(4),
      ...old,
    }),
    db.doc(PATHS.spaceMember).set({
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
    }),
    db.doc(PATHS.circleMember).set({
      uid: UID,
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
      role: "member",
    }),
    db.doc(PATHS.challenge).set({ endDate: new Date(Date.now() + 5 * DAY) }),
    db.doc(PATHS.participant).set({
      displayName: "Alice Old",
      photoURL: OLD_PHOTO,
      currentValue: 3,
    }),
    // Props she gave Bob this week, and some from months ago.
    db.doc(PATHS.notification).set({
      type: "kudos",
      fromUserId: UID,
      fromName: "Alice Old",
      message: "Alice Old gave you props",
      read: false,
      createdAt: ago(2),
    }),
    db.doc(PATHS.oldNotification).set({
      type: "kudos",
      fromUserId: UID,
      fromName: "Alice Old",
      message: "Alice Old gave you props",
      read: false,
      createdAt: ago(120),
    }),
  ]);
}

/** Writes the profile as the Settings name field does, then runs the
 *  trigger on that write. */
async function editProfile(patch) {
  const ref = db.doc(PATHS.profile);
  const before = await ref.get();
  await ref.set(patch, { merge: true });
  const after = await ref.get();
  await onPublicProfileIdentityChanged.run(
    { before, after },
    {
      params: { uid: UID, docId: "profile" },
      timestamp: new Date().toISOString(),
    }
  );
}

const read = async (key) => (await db.doc(PATHS[key]).get()).data();

suite("a new name and photo reach the copies other people read", () => {
  // A first write to a cold emulator can take longer than the default.
  beforeEach(seed, 30_000);

  it("carries both to her recent posts, comments and memberships", async () => {
    await editProfile({ displayName: "Alice New", photoURL: NEW_PHOTO });
    for (const key of ["activity", "comment", "post", "postComment"]) {
      expect(await read(key), key).toMatchObject({
        authorName: "Alice New",
        authorPhotoURL: NEW_PHOTO,
      });
    }
    for (const key of ["spaceMember", "circleMember", "participant"]) {
      expect(await read(key), key).toMatchObject({
        displayName: "Alice New",
        photoURL: NEW_PHOTO,
      });
    }
    expect((await read("oldActivity")).authorName).toBe("Alice Old");
    expect(await read("feedCopy")).not.toHaveProperty("authorName");
    expect((await read("participant")).currentValue).toBe(3);
  });

  it("carries her new name into the notifications she sent this season", async () => {
    await editProfile({ displayName: "Alice New" });
    expect(await read("notification")).toMatchObject({
      fromName: "Alice New",
      message: "Alice New gave you props",
      read: false,
    });
    expect(await read("oldNotification")).toMatchObject({
      fromName: "Alice Old",
      message: "Alice Old gave you props",
    });
    // The same group read touched neither her comment's text nor the feed
    // copy: neither carries a fromUserId.
    expect((await read("comment")).text).toBe("Nice one");
    expect(await read("feedCopy")).not.toHaveProperty("fromName");
  });

  it("a removed photo is deleted from the copies that leave it out", async () => {
    const { FieldValue } = require("firebase-admin/firestore");
    await editProfile({ photoURL: FieldValue.delete() });
    expect(await read("activity")).not.toHaveProperty("authorPhotoURL");
    expect(await read("spaceMember")).not.toHaveProperty("photoURL");
    expect((await read("circleMember")).photoURL).toBeNull();
    // The name did not change, so it was not written.
    expect((await read("activity")).authorName).toBe("Alice Old");
  });

  it("a refused name is not carried", async () => {
    await editProfile({ displayName: "shit head" });
    expect((await read("activity")).authorName).toBe("Alice Old");
  });

  it("an account being deleted is left alone", async () => {
    await db.doc(PATHS.deletion).set({ status: "running" });
    await editProfile({ displayName: "Alice New" });
    expect((await read("activity")).authorName).toBe("Alice Old");
    await db.doc(PATHS.deletion).delete();
  });

  it("a restricted account's new name reaches no one", async () => {
    await db.doc(PATHS.restriction).set({ at: Date.now() });
    await editProfile({ displayName: "Alice New" });
    expect((await read("comment")).authorName).toBe("Alice Old");
    expect((await read("notification")).fromName).toBe("Alice Old");
    await db.doc(PATHS.restriction).delete();
  });

  it("a write that changes neither runs nothing", async () => {
    await editProfile({ currentStreak: 4 });
    expect((await read("activity")).authorName).toBe("Alice Old");
  });
});
