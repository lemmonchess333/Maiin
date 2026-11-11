import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const deletion = require("../lib/accountDeletionLocks");
const { createNotification, notificationSourceEvent } = require("../lib/socialFanout");
const { onFollowerCreated, onFollowRequestCreated, onGoalSpaceEventCreated } = require("../index");
const admin = require("firebase-admin");
const db = admin.firestore();
const TO = "notification-recipient";
const FROM = "notification-author";
const SECONDS = Math.floor(Date.now() / 1000);
const firstTime = { seconds: SECONDS, nanoseconds: 123_001_000 };
const nextTime = { seconds: SECONDS, nanoseconds: 123_002_000 };
let firestore;
let deliveryTime;

beforeEach(() => {
  firestore = memoryFirestore({
    [`users/${TO}`]: { notificationPreferences: { follows: true } },
    [`users/${FROM}`]: {},
    [`users/${FROM}/public/profile`]: { displayName: "Maya" },
    [`goalSpaces/circle/members/${FROM}`]: { uid: FROM, displayName: "Maya" },
    [`goalSpaces/circle/members/${TO}`]: { uid: TO, displayName: "Sam" },
  });
  vi.spyOn(db, "doc").mockImplementation(firestore.doc);
  vi.spyOn(db, "collection").mockImplementation(firestore.collection);
  vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
  deliveryTime = { seconds: SECONDS + 10, nanoseconds: 0 };
  vi.spyOn(admin.firestore.FieldValue, "serverTimestamp").mockImplementation(() => deliveryTime);
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

function source(path, data, createTime) {
  firestore.data.set(path, data);
  return { exists: true, ref: firestore.doc(path), createTime, data: () => data };
}

const senders = [
  {
    name: "follower", id: `follow_${FROM}`,
    deliver: (eventId, createTime) => onFollowerCreated.run(
      source(`followers/${TO}/users/${FROM}`, {}, createTime),
      { eventId, params: { uid: TO, followerUid: FROM } }
    ),
  },
  {
    name: "follow request", id: `follow_request_${FROM}`,
    deliver: (eventId, createTime) => onFollowRequestCreated.run(
      source(`followRequests/${TO}/users/${FROM}`, {}, createTime),
      { eventId, params: { uid: TO, requesterUid: FROM } }
    ),
  },
  {
    name: "Circle event", id: "circle_milestone",
    deliver: (eventId, createTime) => onGoalSpaceEventCreated.run(
      source("goalSpaces/circle/events/milestone", {
        uid: FROM, kind: "milestone", text: null, createdAt: Date.now(),
      }, createTime),
      { eventId, params: { spaceId: "circle", eventId: "milestone" } }
    ),
  },
];

describe.each(senders)("$name notification redelivery", ({ deliver, id }) => {
  const path = `notifications/${TO}/items/${id}`;

  it("keeps the first delivery time and seen state for the same source event", async () => {
    await deliver("source-A", firstTime);
    const original = structuredClone(firestore.data.get(path));
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };

    await deliver("source-A", firstTime);

    expect(firestore.data.get(path)).toEqual(original);
    // useNotifications counts rows newer than the last tray-open instant.
    expect(firestore.data.get(path).createdAt.seconds).toBeLessThan(SECONDS + 15);
  });

  it("refreshes a genuinely newer event even within the same millisecond", async () => {
    await deliver("source-A", firstTime);
    const original = structuredClone(firestore.data.get(path));
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };

    await deliver("source-B", nextTime);

    expect(firestore.data.get(path).createdAt).toEqual(deliveryTime);
    expect(firestore.data.get(path)).not.toEqual(original);
    expect([...firestore.data.keys()].filter((key) => key.startsWith(`notifications/${TO}/items/`))).toEqual([path]);
  });

  it("cannot resurrect an older event A after event B has refreshed the row", async () => {
    await deliver("source-A", firstTime);
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };
    await deliver("source-B", nextTime);
    const newest = structuredClone(firestore.data.get(path));
    deliveryTime = { seconds: SECONDS + 30, nanoseconds: 0 };

    await deliver("source-A", firstTime);

    expect(firestore.data.get(path)).toEqual(newest);
  });

  it("accepts a delayed new source for a legacy row even when its source time precedes delivery time", async () => {
    const original = {
      type: "follow", fromUserId: FROM, read: true,
      createdAt: { seconds: SECONDS + 5, nanoseconds: 0 },
    };
    firestore.data.set(path, original);

    await deliver("source-A", firstTime);

    expect(firestore.data.get(path).createdAt).toEqual(deliveryTime);
    expect(firestore.data.get(path)._sourceEvent).toMatchObject(firstTime);
    const receipted = structuredClone(firestore.data.get(path));
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };
    await deliver("source-A", firstTime);
    expect(firestore.data.get(path)).toEqual(receipted);
  });

  it("does not let a different event ID with the same source time bounce the row", async () => {
    await deliver("source-A", firstTime);
    const original = structuredClone(firestore.data.get(path));
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };

    await deliver("source-with-equal-time", firstTime);

    expect(firestore.data.get(path)).toEqual(original);
  });
});

describe("notification source receipts", () => {
  it("prefers the server snapshot's creation time and stores a fixed-size identity", () => {
    const receipt = notificationSourceEvent({ createTime: nextTime }, {
      eventId: "source-".repeat(1000), timestamp: "2026-10-23T01:00:00Z",
    });
    expect(receipt).toEqual({ id: expect.stringMatching(/^[a-f0-9]{64}$/), ...nextTime });
  });

  it("preserves context timestamp nanoseconds, including offset timestamps", () => {
    const context = { eventId: "context-event", timestamp: "2026-10-23T13:00:00.123456789+01:00" };
    expect(notificationSourceEvent({}, context)).toMatchObject({
      seconds: Date.parse("2026-10-23T12:00:00Z") / 1000,
      nanoseconds: 123_456_789,
    });
  });

  it("keeps incomplete legacy event context optional", () => {
    expect(notificationSourceEvent({}, {})).toBeUndefined();
    expect(notificationSourceEvent({}, { eventId: "old-caller" })).toBeUndefined();
    expect(notificationSourceEvent({}, { eventId: "old-caller", timestamp: "invalid" })).toBeUndefined();
  });

  it("preserves auto-ID callable behavior even if an event receipt is supplied", async () => {
    const args = {
      firestore, fromUid: FROM, toUid: TO, data: { type: "kudos" },
      serverTimestamp: () => deliveryTime,
      sourceEvent: notificationSourceEvent({ createTime: firstTime }, { eventId: "event" }),
    };
    await createNotification(args);
    await createNotification(args);
    const rows = [...firestore.data.entries()].filter(([path]) => path.startsWith(`notifications/${TO}/items/`));
    expect(rows).toHaveLength(2);
    expect(rows.every(([, data]) => !data._sourceEvent)).toBe(true);
  });

  it("preserves deterministic callers that have no source receipt", async () => {
    const args = {
      firestore, fromUid: FROM, toUid: TO, data: { type: "kudos" },
      serverTimestamp: () => deliveryTime, notificationId: "legacy",
    };
    await createNotification(args);
    deliveryTime = { seconds: SECONDS + 20, nanoseconds: 0 };
    await createNotification(args);
    expect(firestore.data.get(`notifications/${TO}/items/legacy`).createdAt).toEqual(deliveryTime);
  });

  it("still obeys current preferences and account deletion state before writing receipts", async () => {
    const args = {
      firestore, fromUid: FROM, toUid: TO, data: { type: "follow" },
      serverTimestamp: () => deliveryTime, notificationId: "guarded",
      sourceEvent: notificationSourceEvent({ createTime: firstTime }, { eventId: "event" }),
    };
    firestore.data.set(`users/${TO}`, { notificationPreferences: { follows: false } });
    expect(await createNotification(args)).toMatchObject({ muted: true });
    firestore.data.set(`users/${TO}`, { notificationPreferences: { follows: true } });
    firestore.data.set(`accountDeletionRequests/${TO}`, { status: "running" });
    expect(await createNotification(args)).toMatchObject({ deleting: true });
    expect(firestore.data.has(`notifications/${TO}/items/guarded`)).toBe(false);
  });
});
