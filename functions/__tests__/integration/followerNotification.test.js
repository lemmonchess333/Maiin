/**
 * Integration: "X started following you" reaches only the people who asked
 * for it.
 *
 * S3 put new followers behind a switch that is off by default (Settings →
 * Notifications → Activity). `onFollowerCreated` is the only sender: the
 * follower writes `followers/{uid}/users/{followerUid}` from the client, and
 * the trigger hands the notification to createNotification, which reads the
 * recipient's switch.
 *
 * Driven through the real trigger against the emulator, because the parts
 * worth holding meet only there: the trigger's path and name lookup, the
 * switch read, and the fixed id that makes a re-delivery one row.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onFollowerCreated;
let onFollowRequestCreated;

const RECIPIENT = "follownotif-alice";
const FOLLOWER = "follownotif-bob";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ onFollowerCreated, onFollowRequestCreated } = require("../../index"));
  db = require("firebase-admin").firestore();
});

async function wipe() {
  for (const path of [
    `notifications/${RECIPIENT}/items`,
    `followers/${RECIPIENT}/users`,
    `followRequests/${RECIPIENT}/users`,
  ]) {
    for (const ref of await db.collection(path).listDocuments()) {
      await ref.delete();
    }
  }
  await db.doc(`users/${RECIPIENT}`).delete();
  await db.doc(`users/${FOLLOWER}/public/profile`).delete();
}

/** Bob follows Alice as the client does, then the trigger runs. An
 *  accepted request is written by Alice, with `fromRequest`. */
async function follow(edge = {}) {
  const ref = db.doc(`followers/${RECIPIENT}/users/${FOLLOWER}`);
  await ref.set({ followedAt: new Date(), ...edge });
  await onFollowerCreated.run(await ref.get(), {
    params: { uid: RECIPIENT, followerUid: FOLLOWER },
  });
}

/** Bob asks to follow Alice, then the trigger runs. */
async function ask() {
  const ref = db.doc(`followRequests/${RECIPIENT}/users/${FOLLOWER}`);
  await ref.set({ requestedAt: new Date() });
  await onFollowRequestCreated.run(await ref.get(), {
    params: { uid: RECIPIENT, requesterUid: FOLLOWER },
  });
}

async function items() {
  const snap = await db.collection(`notifications/${RECIPIENT}/items`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

suite("a new follower is announced only to someone who turned it on", () => {
  beforeEach(async () => {
    await wipe();
    await db
      .doc(`users/${FOLLOWER}/public/profile`)
      .set({ displayName: "Bob" });
  });

  it("writes nothing for someone who never chose (off by default)", async () => {
    await db.doc(`users/${RECIPIENT}`).set({ displayName: "Alice" });
    await follow();
    expect(await items()).toEqual([]);
  });

  it("writes nothing when the switch is off", async () => {
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { follows: false, kudos: true } });
    await follow();
    expect(await items()).toEqual([]);
  });

  it("names the follower once the switch is on, in one row however often it runs", async () => {
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { follows: true } });
    await follow();
    // A re-delivered trigger, or Bob following again after unfollowing.
    await follow();

    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `follow_${FOLLOWER}`,
      type: "follow",
      fromUserId: FOLLOWER,
      fromName: "Bob",
      message: "Bob started following you",
    });
  });
});

suite("a follow request is announced unless switched off", () => {
  beforeEach(async () => {
    await wipe();
    await db
      .doc(`users/${FOLLOWER}/public/profile`)
      .set({ displayName: "Bob" });
  });

  it("names the asker for someone who never chose (on by default), once", async () => {
    await db.doc(`users/${RECIPIENT}`).set({ displayName: "Alice" });
    await ask();
    await ask();
    const rows = await items();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `follow_request_${FOLLOWER}`,
      type: "follow_request",
      fromUserId: FOLLOWER,
      message: "Bob asked to follow you",
    });
  });

  it("writes nothing when the switch is off", async () => {
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { followRequests: false } });
    await ask();
    expect(await items()).toEqual([]);
  });

  it("an accepted request is not announced again as a new follower", async () => {
    // Alice said yes herself: "Bob started following you" would be noise,
    // even for someone who turned New followers on.
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { follows: true } });
    await follow({ fromRequest: true });
    expect(await items()).toEqual([]);
  });
});
