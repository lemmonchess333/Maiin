/**
 * F1b TDD — daily AI scan quota with per-action counters.
 *
 * Pinned-by-test invariants (lock = F1b → B+C hybrid, 8 pins):
 *
 *   1. Free user + text_ai: 10/day, transactional increment.
 *   2. Free user + image_ai: BLOCKED at 0 (image-AI is Pro-only).
 *   3. Pro user + image_ai: 100/day server-side cap.
 *   4. Pro user + text_ai: 100/day server-side cap.
 *   5. Counters are SEPARATE — burning text_ai doesn't affect
 *      image_ai (lock pin #7).
 *   6. Window rolls over when the user's local date changes (lock
 *      pin #2 — local midnight reset, timezone-aware).
 *   7. resolveDayKey falls back to UTC when timezone is missing or
 *      invalid (fail-closed).
 *   8. Trial user (subscriptionTier="pro" via webhook) gets Pro
 *      limits — `computeEffectiveTier` handles this, no separate
 *      branch needed.
 *   9. Legacy {count, month} doc shape (pre-F1b) is treated as
 *      fresh window — first call writes the new shape; no migration
 *      script required.
 *  10. Validation — unknown action throws.
 *  11. Fail-closed — transaction errors return
 *      `{ allowed: false, error: "quota-check-failed" }`.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Light Firestore stub — same shape as our other helper tests.
// `userData` and `usageData` are the fixture-injected current state;
// `_writes` captures every txn.set so the test can assert atomicity.
function makeFirestoreStub({ userData = null, usageData = null } = {}) {
  const writes = [];
  const userRef = { _kind: "user" };
  const usageRef = { _kind: "usage" };

  const firestore = {
    collection: vi.fn((name) => ({
      doc: vi.fn(() => (name === "users" ? userRef : usageRef)),
    })),
    runTransaction: vi.fn(async (cb) => {
      const txnWrites = [];
      const tx = {
        get: vi.fn(async (ref) => {
          if (ref === userRef) {
            return userData
              ? { exists: true, data: () => userData }
              : { exists: false, data: () => null };
          }
          return usageData
            ? { exists: true, data: () => usageData }
            : { exists: false, data: () => null };
        }),
        set: vi.fn((ref, data, opts) => {
          txnWrites.push({ ref, data, opts });
        }),
      };
      const result = await cb(tx);
      firestore._lastTxnWrites = txnWrites;
      txnWrites.forEach((w) => writes.push(w));
      return result;
    }),
    _writes: writes,
  };
  return { firestore, writes };
}

describe("checkDailyAiQuota", () => {
  it("Cycle 1 (tracer): free user + text_ai allowed under 10/day, increments counter", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
      usageData: null, // first call ever
    });
    const now = new Date("2026-05-25T15:00:00Z");
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_alice",
      action: "text_ai",
      now,
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.tier).toBe("free");
    expect(writes).toHaveLength(1);
    expect(writes[0].data.text_ai).toEqual({ day: "2026-05-25", count: 1 });
    expect(writes[0].opts).toEqual({ merge: true });
  });

  it("Cycle 2: free user + image_ai is blocked at 0 (lock: image-AI is Pro-only)", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_bob",
      action: "image_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.tier).toBe("free");
    // No write — defensive against abuse-via-blocked-attempts crowding
    // the doc with junk.
    expect(writes).toHaveLength(0);
  });

  it("Cycle 3: pro user + image_ai allowed up to 100/day", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
      usageData: { image_ai: { day: "2026-05-25", count: 99 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_carol",
      action: "image_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(0);
    // The next call would block.
  });

  it("Cycle 3 guard: pro user + image_ai at 100/100 is blocked", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
      usageData: { image_ai: { day: "2026-05-25", count: 100 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_carol",
      action: "image_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(100);
    expect(writes).toHaveLength(0);
  });

  it("Cycle 4: pro user + text_ai uses the 100/day cap", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
      usageData: { text_ai: { day: "2026-05-25", count: 50 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_dave",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(49);
  });

  it("Cycle 5: counters are separate — burning text_ai doesn't touch image_ai", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
      usageData: { image_ai: { day: "2026-05-25", count: 80 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_eve",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99); // text_ai starts fresh at 0/100
    // The write only mutates text_ai; image_ai field is left alone
    // (merge: true preserves it).
    expect(writes[0].data.text_ai).toBeDefined();
    expect(writes[0].data.image_ai).toBeUndefined();
  });

  it("Cycle 6: window rollover — yesterday's count is ignored when today's date differs", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    // User maxed out yesterday but it's now a fresh day.
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
      usageData: { text_ai: { day: "2026-05-24", count: 10 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_frank",
      action: "text_ai",
      now: new Date("2026-05-25T00:01:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("Cycle 6 (timezone): user in Pacific/Auckland gets midnight reset 12h ahead of UTC user", async () => {
    const { checkDailyAiQuota, resolveDayKey } = require("../lib/aiScanQuota");
    // 2026-05-25T11:00:00Z is 2026-05-25T23:00 in Auckland (UTC+12)
    // and 2026-05-25T11:00 in UTC. Both should map to "2026-05-25".
    expect(
      resolveDayKey("Pacific/Auckland", new Date("2026-05-25T11:00:00Z"))
    ).toBe("2026-05-25");
    expect(resolveDayKey(undefined, new Date("2026-05-25T11:00:00Z"))).toBe(
      "2026-05-25"
    );

    // 2026-05-25T13:00:00Z is 2026-05-26T01:00 in Auckland (next day)
    // but still 2026-05-25 in UTC.
    expect(
      resolveDayKey("Pacific/Auckland", new Date("2026-05-25T13:00:00Z"))
    ).toBe("2026-05-26");
    expect(resolveDayKey(undefined, new Date("2026-05-25T13:00:00Z"))).toBe(
      "2026-05-25"
    );

    // Auckland user, midnight-just-passed local. Stored count for
    // "2026-05-25" should be ignored because today is "2026-05-26".
    const { firestore } = makeFirestoreStub({
      userData: {
        subscriptionTier: "free",
        timezone: "Pacific/Auckland",
      },
      usageData: { text_ai: { day: "2026-05-25", count: 10 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_grace",
      action: "text_ai",
      now: new Date("2026-05-25T13:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("Cycle 7: invalid timezone falls back to UTC (fail-closed, not silent-grant)", () => {
    const { resolveDayKey } = require("../lib/aiScanQuota");
    expect(
      resolveDayKey("Not/A/Real/Zone", new Date("2026-05-25T11:00:00Z"))
    ).toBe("2026-05-25");
    expect(resolveDayKey("", new Date("2026-05-25T11:00:00Z"))).toBe(
      "2026-05-25"
    );
    expect(resolveDayKey(null, new Date("2026-05-25T11:00:00Z"))).toBe(
      "2026-05-25"
    );
  });

  it("Cycle 8: trial user (subscriptionTier=pro via webhook) gets Pro limits — no extra branch", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    // Sub1a P1: trialing → "pro" mapping flips subscriptionTier
    // immediately. computeEffectiveTier resolves to "pro" with no
    // extra trial-bypass code needed in this module.
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_trial",
      action: "image_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.tier).toBe("pro");
  });

  it("Cycle 9: legacy {count, month} doc shape is treated as fresh window (no migration needed)", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
      // Pre-F1b shape — does NOT have action-keyed sub-objects.
      usageData: { count: 7, month: "2026-05" },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_legacy",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9); // fresh — 1 of 10 used today
    // Write adds the new action-keyed field; merge:true means the
    // legacy fields stay until naturally aged out (no migration
    // script needed).
    expect(writes[0].data.text_ai).toEqual({ day: "2026-05-25", count: 1 });
    expect(writes[0].opts).toEqual({ merge: true });
  });

  it("Cycle 10 (validation): unknown action throws", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
    });
    await expect(
      checkDailyAiQuota(firestore, {
        uid: "uid_x",
        action: "voice_ai",
        now: new Date("2026-05-25T15:00:00Z"),
      })
    ).rejects.toThrow(/action must be one of/);
  });

  it("Cycle 11 (fail-closed): transaction error returns allowed=false + quota-check-failed", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    // Make the txn throw mid-flight by giving it a Firestore that
    // rejects from runTransaction.
    const firestore = {
      collection: vi.fn(() => ({ doc: vi.fn(() => ({})) })),
      runTransaction: vi.fn(async () => {
        throw new Error("simulated firestore outage");
      }),
    };
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_panic",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.error).toBe("quota-check-failed");
    expect(result.limit).toBe(10); // free fallback
  });
});
