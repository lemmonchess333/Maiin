/**
 * Unit tests for the pure audit-log shape builder. The
 * side-effecting `recordCheckoutAuditEntry` is exercised against the
 * Firestore emulator in __tests__/integration/auditLog.test.js so
 * this file can stay synchronous and admin-free.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildCheckoutAuditEntry, CHECKOUT_AUDIT_COLLECTION } = require("../auditLog");

describe("CHECKOUT_AUDIT_COLLECTION", () => {
  it("is the canonical collection name (used by handler + rules + tests)", () => {
    // Pinned so a rename here surfaces every consumer at test time
    // rather than at runtime when an audit write lands on the wrong
    // collection and the firestore.rules block silently misses it.
    expect(CHECKOUT_AUDIT_COLLECTION).toBe("audit_checkout_sessions");
  });
});

describe("buildCheckoutAuditEntry", () => {
  it("returns the canonical doc shape with every field present", () => {
    // Full-field record: this is the happy-path shape the handler
    // writes after a Stripe session creates cleanly.
    const entry = buildCheckoutAuditEntry({
      uid: "u-123",
      stripeSessionId: "cs_test_abc",
      priceId: "price_monthly",
      planKind: "monthly",
      mode: "subscription",
      successOrigin: "https://troposfit.com",
      cancelOrigin: "https://troposfit.com",
    });
    expect(entry).toEqual({
      uid: "u-123",
      stripeSessionId: "cs_test_abc",
      priceId: "price_monthly",
      planKind: "monthly",
      mode: "subscription",
      successOrigin: "https://troposfit.com",
      cancelOrigin: "https://troposfit.com",
    });
  });

  it("defaults every absent field to null (not undefined)", () => {
    // Firestore drops fields with undefined values silently. Using
    // explicit null keeps the doc shape fixed across writes so a
    // query like `where('successOrigin', '==', null)` works.
    const entry = buildCheckoutAuditEntry({});
    expect(entry).toEqual({
      uid: null,
      stripeSessionId: null,
      priceId: null,
      planKind: null,
      mode: null,
      successOrigin: null,
      cancelOrigin: null,
    });
  });

  it("does NOT include createdAt — the side-effecting writer adds it server-side", () => {
    // The server timestamp must come from the server (writer), not
    // from the caller, so a misclocked function can't backdate the
    // record. Pinned so a future refactor doesn't move it here.
    const entry = buildCheckoutAuditEntry({ uid: "u-1" });
    expect("createdAt" in entry).toBe(false);
  });

  it("does NOT carry full URLs / email / payment instruments / customer id", () => {
    // The audit log answers "did this user start a checkout for
    // this plan when" — not "reconstruct the user's session". Pin
    // the negative-space so a future field add gets a conscious
    // review: do we really want this in the audit log?
    const entry = buildCheckoutAuditEntry({
      uid: "u-1",
      successUrl: "https://troposfit.com/upgrade?checkout=success",
      cancelUrl: "https://troposfit.com/upgrade?checkout=cancelled",
      email: "user@example.com",
      stripeCustomerId: "cus_xyz",
      cardLast4: "4242",
    });
    expect(entry.successUrl).toBeUndefined();
    expect(entry.cancelUrl).toBeUndefined();
    expect(entry.email).toBeUndefined();
    expect(entry.stripeCustomerId).toBeUndefined();
    expect(entry.cardLast4).toBeUndefined();
  });

  it("treats explicit null inputs the same as absent inputs", () => {
    // A caller that explicitly passes `null` for a field
    // (e.g. safeOriginForLog returned null on a malformed URL)
    // should land that null in the doc, not undefined.
    const entry = buildCheckoutAuditEntry({
      uid: "u-1",
      successOrigin: null,
      cancelOrigin: null,
    });
    expect(entry.successOrigin).toBeNull();
    expect(entry.cancelOrigin).toBeNull();
  });
});
