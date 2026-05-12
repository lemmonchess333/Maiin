/**
 * Integration tests for recordCheckoutAuditEntry against the
 * Firestore emulator. Pins:
 *
 *  - the write lands in CHECKOUT_AUDIT_COLLECTION (so a stray
 *    rename surfaces here rather than in production logs)
 *  - the doc shape matches buildCheckoutAuditEntry + a server
 *    timestamp (the server-side createdAt is what we'd query by
 *    in an incident response, so it must materialise)
 *  - successive writes produce distinct docIds (auto-id, not a
 *    deterministic key — concurrent checkouts must not collide)
 *
 * Gated on FIRESTORE_EMULATOR_HOST so `npm test` from `functions/`
 * still passes when run outside the emulator (matches the pattern
 * used by rateLimiter.test.js + the firestore.rules suite).
 *
 * To run locally:
 *   firebase emulators:start --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GCLOUD_PROJECT=demo-tropos \
 *     npm test --prefix functions
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const {
  CHECKOUT_AUDIT_COLLECTION,
  recordCheckoutAuditEntry,
} = require("../../auditLog");

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

suite("recordCheckoutAuditEntry — integration", () => {
  beforeEach(async () => {
    // Clear the audit collection between tests so each test starts
    // from a known-empty state. The emulator's REST clear API is
    // simpler to call but a per-collection drop keeps the test
    // isolation local to this suite.
    const snap = await db.collection(CHECKOUT_AUDIT_COLLECTION).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  });

  it("writes a fully-populated doc to CHECKOUT_AUDIT_COLLECTION", async () => {
    const ref = await recordCheckoutAuditEntry(db, {
      uid: "u-integration-1",
      stripeSessionId: "cs_test_integration_1",
      priceId: "price_monthly",
      planKind: "monthly",
      mode: "subscription",
      successOrigin: "https://troposfit.com",
      cancelOrigin: "https://troposfit.com",
    });
    expect(ref.parent.path).toBe(CHECKOUT_AUDIT_COLLECTION);

    const snap = await ref.get();
    expect(snap.exists).toBe(true);
    const data = snap.data();
    expect(data.uid).toBe("u-integration-1");
    expect(data.stripeSessionId).toBe("cs_test_integration_1");
    expect(data.priceId).toBe("price_monthly");
    expect(data.planKind).toBe("monthly");
    expect(data.mode).toBe("subscription");
    expect(data.successOrigin).toBe("https://troposfit.com");
    expect(data.cancelOrigin).toBe("https://troposfit.com");
    // Server timestamp materialises as a Firestore Timestamp. Type
    // check is enough — an off-by-seconds clock isn't worth pinning.
    expect(data.createdAt).toBeDefined();
    expect(typeof data.createdAt.toDate).toBe("function");
  });

  it("writes nulls for absent fields (the buildCheckoutAuditEntry contract)", async () => {
    const ref = await recordCheckoutAuditEntry(db, { uid: "u-partial" });
    const data = (await ref.get()).data();
    expect(data.uid).toBe("u-partial");
    expect(data.stripeSessionId).toBeNull();
    expect(data.priceId).toBeNull();
    expect(data.planKind).toBeNull();
    expect(data.mode).toBeNull();
    expect(data.successOrigin).toBeNull();
    expect(data.cancelOrigin).toBeNull();
    expect(data.createdAt).toBeDefined();
  });

  it("auto-IDs each write so concurrent checkouts don't collide", async () => {
    // The handler fires-and-forgets the audit write inside its try.
    // Two near-simultaneous checkouts must produce two docs, not
    // one overwrite. If this test breaks it likely means someone
    // moved to a deterministic id (e.g. stripeSessionId as docId),
    // which is fine architecturally but needs intentional review.
    const [refA, refB] = await Promise.all([
      recordCheckoutAuditEntry(db, { uid: "u-1", stripeSessionId: "cs_a" }),
      recordCheckoutAuditEntry(db, { uid: "u-2", stripeSessionId: "cs_b" }),
    ]);
    expect(refA.id).not.toBe(refB.id);
    const snap = await db.collection(CHECKOUT_AUDIT_COLLECTION).get();
    expect(snap.size).toBe(2);
  });
});
