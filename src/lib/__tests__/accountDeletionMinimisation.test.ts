/**
 * R1A-Deletion Chunk 1 — operational-record field minimisation.
 *
 * The forbidden-field allowlist applies to every operational record:
 * accountDeletionRequests, deletedAccounts, paymentEventsPostDeletion,
 * any future operator-review / diagnostics records. These tests pin
 * the predicate so adding a new write site can't accidentally
 * persist personal data.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const minimisation = require("../../../functions/lib/accountDeletionMinimisation.js");

const {
  FORBIDDEN_FIELDS,
  PAYMENT_EVENT_ALLOWED_FIELDS,
  assertNoForbiddenFields,
  hashedUidPrefix,
  assertPaymentEventShape,
} = minimisation;

describe("FORBIDDEN_FIELDS allowlist", () => {
  it("covers the spec's named categories", () => {
    expect(FORBIDDEN_FIELDS).toContain("displayName");
    expect(FORBIDDEN_FIELDS).toContain("email");
    expect(FORBIDDEN_FIELDS).toContain("photoURL");
    expect(FORBIDDEN_FIELDS).toContain("mealName");
    expect(FORBIDDEN_FIELDS).toContain("workoutNotes");
    expect(FORBIDDEN_FIELDS).toContain("notes");
    expect(FORBIDDEN_FIELDS).toContain("commentBody");
    expect(FORBIDDEN_FIELDS).toContain("lat");
    expect(FORBIDDEN_FIELDS).toContain("lon");
    expect(FORBIDDEN_FIELDS).toContain("points");
    expect(FORBIDDEN_FIELDS).toContain("route");
    expect(FORBIDDEN_FIELDS).toContain("weightKg");
    expect(FORBIDDEN_FIELDS).toContain("calories");
    expect(FORBIDDEN_FIELDS).toContain("receiptData");
    expect(FORBIDDEN_FIELDS).toContain("signedTransactionInfo");
  });
});

describe("assertNoForbiddenFields (recursive)", () => {
  it("accepts a record with only allowlisted top-level fields", () => {
    expect(() =>
      assertNoForbiddenFields({ uid: "abc", status: "running", count: 3 }),
    ).not.toThrow();
  });

  it("rejects a forbidden field at the top level", () => {
    expect(() => assertNoForbiddenFields({ uid: "abc", email: "a@b.com" })).toThrow(
      /forbidden field on operational record at .email/,
    );
  });

  it("rejects a forbidden field nested inside an object", () => {
    expect(() =>
      assertNoForbiddenFields({
        uid: "abc",
        meta: { event: { signedTransactionInfo: "X" } },
      }),
    ).toThrow(/signedTransactionInfo/);
  });

  it("rejects a forbidden field nested inside an array", () => {
    expect(() =>
      assertNoForbiddenFields({
        uid: "abc",
        events: [{ ok: true }, { displayName: "Alice" }],
      }),
    ).toThrow(/events\[1\].displayName/);
  });

  it("walks deeply-nested arrays of objects", () => {
    expect(() =>
      assertNoForbiddenFields({
        bundles: [{ items: [{ photoURL: "x" }] }],
      }),
    ).toThrow();
  });

  it("ignores null and primitive leaf values without crashing", () => {
    expect(() =>
      assertNoForbiddenFields({
        uid: "abc",
        nested: null,
        flag: true,
        count: 0,
        text: "fine",
      }),
    ).not.toThrow();
  });
});

describe("hashedUidPrefix", () => {
  it("returns an 8-char hex string", () => {
    const prefix = hashedUidPrefix("user-123");
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic for the same uid", () => {
    expect(hashedUidPrefix("alice")).toBe(hashedUidPrefix("alice"));
  });

  it("differs between two uids", () => {
    expect(hashedUidPrefix("alice")).not.toBe(hashedUidPrefix("bob"));
  });
});

describe("assertPaymentEventShape", () => {
  it("accepts a minimal valid record", () => {
    expect(() =>
      assertPaymentEventShape({
        provider: "apple",
        externalTxnId: "txn-123",
        eventType: "DID_RENEW",
        occurredAt: 1700000000,
        hashedUidPrefix: "deadbeef",
        action: "skipped",
      }),
    ).not.toThrow();
  });

  it("rejects unknown provider", () => {
    expect(() =>
      assertPaymentEventShape({
        provider: "paypal",
        externalTxnId: "x",
        eventType: "X",
        occurredAt: 1,
        hashedUidPrefix: "abcdef01",
        action: "logged",
      }),
    ).toThrow(/invalid provider/);
  });

  it("rejects unknown action", () => {
    expect(() =>
      assertPaymentEventShape({
        provider: "stripe",
        externalTxnId: "x",
        eventType: "X",
        occurredAt: 1,
        hashedUidPrefix: "abcdef01",
        action: "queued",
      }),
    ).toThrow(/invalid action/);
  });

  it("rejects extra fields not in the allowlist", () => {
    expect(() =>
      assertPaymentEventShape({
        provider: "apple",
        externalTxnId: "x",
        eventType: "X",
        occurredAt: 1,
        hashedUidPrefix: "abcdef01",
        action: "logged",
        receiptData: "BIG_BLOB",
      }),
    ).toThrow(/forbidden field on paymentEventsPostDeletion/);
  });

  it("PAYMENT_EVENT_ALLOWED_FIELDS exposes the canonical 6 fields", () => {
    expect([...PAYMENT_EVENT_ALLOWED_FIELDS].sort()).toEqual([
      "action",
      "eventType",
      "externalTxnId",
      "hashedUidPrefix",
      "occurredAt",
      "provider",
    ]);
  });
});
