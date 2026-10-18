/**
 * stripeWebhook's dedup record (PR #822), driven whole: the real handler,
 * the real Stripe signature check (the payload is signed with the SDK's own
 * test helper) and an in-memory Firestore behind `admin.firestore()`.
 *
 *   - A delivery claims `stripeEvents/{event.id}` with `claimedAt`, does its
 *     work, then merges `processedAt` over the claim.
 *   - A second delivery of the same id is skipped, with no write.
 *   - A delivery that fails after the claim releases it and answers 500, so
 *     Stripe's retry of the same id is processed rather than skipped.
 *
 * The per-event decisions live in stripeSubscriptionDeleted.test.js and
 * subscriptionReconciliation.test.js; this file pins the record around them.
 * Stripe is dormant (no web sales at launch, #2866), so no real delivery
 * has exercised it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// firebase-functions/v1 refuses to construct triggers without a project id.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { stripeWebhook } = require("../index");

const SECRET_KEY = "sk_test_unit";
const WEBHOOK_SECRET = "whsec_unit_test_secret";
const stripe = require("stripe")(SECRET_KEY);

/** Point admin.firestore() at an in-memory database. FieldValue sentinels
 *  become plain markers so stored values read back as data. */
function useMemoryFirestore(seed) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: { serverTimestamp: () => "SERVER_TS" },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

function checkoutCompleted(id) {
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    created: 1_790_000_000,
    data: {
      object: {
        id: `cs_${id}`,
        object: "checkout.session",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { firebaseUid: "u1" },
      },
    },
  };
}

/** One delivery, signed as Stripe signs it. */
async function deliver(event) {
  const payload = JSON.stringify(event);
  const req = {
    method: "POST",
    headers: {
      "stripe-signature": stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      }),
    },
    rawBody: Buffer.from(payload),
  };
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  await stripeWebhook(req, res);
  return res;
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", SECRET_KEY);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // The own property shadowed firebase-admin's prototype getter.
  delete admin.firestore;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("stripeWebhook — the stripeEvents dedup record", () => {
  it("claims the event, processes it, and records both claimedAt and processedAt", async () => {
    const db = useMemoryFirestore({ "users/u1": { subscriptionTier: "free" } });

    const res = await deliver(checkoutCompleted("evt_1"));

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(db.data.get("stripeEvents/evt_1")).toEqual({
      type: "checkout.session.completed",
      created: 1_790_000_000,
      claimedAt: "SERVER_TS",
      processedAt: "SERVER_TS",
    });
    expect(db.data.get("users/u1")).toMatchObject({
      subscriptionTier: "pro",
      stripeCustomerId: "cus_1",
    });
  });

  it("skips a second delivery of the same event id, writing nothing", async () => {
    const db = useMemoryFirestore({ "users/u1": { subscriptionTier: "free" } });
    await deliver(checkoutCompleted("evt_1"));
    const writes = db.operations.length;

    const again = await deliver(checkoutCompleted("evt_1"));

    expect(again.statusCode).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });
    expect(db.operations).toHaveLength(writes);
  });

  it("releases the claim when processing fails, so Stripe's retry is processed", async () => {
    const db = useMemoryFirestore({ "users/u1": { subscriptionTier: "free" } });
    // The user lookup, after the claim has committed.
    db.failures.set("get:users/u1", new Error("Firestore unavailable"));

    const failed = await deliver(checkoutCompleted("evt_2"));

    expect(failed.statusCode).toBe(500);
    expect(failed.body).toEqual({ error: "Webhook processing failed" });
    expect(db.operations).toEqual([
      ["set", "stripeEvents/evt_2"],
      ["delete", "stripeEvents/evt_2"],
    ]);
    expect(db.data.has("stripeEvents/evt_2")).toBe(false);

    db.failures.delete("get:users/u1");
    const retried = await deliver(checkoutCompleted("evt_2"));

    expect(retried.statusCode).toBe(200);
    expect(retried.body).toEqual({ received: true });
    expect(db.data.get("users/u1").subscriptionTier).toBe("pro");
    expect(db.data.get("stripeEvents/evt_2")).toMatchObject({
      claimedAt: "SERVER_TS",
      processedAt: "SERVER_TS",
    });
  });
});
