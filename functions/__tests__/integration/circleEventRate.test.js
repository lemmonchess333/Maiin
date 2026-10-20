/**
 * Integration: a Circle event reaches the other members, a flood of them
 * does not (survey item 20).
 *
 * A member writes events straight to Firestore and each notifying one is
 * fanned out to every co-member by onGoalSpaceEventCreated. Past twenty an
 * hour in one Circle the trigger removes the event before anyone is told.
 * Driven through the real trigger against the emulator, because the count
 * is a Firestore transaction and the notice is a real write.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onGoalSpaceEventCreated;

const SPACE = "circle-rate-space";
const AUTHOR = "circle-rate-author";
const MEMBER = "circle-rate-member";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  ({ onGoalSpaceEventCreated } = require("../../index"));
  db = require("firebase-admin").firestore();
});

async function wipe() {
  await db.recursiveDelete(db.doc(`goalSpaces/${SPACE}`));
  for (const path of [`notifications/${MEMBER}/items`]) {
    for (const ref of await db.collection(path).listDocuments()) {
      await ref.delete();
    }
  }
  await db.doc(`rateLimits/${AUTHOR}_circleEvent_${SPACE}`).delete();
}

/** The author publishes an event as the client does, then the trigger runs. */
async function publish(eventId, kind = "milestone", text = "10 sessions") {
  const ref = db.doc(`goalSpaces/${SPACE}/events/${eventId}`);
  await ref.set({
    uid: AUTHOR,
    kind,
    text,
    weekKey: null,
    createdAt: Date.now(),
  });
  await onGoalSpaceEventCreated.run(await ref.get(), {
    params: { spaceId: SPACE, eventId },
  });
  return ref;
}

const notices = async () =>
  (await db.collection(`notifications/${MEMBER}/items`).get()).size;

suite("Circle events and their notices", () => {
  beforeEach(async () => {
    await wipe();
    await db.doc(`goalSpaces/${SPACE}`).set({ ownerId: AUTHOR, active: true });
    await db
      .doc(`goalSpaces/${SPACE}/members/${AUTHOR}`)
      .set({ uid: AUTHOR, displayName: "Maya", joinedAt: Date.now() });
    await db
      .doc(`goalSpaces/${SPACE}/members/${MEMBER}`)
      .set({ uid: MEMBER, displayName: "Sam", joinedAt: Date.now() });
  });

  it("a milestone reaches the other member, once", async () => {
    const ref = await publish("e1");
    expect((await ref.get()).exists).toBe(true);
    expect(await notices()).toBe(1);
  });

  it("past twenty in an hour, the event comes out and nobody is told", async () => {
    for (let i = 0; i < 20; i++) {
      // A session needs no notice, so these count without fanning out.
      // eslint-disable-next-line no-await-in-loop
      await publish(`s${i}`, "session_completed", null);
    }
    const twentyFirst = await publish("e21");
    expect((await twentyFirst.get()).exists).toBe(false);
    expect(await notices()).toBe(0);
    // The twenty before it stay.
    expect((await db.collection(`goalSpaces/${SPACE}/events`).get()).size).toBe(
      20
    );
  });

  it("the count is per Circle: another Circle is not held to this one's", async () => {
    await db.doc(`rateLimits/${AUTHOR}_circleEvent_other-circle`).set({
      timestamps: Array.from({ length: 20 }, () => Date.now()),
    });
    const ref = await publish("e1");
    expect((await ref.get()).exists).toBe(true);
    await db.doc(`rateLimits/${AUTHOR}_circleEvent_other-circle`).delete();
  });
});
