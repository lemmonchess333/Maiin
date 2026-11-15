// Pushes from people (App1 Q18), driven through the tray row's trigger and
// the props bundle in index.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const pushTokenOwnership = require("../lib/pushTokenOwnership");
const deletion = require("../lib/accountDeletionLocks");
const fns = require("../index");
const admin = require("../lib/adminSdk");
const { millisOf } = require("../lib/socialPush");
const db = admin.firestore();

const TO = "push-recipient";
const FROM = "push-sender";
const ITEM = `notifications/${TO}/items/n1`;
const BUNDLE = `users/${TO}/settings/propsBundle`;
const NOON = admin.firestore.Timestamp.fromDate(
  new Date("2026-11-14T12:00:00Z")
);

let firestore;
let send;

function seed(extra = {}) {
  firestore = memoryFirestore({
    [`users/${TO}`]: { timezone: "Europe/London" },
    [`users/${TO}/settings/push`]: { enabled: true },
    ...extra,
  });
  vi.spyOn(db, "doc").mockImplementation(firestore.doc);
  vi.spyOn(db, "collection").mockImplementation(firestore.collection);
  vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-14T12:00:30Z"), toFake: ["Date"] });
  seed();
  send = vi.fn(async ({ tokens }) => ({
    successCount: tokens.length,
    responses: tokens.map(() => ({ success: true })),
  }));
  Object.defineProperty(admin, "messaging", {
    configurable: true,
    value: () => ({ sendEachForMulticast: send }),
  });
  vi.spyOn(pushTokenOwnership, "loadClaimedRegistrations").mockResolvedValue([
    { token: "fcm-token", hash: "hash", bindingId: "binding" },
  ]);
  vi.spyOn(pushTokenOwnership, "acquireSendLease").mockResolvedValue({
    leaseId: "lease",
  });
  vi.spyOn(pushTokenOwnership, "releaseSendLease").mockResolvedValue();
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
});

afterEach(() => {
  delete admin.messaging;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** A tray row written, as createNotification writes it. `redeliver`
 *  hands the trigger the same event again, with the row as it is now. */
async function write(row, before = null, path = ITEM, redeliver = false) {
  const item = { fromUserId: FROM, read: false, createdAt: NOON, ...row };
  if (!redeliver) firestore.data.set(path, item);
  const change = {
    before: { exists: !!before, data: () => before },
    after: { exists: true, data: () => item, ref: firestore.doc(path) },
  };
  return fns._handleNotificationItemWrite(change, {
    params: { uid: TO, itemId: path.split("/").at(-1) },
  });
}

const comment = {
  type: "comment",
  activityId: "act1",
  fromName: "Maya",
  message: "Maya commented on your activity",
};

describe("a push as the row is written", () => {
  it("sends a comment once, with its sentence and the post to open", async () => {
    await write(comment);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].data).toMatchObject({
      type: "social",
      kind: "comment",
      title: "New comment",
      body: "Maya commented on your activity",
      route: "/activity/act1?comments=1",
      ownerUid: TO,
    });
    expect(send.mock.calls[0][0].apns.payload.aps.sound).toBe("default");
    // The same event again (a retry): nothing more.
    await write(comment, null, ITEM, true);
    expect(send).toHaveBeenCalledTimes(1);
    // A read, or a name carried over: no new notice.
    await write({ ...comment, read: true }, { ...comment, createdAt: NOON });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing across a block, from a restricted sender, or for a switch turned off", async () => {
    seed({ [`blocks/${TO}/users/${FROM}`]: { at: 1 } });
    await write(comment);
    seed({ [`blocks/${FROM}/users/${TO}`]: { at: 1 } });
    await write(comment);
    seed({ [`globalRestrictedUids/${FROM}`]: { at: 1 } });
    await write(comment);
    seed({
      [`users/${TO}`]: {
        timezone: "Europe/London",
        notificationPreferences: { comments: false },
      },
    });
    await write(comment);
    seed({ [`users/${TO}/settings/push`]: { enabled: false } });
    await write(comment);
    expect(send).not.toHaveBeenCalled();
    // Anchored: with none of those, it goes.
    seed();
    await write(comment);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("never pushes a person's own act, or a kind that is not pushed", async () => {
    await write({ ...comment, fromUserId: TO });
    await write({ type: "follow", message: "Maya started following you" });
    await write({ type: "space_post_like", message: "Maya gave props" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a league result from the league, and goes quietly at night", async () => {
    vi.setSystemTime(new Date("2026-11-16T23:30:00Z"));
    await write({
      type: "league_result",
      fromUserId: "tropos-leagues",
      message: "You finished 3rd of 18",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.data).toMatchObject({ route: "/league", silent: "1" });
    expect(message.apns.payload.aps).toMatchObject({
      "interruption-level": "passive",
    });
    expect(message.apns.payload.aps.sound).toBeUndefined();
  });
});

describe("props, once a day", () => {
  it("gathers props into the bundle due at 19:00, and sends it once", async () => {
    await write(
      { type: "kudos", activityId: "act1", fromName: "Maya" },
      null,
      `notifications/${TO}/items/kudos_act1_${FROM}`
    );
    firestore.data.set(`users/sam`, {});
    await write(
      { type: "kudos", activityId: "act1", fromUserId: "sam", fromName: "Sam" },
      null,
      `notifications/${TO}/items/kudos_act1_sam`
    );
    expect(send).not.toHaveBeenCalled();
    const bundle = firestore.data.get(BUNDLE);
    expect(bundle.entries).toHaveLength(2);
    expect(new Date(millisOf(bundle.propsBundleDueAt)).toISOString()).toBe(
      "2026-11-14T19:00:00.000Z"
    );

    firestore.data.set("activities/act1", { type: "run" });
    // Not yet due: nothing.
    expect(
      await fns._sendPropsBundle(
        firestore.doc(BUNDLE),
        new Date("2026-11-14T18:00:00Z")
      )
    ).toBe(false);
    const at7 = new Date("2026-11-14T19:00:00Z");
    expect(await fns._sendPropsBundle(firestore.doc(BUNDLE), at7)).toBe(true);
    expect(send.mock.calls[0][0].data).toMatchObject({
      kind: "kudos",
      title: "Props",
      body: "2 people gave props to your run",
      route: "/activity/act1",
    });
    expect(firestore.data.has(BUNDLE)).toBe(false);
    expect(await fns._sendPropsBundle(firestore.doc(BUNDLE), at7)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("leaves out props from someone blocked since", async () => {
    await write(
      { type: "kudos", activityId: "act1", fromName: "Maya" },
      null,
      `notifications/${TO}/items/kudos_act1_${FROM}`
    );
    firestore.data.set(`blocks/${TO}/users/${FROM}`, { at: 1 });
    expect(
      await fns._sendPropsBundle(
        firestore.doc(BUNDLE),
        new Date("2026-11-14T19:00:00Z")
      )
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
