import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const deletion = require("../lib/accountDeletionLocks");
const social = require("../lib/socialFanout");
const { onGoalSpaceEventCreated } = require("../index");
const db = require("firebase-admin").firestore();
const { isRateLimited } = require("../rateLimiter");
const limiter = require("../rateLimiter");
const SPACE = "retry-circle";
const AUTHOR = "retry-author";
let firestore;
const quotaPath = `rateLimits/${AUTHOR}_circleEvent_${SPACE}`;

beforeEach(() => {
  firestore = memoryFirestore({
    [`goalSpaces/${SPACE}/members/${AUTHOR}`]: {
      uid: AUTHOR,
      displayName: "Maya",
    },
    [`goalSpaces/${SPACE}/members/other`]: { uid: "other", displayName: "Sam" },
  });
  vi.spyOn(db, "collection").mockImplementation(firestore.collection);
  vi.spyOn(db, "doc").mockImplementation(firestore.doc);
  vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
  vi.spyOn(social, "createNotification").mockResolvedValue({});
});

afterEach(() => vi.restoreAllMocks());

async function createEvent(id, kind = "session_completed") {
  const ref = firestore.doc(`goalSpaces/${SPACE}/events/${id}`);
  await ref.set({ uid: AUTHOR, kind, text: null, createdAt: Date.now() });
  return ref;
}

// The trigger's onCreate data is immutable even if the live document was
// admitted or deleted since. The memory store's snapshot reads lazily, so
// capture its data now rather than accidentally handing the trigger live data.
async function capture(ref) {
  const snapshot = await ref.get();
  const data = snapshot.data();
  return { ...snapshot, data: () => data };
}

const deliver = async (ref) =>
  onGoalSpaceEventCreated.run(await capture(ref), {
    eventId: `delivery-${ref.id}`,
    params: { spaceId: SPACE, eventId: ref.id },
  });

describe("Circle event trigger redelivery", () => {
  it("does not delete an accepted event when delivered again after its hourly allowance filled", async () => {
    let first;
    for (let i = 0; i < 20; i += 1) {
      const ref = await createEvent(`event-${i}`);
      first ||= ref;
      await deliver(ref);
    }
    expect((await first.get()).exists).toBe(true);
    await deliver(first);
    expect((await first.get()).exists).toBe(true);
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(20);
  });

  it("still removes a distinct twenty-first event", async () => {
    for (let i = 0; i < 20; i += 1)
      await deliver(await createEvent(`event-${i}`));
    const extra = await createEvent("event-21", "milestone");
    await deliver(extra);
    expect((await extra.get()).exists).toBe(false);
    expect(social.createNotification).not.toHaveBeenCalled();
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(20);
  });

  it("commits denial before a concurrent redelivery can admit the event after window expiry", async () => {
    const at = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(at);
    firestore.data.set(quotaPath, {
      timestamps: Array(20).fill(at - 3_600_000 + 1),
    });
    const ref = await createEvent("boundary", "milestone");
    const original = await capture(ref);
    const context = { params: { spaceId: SPACE, eventId: ref.id } };
    let release;
    let reached;
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const firstDenied = new Promise((resolve) => {
      reached = resolve;
    });
    let pause = true;
    vi.spyOn(limiter, "isRateLimited").mockImplementation(async (...args) => {
      const denied = await isRateLimited(...args);
      if (denied && pause) {
        pause = false;
        reached();
        await hold;
      }
      return denied;
    });
    const older = onGoalSpaceEventCreated.run(original, context);
    await firstDenied;
    let existedAfterDenial;
    try {
      existedAfterDenial = (await ref.get()).exists;
      clock.mockReturnValue(at + 2);
      await onGoalSpaceEventCreated.run(original, context);
    } finally {
      release();
      await older;
    }
    expect(existedAfterDenial).toBe(false);
    expect((await ref.get()).exists).toBe(false);
    expect(social.createNotification).not.toHaveBeenCalled();
    // Expiring slots remain available to genuinely NEW events, but cannot
    // resurrect this refused source through its stale onCreate delivery.
    const next = await createEvent("after-boundary", "milestone");
    await deliver(next);
    expect((await next.get()).data()._rateLimitAccepted).toBe(true);
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(1);
    expect(social.createNotification).toHaveBeenCalledTimes(1);
  });

  it("retries a failed denial delete without leaving the quota transaction", async () => {
    firestore.data.set(quotaPath, { timestamps: Array(20).fill(Date.now()) });
    const ref = await createEvent("delete-retry", "milestone");
    firestore.failures.set(
      `delete:${ref.path}`,
      new Error("delete unavailable")
    );
    await expect(deliver(ref)).rejects.toThrow("delete unavailable");
    expect((await ref.get()).exists).toBe(true);
    expect(social.createNotification).not.toHaveBeenCalled();
    firestore.failures.delete(`delete:${ref.path}`);
    await deliver(ref);
    expect((await ref.get()).exists).toBe(false);
  });

  it("honours a persisted admission after window rollover and limiter TTL removal", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const first = await createEvent("old-event");
    const originalSnapshot = await capture(first);
    await deliver(first);
    clock.mockReturnValue(1_800_000_000_000 + 3_600_001);
    firestore.data.delete(quotaPath);
    for (let i = 0; i < 20; i += 1)
      await deliver(await createEvent(`new-${i}`));
    // Use the original onCreate snapshot, whose data has no server receipt.
    // Only the transaction's fresh read can know this event was admitted.
    await onGoalSpaceEventCreated.run(originalSnapshot, {
      params: { spaceId: SPACE, eventId: first.id },
    });
    expect((await first.get()).exists).toBe(true);
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(20);
  });

  it("retries a failed notification without spending a second quota slot", async () => {
    social.createNotification.mockRejectedValueOnce(
      new Error("notification unavailable")
    );
    const ref = await createEvent("notify-retry", "milestone");
    await expect(deliver(ref)).rejects.toThrow("notification unavailable");
    expect((await ref.get()).data()._rateLimitAccepted).toBe(true);
    await deliver(ref);
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(1);
    expect(social.createNotification).toHaveBeenCalledTimes(2);
  });

  it("does not consume quota or recreate a deleted source from a stale delivery", async () => {
    const ref = await createEvent("removed", "milestone");
    const originalSnapshot = await capture(ref);
    await ref.delete();
    await onGoalSpaceEventCreated.run(originalSnapshot, {
      params: { spaceId: SPACE, eventId: ref.id },
    });
    expect((await ref.get()).exists).toBe(false);
    expect(firestore.data.has(quotaPath)).toBe(false);
    expect(social.createNotification).not.toHaveBeenCalled();
  });

  it("retries an unavailable quota decision without deleting or notifying", async () => {
    const ref = await createEvent("quota-retry", "milestone");
    firestore.failures.set(`get:${quotaPath}`, new Error("quota unavailable"));
    await expect(deliver(ref)).rejects.toThrow("quota unavailable");
    expect((await ref.get()).exists).toBe(true);
    expect((await ref.get()).data()).not.toHaveProperty("_rateLimitAccepted");
    expect(social.createNotification).not.toHaveBeenCalled();
    firestore.failures.delete(`get:${quotaPath}`);
    await deliver(ref);
    expect(firestore.data.get(quotaPath).timestamps).toHaveLength(1);
  });

  it("reserves allowance and marks the event in one atomic commit", async () => {
    const ref = await createEvent("atomic", "milestone");
    firestore.failures.set(
      `update:${ref.path}`,
      new Error("receipt write failed")
    );
    await expect(deliver(ref)).rejects.toThrow("receipt write failed");
    expect(firestore.data.has(quotaPath)).toBe(false);
    expect((await ref.get()).data()).not.toHaveProperty("_rateLimitAccepted");
    expect(social.createNotification).not.toHaveBeenCalled();
  });

  it("keeps ordinary limiter defaults: errors refuse, failOpen remains opt-in", async () => {
    firestore.failures.set(
      "get:rateLimits/ordinary_action",
      new Error("unavailable")
    );
    expect(
      await isRateLimited(firestore, "ordinary", "action", 20, 60_000)
    ).toBe(true);
    expect(
      await isRateLimited(firestore, "ordinary", "action", 20, 60_000, {
        failOpen: true,
      })
    ).toBe(false);
    expect(firestore.data.size).toBe(2); // only the two seeded members
  });

  it("is create-only: persisting the server receipt cannot trigger a loop", () => {
    expect(onGoalSpaceEventCreated.__endpoint.eventTrigger.eventType).toContain(
      "document.create"
    );
  });
});
