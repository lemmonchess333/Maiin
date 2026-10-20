/**
 * Integration: a trigger whose step fails is delivered again, and the
 * retry does only what did not land.
 *
 * The session triggers caught every side effect's failure and logged it,
 * and the social ones had no retry at all, so one contended transaction or
 * timeout lost a lifetime total, a badge, a challenge credit or a
 * notification for good. Driven through the real triggers against the
 * emulator, with one transaction made to fail once: the parts worth
 * holding (the trigger fails, the retry credits once, a stale retry is
 * dropped) only meet there.
 *
 * Gated on FIRESTORE_EMULATOR_HOST — skips in an ordinary unit run.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;
let onRunCreated;
let onFollowerCreated;

const UID = "trigger-retry-runner";
const RECIPIENT = "trigger-retry-alice";
const FOLLOWER = "trigger-retry-bob";

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  const idx = require("../../index");
  onRunCreated = idx.onRunCreated;
  onFollowerCreated = idx.onFollowerCreated;
  db = require("firebase-admin").firestore();
});

/**
 * Fail the first transaction that touches a document under `prefix`, once,
 * as a contended or timed-out commit does. Every other transaction runs.
 */
function failOnceAt(prefix) {
  const run = db.runTransaction.bind(db);
  let armed = true;
  const touches = (ref) => {
    if (
      armed &&
      ref &&
      typeof ref.path === "string" &&
      ref.path.startsWith(prefix)
    ) {
      armed = false;
      throw new Error("deadline exceeded");
    }
  };
  return vi.spyOn(db, "runTransaction").mockImplementation((update, options) =>
    run(
      (tx) =>
        update(
          new Proxy(tx, {
            get(target, prop) {
              const value = target[prop];
              if (prop !== "get" && prop !== "set") {
                return typeof value === "function" ? value.bind(target) : value;
              }
              return (ref, ...rest) => {
                touches(ref);
                return value.call(target, ref, ...rest);
              };
            },
          })
        ),
      options
    )
  );
}

async function wipe() {
  for (const path of [
    `users/${UID}/runs`,
    `users/${UID}/streaks`,
    `users/${UID}/public`,
    `users/${UID}/lifetime`,
    `notifications/${RECIPIENT}/items`,
    `followers/${RECIPIENT}/users`,
  ]) {
    for (const ref of await db.collection(path).listDocuments()) {
      await ref.delete();
    }
  }
  for (const path of [
    `users/${UID}`,
    `users/${RECIPIENT}`,
    `users/${FOLLOWER}/public/profile`,
  ]) {
    await db.doc(path).delete();
  }
}

async function earnedBadgeIds() {
  const snap = await db.doc(`users/${UID}/streaks/data`).get();
  return ((snap.exists && snap.data().badges) || [])
    .filter((b) => b && b.earnedAt)
    .map((b) => b.id);
}

async function lifetimeRunMeters() {
  const snap = await db.doc(`users/${UID}/lifetime/totals`).get();
  return snap.exists ? snap.data().runMeters : undefined;
}

suite("a trigger whose step fails is delivered again", () => {
  let spy;
  beforeEach(async () => {
    await wipe();
  });
  afterEach(() => spy && spy.mockRestore());

  async function saveRun() {
    const ref = db.doc(`users/${UID}/runs/r1`);
    await ref.set({ date: "2026-08-05", distance: 5200, duration: 1600 });
    return ref.get();
  }

  it("fails a run whose lifetime total did not land, and the retry credits it once", async () => {
    const snap = await saveRun();
    const context = { params: { uid: UID, runId: "r1" } };
    spy = failOnceAt(`users/${UID}/lifetime/`);

    // Before: the failure was logged and the trigger resolved, so the
    // platform never delivered it again and the 5.2 km never counted.
    await expect(onRunCreated.run(snap, context)).rejects.toThrow(
      "lifetime distance failed"
    );
    // The steps around it still ran.
    expect(await earnedBadgeIds()).toEqual(["first_5k"]);
    expect(await lifetimeRunMeters()).toBeUndefined();

    await onRunCreated.run(snap, context);
    expect(await lifetimeRunMeters()).toBe(5200);
    // A further delivery changes nothing.
    await onRunCreated.run(snap, context);
    expect(await lifetimeRunMeters()).toBe(5200);
    expect(await earnedBadgeIds()).toEqual(["first_5k"]);
  });

  it("drops a retry of an event older than the window, writing nothing", async () => {
    const snap = await saveRun();
    const dayAndAHalfAgo = new Date(Date.now() - 36 * 60 * 60 * 1000);
    await onRunCreated.run(snap, {
      params: { uid: UID, runId: "r1" },
      timestamp: dayAndAHalfAgo.toISOString(),
    });
    expect(await lifetimeRunMeters()).toBeUndefined();
    expect(await earnedBadgeIds()).toEqual([]);
  });

  it("retries a follower notification that failed, in one row", async () => {
    await db
      .doc(`users/${RECIPIENT}`)
      .set({ notificationPreferences: { follows: true } });
    await db
      .doc(`users/${FOLLOWER}/public/profile`)
      .set({ displayName: "Bob" });
    const ref = db.doc(`followers/${RECIPIENT}/users/${FOLLOWER}`);
    await ref.set({ followedAt: new Date() });
    const snap = await ref.get();
    const context = { params: { uid: RECIPIENT, followerUid: FOLLOWER } };
    spy = failOnceAt(`notifications/${RECIPIENT}/`);

    // Before: no failurePolicy, and the failure was caught, so Alice was
    // never told.
    await expect(onFollowerCreated.run(snap, context)).rejects.toThrow(
      "deadline exceeded"
    );
    await onFollowerCreated.run(snap, context);

    const rows = await db.collection(`notifications/${RECIPIENT}/items`).get();
    expect(rows.docs.map((d) => d.id)).toEqual([`follow_${FOLLOWER}`]);
  });
});
