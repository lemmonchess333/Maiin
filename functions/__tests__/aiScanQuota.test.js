/**
 * F1b TDD — daily AI scan quota with per-action counters.
 *
 * Pinned-by-test invariants (lock = F1b → B+C hybrid, 8 pins):
 *
 *   1. Free user + text_ai: BLOCKED at 0 (no AI on the free plan, #1102).
 *   2. Free user + image_ai: BLOCKED at 0 (image-AI is Pro-only).
 *   3. Pro user + image_ai: 100/day server-side cap.
 *   4. Pro user + text_ai: 100/day server-side cap.
 *   5. Counters are SEPARATE — burning text_ai doesn't affect
 *      image_ai (lock pin #7).
 *   6. Window rolls over when the UTC date changes, and only then: the
 *      client-written `timezone` on the user doc cannot move it.
 *   7. quotaDayKey is the UTC date, whatever the profile's timezone.
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
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");

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
  it("Cycle 1 (tracer): pro user + text_ai allowed, increments counter", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "pro" },
      usageData: null, // first call ever
    });
    const now = new Date("2026-05-25T15:00:00Z");
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_alice",
      action: "text_ai",
      now,
    });
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(99);
    expect(result.tier).toBe("pro");
    expect(writes).toHaveLength(1);
    expect(writes[0].data.text_ai).toEqual({ day: "2026-05-25", count: 1 });
    expect(writes[0].opts).toEqual({ merge: true });
  });

  it("Cycle 1 (free): free user + text_ai is blocked at 0 — no AI on the free plan (#1102)", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "free" },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_alice",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.tier).toBe("free");
    expect(writes).toHaveLength(0);
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
      userData: { subscriptionTier: "pro" },
      usageData: { text_ai: { day: "2026-05-24", count: 100 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_frank",
      action: "text_ai",
      now: new Date("2026-05-25T00:01:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it("Cycle 6 (UTC day): a zone ahead of UTC does not reset at its own midnight", async () => {
    const { checkDailyAiQuota, quotaDayKey } = require("../lib/aiScanQuota");
    // 2026-05-25T13:00:00Z is 01:00 on the 26th in Auckland, and still the
    // 25th in UTC: the count from the 25th stands.
    expect(quotaDayKey(new Date("2026-05-25T13:00:00Z"))).toBe("2026-05-25");
    const { firestore } = makeFirestoreStub({
      userData: { subscriptionTier: "pro", timezone: "Pacific/Auckland" },
      usageData: { text_ai: { day: "2026-05-25", count: 100 } },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_grace",
      action: "text_ai",
      now: new Date("2026-05-25T13:00:00Z"),
    });
    expect(result.allowed).toBe(false);
  });

  it("Cycle 6 (UTC day): changing timezone does not reset the count; a new UTC day does", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    // Pacific/Kiritimati (UTC+14) and Pacific/Pago_Pago (UTC-11) never
    // share a date: at 12:00 UTC one is on the 26th, the other the 25th.
    const db = memoryFirestore({
      "users/uid_hopper": {
        subscriptionTier: "pro",
        timezone: "Pacific/Kiritimati",
      },
    });
    const scan = (now) =>
      checkDailyAiQuota(db, { uid: "uid_hopper", action: "image_ai", now });
    const noon = new Date("2026-05-25T12:00:00Z");
    for (let i = 0; i < 100; i++) {
      expect((await scan(noon)).allowed).toBe(true);
    }
    expect((await scan(noon)).allowed).toBe(false);
    for (const zone of ["Pacific/Pago_Pago", "Pacific/Kiritimati"]) {
      db.data.set("users/uid_hopper", {
        subscriptionTier: "pro",
        timezone: zone,
      });
      // Before: each switch moved the day key, and the count restarted.
      expect((await scan(noon)).allowed).toBe(false);
    }
    expect(db.data.get("scanUsage/uid_hopper").image_ai).toEqual({
      day: "2026-05-25",
      count: 100,
    });
    // 00:00 UTC is the one thing that starts a fresh count.
    const next = await scan(new Date("2026-05-26T00:00:00Z"));
    expect(next).toMatchObject({ allowed: true, remaining: 99 });
    expect(db.data.get("scanUsage/uid_hopper").image_ai).toEqual({
      day: "2026-05-26",
      count: 1,
    });
  });

  it("Cycle 7: quotaDayKey is the UTC date, whatever zone the profile names", () => {
    const { quotaDayKey } = require("../lib/aiScanQuota");
    expect(quotaDayKey(new Date("2026-05-25T00:00:00Z"))).toBe("2026-05-25");
    expect(quotaDayKey(new Date("2026-05-25T23:59:59.999Z"))).toBe(
      "2026-05-25"
    );
    expect(quotaDayKey(new Date("2026-05-26T00:00:00Z"))).toBe("2026-05-26");
  });

  it("Cycle 7: the usage doc no longer carries the profile's timezone", async () => {
    const { checkDailyAiQuota } = require("../lib/aiScanQuota");
    const { firestore, writes } = makeFirestoreStub({
      userData: { subscriptionTier: "pro", timezone: "Europe/London" },
    });
    await checkDailyAiQuota(firestore, {
      uid: "uid_ivy",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(writes[0].data).not.toHaveProperty("timezone");
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
      userData: { subscriptionTier: "pro" },
      // Pre-F1b shape — does NOT have action-keyed sub-objects.
      usageData: { count: 7, month: "2026-05" },
    });
    const result = await checkDailyAiQuota(firestore, {
      uid: "uid_legacy",
      action: "text_ai",
      now: new Date("2026-05-25T15:00:00Z"),
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99); // fresh — 1 of 100 used today
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
    expect(result.limit).toBe(0); // free fallback
  });
});
