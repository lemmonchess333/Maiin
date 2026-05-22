/**
 * R1A-Deletion Chunk 2.B — paymentEventsPostDeletion deduplication.
 *
 * Spec Blocker 11 / verification pack item 14: deterministic document
 * ID using provider-native event identifiers (Stripe event.id, Apple
 * notificationUUID) so retries of the same webhook event don't create
 * unbounded duplicate audit-log entries.
 *
 * Contract:
 *   - With providerEventId set, doc ID is `{provider}_{providerEventId}`.
 *   - With providerEventId set, a second call with the same
 *     providerEventId overwrites the first doc rather than creating
 *     a new one.
 *   - Without providerEventId, doc ID falls back to
 *     `{provider}_{externalTxnId}_{eventType}` and a console.warn is
 *     emitted (caller didn't use the provider-native id).
 *   - assertNoForbiddenFields runs on the record before write —
 *     ensures the operational log never accidentally persists email,
 *     names, photos, full receipt payloads, or any other PII
 *     category from the FORBIDDEN_FIELDS allowlist.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const locks = require("../../../functions/lib/accountDeletionLocks.js");

/**
 * Fake Firestore that records every doc().set() invocation. The
 * recordPaymentEventPostDeletion implementation uses
 * `db.collection(...).doc(docId).set(record)` — this fake captures
 * the (docId, record) tuples so the test can assert deterministic
 * IDs and idempotent overwrites.
 */
function makeRecordingDb() {
  const writes: Array<{ collection: string; docId: string; record: unknown }> = [];
  const store: Record<string, Record<string, unknown>> = {};
  return {
    writes,
    store,
    collection(name: string) {
      if (!store[name]) store[name] = {};
      return {
        doc(id: string) {
          return {
            set: async (record: unknown) => {
              writes.push({ collection: name, docId: id, record });
              store[name][id] = record;
            },
          };
        },
      };
    },
  };
}

describe("recordPaymentEventPostDeletion — deterministic doc ID", () => {
  it("uses {provider}_{providerEventId} when providerEventId is present (Stripe)", async () => {
    const db = makeRecordingDb();
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "stripe",
      externalTxnId: "sub_abc",
      providerEventId: "evt_1NbXYZ",
      eventType: "customer.subscription.updated",
      uid: "alice",
    });
    expect(db.writes.length).toBe(1);
    expect(db.writes[0].collection).toBe("paymentEventsPostDeletion");
    expect(db.writes[0].docId).toBe("stripe_evt_1NbXYZ");
  });

  it("uses {provider}_{providerEventId} for Apple notificationUUID", async () => {
    const db = makeRecordingDb();
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "apple",
      externalTxnId: "1234567890",
      providerEventId: "uuid-abc-def-123",
      eventType: "DID_RENEW",
      uid: "alice",
    });
    expect(db.writes[0].docId).toBe("apple_uuid-abc-def-123");
  });

  it("falls back to composite key + emits warning when providerEventId is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const db = makeRecordingDb();
      await locks.recordPaymentEventPostDeletion(db, {
        provider: "stripe",
        externalTxnId: "sub_xyz",
        eventType: "customer.subscription.deleted",
        uid: "alice",
      });
      expect(db.writes[0].docId).toBe("stripe_sub_xyz_customer.subscription.deleted");
      expect(warn).toHaveBeenCalled();
      const warnArg = warn.mock.calls[0][0] as string;
      // Chunk 2.C: warn is now structured JSON for Cloud Logging
      // filterability. Parse and assert the r1aEvent key.
      const parsed = JSON.parse(warnArg);
      expect(parsed.r1aEvent).toBe("payment_event_missing_provider_event_id");
      expect(parsed.provider).toBe("stripe");
      expect(parsed.eventType).toBe("customer.subscription.deleted");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("recordPaymentEventPostDeletion — idempotency", () => {
  it("two calls with the same providerEventId overwrite the same doc (no duplicate)", async () => {
    const db = makeRecordingDb();
    const baseEvent = {
      provider: "stripe" as const,
      externalTxnId: "sub_abc",
      providerEventId: "evt_dup",
      eventType: "customer.subscription.updated",
      uid: "alice",
    };
    await locks.recordPaymentEventPostDeletion(db, baseEvent);
    await locks.recordPaymentEventPostDeletion(db, baseEvent);
    await locks.recordPaymentEventPostDeletion(db, baseEvent);
    // Three calls hit set() three times — but all on the SAME doc ID.
    // In Firestore semantics this is idempotent overwrite; doc count
    // remains 1.
    expect(db.writes.length).toBe(3);
    expect(new Set(db.writes.map((w) => w.docId)).size).toBe(1);
    expect(Object.keys(db.store.paymentEventsPostDeletion).length).toBe(1);
  });

  it("different events with different providerEventId create separate docs", async () => {
    const db = makeRecordingDb();
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "stripe",
      externalTxnId: "sub_abc",
      providerEventId: "evt_1",
      eventType: "customer.subscription.updated",
      uid: "alice",
    });
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "stripe",
      externalTxnId: "sub_def",
      providerEventId: "evt_2",
      eventType: "customer.subscription.deleted",
      uid: "alice",
    });
    expect(Object.keys(db.store.paymentEventsPostDeletion).length).toBe(2);
  });

  it("Apple and Stripe events with the same providerEventId string land in separate docs (provider namespace)", async () => {
    const db = makeRecordingDb();
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "stripe",
      externalTxnId: "sub_abc",
      providerEventId: "shared-id",
      eventType: "x",
      uid: "alice",
    });
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "apple",
      externalTxnId: "1234567890",
      providerEventId: "shared-id",
      eventType: "DID_RENEW",
      uid: "alice",
    });
    expect(Object.keys(db.store.paymentEventsPostDeletion).sort()).toEqual([
      "apple_shared-id",
      "stripe_shared-id",
    ]);
  });
});

describe("recordPaymentEventPostDeletion — minimisation enforced", () => {
  // Defence-in-depth note: extra input fields passed to
  // recordPaymentEventPostDeletion are IGNORED by construction — the
  // helper builds the output record from a fixed shape (provider,
  // externalTxnId, eventType, occurredAt, hashedUidPrefix, action).
  // The assertPaymentEventShape() call inside the helper provides the
  // shape guarantee against accidental refactor — exercised directly
  // in accountDeletionMinimisation.test.ts. Here we prove the
  // happy-path output is correctly minimised.
  it("happy-path record contains only the 6 allowlisted fields after write", async () => {
    const db = makeRecordingDb();
    await locks.recordPaymentEventPostDeletion(db, {
      provider: "stripe",
      externalTxnId: "sub_abc",
      providerEventId: "evt_1",
      eventType: "x",
      uid: "alice",
    });
    const written = db.writes[0].record as Record<string, unknown>;
    const fields = Object.keys(written).sort();
    expect(fields).toEqual([
      "action",
      "eventType",
      "externalTxnId",
      "hashedUidPrefix",
      "occurredAt",
      "provider",
    ]);
    expect(written.hashedUidPrefix).toMatch(/^[0-9a-f]{8}$/);
    expect(written.hashedUidPrefix).not.toBe("alice"); // raw uid never persists
  });
});
