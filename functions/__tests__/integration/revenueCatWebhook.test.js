/**
 * RevenueCat webhook — through the real handler against the Firestore
 * emulator. Pins the auth gate, the idempotency claim, and that an
 * INITIAL_PURCHASE on a TRIAL period lands tier/expiry/trial end/used
 * flag on the profile, then an EXPIRATION takes Pro away again.
 *
 * Gated on FIRESTORE_EMULATOR_HOST like the other integration suites.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const suite = EMULATOR_HOST ? describe : describe.skip;

const SECRET = "rc-test-secret";
const UID = "u-rcwebhook-1";

let admin;
let db;
let revenueCatWebhook;

beforeAll(() => {
  if (!EMULATOR_HOST) return;
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";
  process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
  const idx = require("../../index");
  revenueCatWebhook = idx.revenueCatWebhook;
  admin = require("firebase-admin");
  db = admin.firestore();
});

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
}

async function post(body, authorization = SECRET) {
  const res = fakeRes();
  await revenueCatWebhook(
    { method: "POST", headers: { authorization }, body },
    res
  );
  return res;
}

function event(overrides = {}) {
  const now = Date.now();
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: "INITIAL_PURCHASE",
    app_user_id: UID,
    product_id: "com.tropos.app.pro.monthly",
    entitlement_ids: ["pro"],
    period_type: "TRIAL",
    purchased_at_ms: now,
    expiration_at_ms: now + 7 * 864e5,
    store: "APP_STORE",
    environment: "SANDBOX",
    event_timestamp_ms: now,
    ...overrides,
  };
}

async function profile() {
  const snap = await db.collection("users").doc(UID).get();
  return snap.exists ? snap.data() : null;
}

suite("revenueCatWebhook — emulator integration", () => {
  beforeEach(async () => {
    await db
      .collection("users")
      .doc(UID)
      .delete()
      .catch(() => {});
    const events = await db.collection("revenueCatEvents").get();
    await Promise.all(events.docs.map((d) => d.ref.delete()));
    await db
      .collection("users")
      .doc(UID)
      .set({ uid: UID, subscriptionTier: "free", onboardingComplete: true });
  });

  it("refuses a wrong or missing shared secret and writes nothing", async () => {
    expect((await post({ event: event() }, "wrong")).statusCode).toBe(401);
    expect((await post({ event: event() }, "")).statusCode).toBe(401);
    expect((await profile()).subscriptionTier).toBe("free");
  });

  it("accepts the secret bare or as a Bearer token", async () => {
    expect(
      (await post({ event: event() }, `Bearer ${SECRET}`)).statusCode
    ).toBe(200);
  });

  it("a trial INITIAL_PURCHASE lands Pro with a trial end and the used-trial flag; EXPIRATION takes it away", async () => {
    const e = event();
    const res = await post({ api_version: "1.0", event: e });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ received: true, applied: true });
    const p = await profile();
    expect(p.subscriptionTier).toBe("pro");
    expect(p.subscriptionSource).toBe("ios_iap");
    expect(p.subscriptionExpiresAt).toBe(
      new Date(e.expiration_at_ms).toISOString()
    );
    expect(p.subscriptionTrialEndsAt).toBe(
      new Date(e.expiration_at_ms).toISOString()
    );
    expect(p.hasUsedTrial).toBe(true);
    expect(p.appleProductId).toBe("com.tropos.app.pro.monthly");

    const later = event({
      type: "EXPIRATION",
      period_type: "NORMAL",
      event_timestamp_ms: e.event_timestamp_ms + 8 * 864e5,
      expiration_at_ms: e.expiration_at_ms,
    });
    expect((await post({ event: later })).statusCode).toBe(200);
    const after = await profile();
    expect(after.subscriptionTier).toBe("free");
    expect(after.subscriptionTrialEndsAt).toBeNull();
    expect(after.hasUsedTrial).toBe(true);
  });

  it("CANCELLATION keeps Pro to the expiry with auto-renew off; UNCANCELLATION turns it back on", async () => {
    const e = event();
    await post({ event: e });
    expect((await profile()).subscriptionAutoRenew).toBe(true);

    const cancel = event({
      id: "evt_cancel",
      type: "CANCELLATION",
      event_timestamp_ms: e.event_timestamp_ms + 864e5,
      expiration_at_ms: e.expiration_at_ms,
    });
    expect((await post({ event: cancel })).statusCode).toBe(200);
    const afterCancel = await profile();
    expect(afterCancel.subscriptionTier).toBe("pro");
    expect(afterCancel.subscriptionTrialEndsAt).toBe(
      new Date(e.expiration_at_ms).toISOString()
    );
    expect(afterCancel.subscriptionAutoRenew).toBe(false);

    const uncancel = event({
      id: "evt_uncancel",
      type: "UNCANCELLATION",
      event_timestamp_ms: e.event_timestamp_ms + 2 * 864e5,
      expiration_at_ms: e.expiration_at_ms,
    });
    expect((await post({ event: uncancel })).statusCode).toBe(200);
    expect((await profile()).subscriptionAutoRenew).toBe(true);
  });

  it("a duplicate delivery is acknowledged and not re-applied; an older event does not roll back", async () => {
    const e = event();
    await post({ event: e });
    const dup = await post({ event: e });
    expect(dup.body).toMatchObject({ received: true, duplicate: true });

    const stale = event({
      type: "EXPIRATION",
      event_timestamp_ms: e.event_timestamp_ms - 60_000,
    });
    const res = await post({ event: stale });
    expect(res.body).toMatchObject({ applied: false });
    expect((await profile()).subscriptionTier).toBe("pro");
  });

  it("TEST pings and anonymous ids are acknowledged and write nothing", async () => {
    expect((await post({ event: event({ type: "TEST" }) })).body).toMatchObject(
      {
        ignored: "TEST",
      }
    );
    expect(
      (await post({ event: event({ app_user_id: "$RCAnonymousID:abc" }) })).body
    ).toMatchObject({ ignored: "INITIAL_PURCHASE" });
    expect((await profile()).subscriptionTier).toBe("free");
  });

  it("a malformed body is a 400, not a retry storm", async () => {
    expect((await post({ nope: true })).statusCode).toBe(400);
    expect((await post({ event: { type: "RENEWAL" } })).statusCode).toBe(400);
  });
});
