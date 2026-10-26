/**
 * Integration: "X started following you" reaches only the people who asked
 * for it, and "X accepted your follow request" reaches the person who asked.
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
    `notifications/${FOLLOWER}/items`,
    `followers/${RECIPIENT}/users`,
    `followRequests/${RECIPIENT}/users`,
  ]) {
    for (const ref of await db.collection(path).listDocuments()) {
      await ref.delete();
    }
  }
  await db.doc(`users/${RECIPIENT}`).delete();
  await db.doc(`users/${FOLLOWER}`).delete();
  await db.doc(`users/${RECIPIENT}/public/profile`).delete();
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

async function items(uid = RECIPIENT) {
  const snap = await db.collection(`notifications/${uid}/items`).get();
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

suite.each([
  {
    type: "follow",
    collection: "followers",
    param: "followerUid",
    handler: () => onFollowerCreated,
  },
  {
    type: "follow_request",
    collection: "followRequests",
    param: "requesterUid",
    handler: () => onFollowRequestCreated,
  },
])("$type source-event delivery", ({ type, collection, param, handler }) => {
  beforeEach(async () => {
    await wipe();
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { follows: true } });
    await db
      .doc(`users/${FOLLOWER}/public/profile`)
      .set({ displayName: "Bob" });
  });

  const notice = () =>
    db.doc(`notifications/${RECIPIENT}/items/${type}_${FOLLOWER}`);
  const source = () => db.doc(`${collection}/${RECIPIENT}/users/${FOLLOWER}`);
  const deliver = (snapshot, eventId) =>
    handler().run(snapshot, {
      eventId,
      params: { uid: RECIPIENT, [param]: FOLLOWER },
    });

  it("preserves delivery time and TTL on same-event redelivery", async () => {
    await source().create({});
    const snapshot = await source().get();
    await deliver(snapshot, "first-source-event");
    const original = await notice().get();

    await deliver(snapshot, "first-source-event");

    const repeated = await notice().get();
    expect(repeated.data()).toEqual(original.data());
    expect(repeated.updateTime.isEqual(original.updateTime)).toBe(true);
  });

  it("commits only one notification write for concurrent same-event deliveries", async () => {
    await source().create({});
    const snapshot = await source().get();

    await Promise.all(
      Array.from({ length: 8 }, () => deliver(snapshot, "concurrent-event"))
    );

    const result = await notice().get();
    expect(result.exists).toBe(true);
    expect(result.createTime.isEqual(result.updateTime)).toBe(true);
    expect(await items()).toHaveLength(1);
  });

  it("refreshes a new source but never lets an older source overwrite it afterwards", async () => {
    await source().create({});
    const first = await source().get();
    await deliver(first, "source-A");
    const initial = await notice().get();
    await source().delete();
    await source().create({});
    const next = await source().get();
    await deliver(next, "source-B");
    const newest = await notice().get();
    expect(newest.updateTime.isEqual(initial.updateTime)).toBe(false);

    await deliver(first, "source-A");

    const result = await notice().get();
    expect(result.data()).toEqual(newest.data());
    expect(result.updateTime.isEqual(newest.updateTime)).toBe(true);
    expect(await items()).toHaveLength(1);
  });
});

suite("the person who asked hears that they were accepted", () => {
  beforeEach(async () => {
    await wipe();
    await db
      .doc(`users/${RECIPIENT}/public/profile`)
      .set({ displayName: "Alice" });
    await db
      .doc(`users/${FOLLOWER}/public/profile`)
      .set({ displayName: "Bob" });
  });

  it("names who said yes, on by default, in one row however often it runs", async () => {
    await db.doc(`users/${FOLLOWER}`).set({ displayName: "Bob" });
    await follow({ fromRequest: true });
    await follow({ fromRequest: true });
    const rows = await items(FOLLOWER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: `follow_accepted_${RECIPIENT}`,
      type: "follow_accepted",
      fromUserId: RECIPIENT,
      fromName: "Alice",
      message: "Alice accepted your follow request",
    });
  });

  it("writes nothing when the asker switched follow requests off", async () => {
    await db
      .doc(`users/${FOLLOWER}`)
      .set({ notificationPreferences: { followRequests: false } });
    await follow({ fromRequest: true });
    expect(await items(FOLLOWER)).toEqual([]);
  });

  it("a direct follow tells the follower nothing", async () => {
    await db.doc(`users/${FOLLOWER}`).set({ displayName: "Bob" });
    await follow();
    expect(await items(FOLLOWER)).toEqual([]);
  });
});
