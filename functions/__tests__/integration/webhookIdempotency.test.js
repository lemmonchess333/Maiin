/**
 * Integration tests for the webhook idempotency primitives against
 * the Firestore emulator. Pins audit P0 #2 (Stripe webhook replays)
 * and P0 #3 (Apple IAP notificationUUID replays).
 *
 * Gated on FIRESTORE_EMULATOR_HOST; skips otherwise.
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { checkClaim, finaliseClaim } = require("../../webhookIdempotency");

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

let db;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-tropos" });
  }
  db = admin.firestore();
});

async function clearCollection(name) {
  const snap = await db.collection(name).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (snap.docs.length) await batch.commit();
}

suite("webhookIdempotency.checkClaim — fresh delivery", () => {
  beforeEach(async () => {
    await clearCollection("stripeEvents");
    await clearCollection("appleNotifications");
  });

  it("returns duplicate:false for an unseen Stripe event id", async () => {
    const result = await checkClaim(db, "stripeEvents", "evt_test_unseen_1");
    expect(result.duplicate).toBe(false);
  });

  it("returns duplicate:false for an unseen Apple notification UUID", async () => {
    const result = await checkClaim(db, "appleNotifications", "uuid-unseen-1");
    expect(result.duplicate).toBe(false);
  });

  it("returns duplicate:false when id is falsy (defensive)", async () => {
    expect((await checkClaim(db, "stripeEvents", "")).duplicate).toBe(false);
    expect((await checkClaim(db, "stripeEvents", null)).duplicate).toBe(false);
    expect((await checkClaim(db, "stripeEvents", undefined)).duplicate).toBe(false);
  });
});

suite("webhookIdempotency.finaliseClaim → checkClaim — replay detection", () => {
  beforeEach(async () => {
    await clearCollection("stripeEvents");
    await clearCollection("appleNotifications");
  });

  it("Stripe: a finalised event id is detected as duplicate on the next checkClaim", async () => {
    // Audit P0 #2: Stripe retries every webhook delivery on any 5xx
    // OR network timeout. Without dedup, the same checkout.session
    // .completed event runs the user upgrade flow N times. This
    // test mirrors the retry sequence — first call finalises, the
    // second checkClaim sees the dedup doc and reports duplicate.
    await finaliseClaim(db, "stripeEvents", "evt_test_replay_1");
    const result = await checkClaim(db, "stripeEvents", "evt_test_replay_1");
    expect(result.duplicate).toBe(true);
  });

  it("Apple: a finalised notificationUUID is detected as duplicate", async () => {
    // Audit P0 #3: Apple App Store Server Notifications v2 retries
    // every delivery up to 5 times if the responder doesn't 200
    // within the timeout. notificationUUID is the stable
    // per-delivery key; dedup against it stops the retry loop.
    await finaliseClaim(db, "appleNotifications", "uuid-replay-1");
    const result = await checkClaim(db, "appleNotifications", "uuid-replay-1");
    expect(result.duplicate).toBe(true);
  });

  it("finaliseClaim merges caller-provided metadata onto the dedup doc", async () => {
    await finaliseClaim(db, "stripeEvents", "evt_meta_1", {
      eventType: "checkout.session.completed",
      uid: "user-x",
    });
    const snap = await db.collection("stripeEvents").doc("evt_meta_1").get();
    expect(snap.exists).toBe(true);
    const data = snap.data();
    expect(data.eventType).toBe("checkout.session.completed");
    expect(data.uid).toBe("user-x");
    expect(typeof data.processedAt).toBe("number");
  });

  it("finaliseClaim is idempotent — repeat calls don't error or duplicate", async () => {
    await finaliseClaim(db, "stripeEvents", "evt_double_1");
    await finaliseClaim(db, "stripeEvents", "evt_double_1");
    const snap = await db.collection("stripeEvents").doc("evt_double_1").get();
    expect(snap.exists).toBe(true);
  });

  it("ids are scoped per collection — same id in stripeEvents and appleNotifications don't collide", async () => {
    await finaliseClaim(db, "stripeEvents", "shared-id");
    expect((await checkClaim(db, "stripeEvents", "shared-id")).duplicate).toBe(true);
    expect((await checkClaim(db, "appleNotifications", "shared-id")).duplicate).toBe(false);
  });
});

suite("webhookIdempotency — concurrent retry simulation", () => {
  beforeEach(async () => {
    await clearCollection("stripeEvents");
  });

  it("after finalise, 10 parallel checks all see duplicate", async () => {
    // Simulates Stripe replaying the same event 10 times in
    // rapid succession (which it does on transient 5xx). Once
    // finalised, every checkClaim should report duplicate — no
    // race where the handler runs a second time.
    await finaliseClaim(db, "stripeEvents", "evt_storm_1");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        checkClaim(db, "stripeEvents", "evt_storm_1"),
      ),
    );
    const dupes = results.filter((r) => r.duplicate).length;
    expect(dupes).toBe(10);
  });
});
