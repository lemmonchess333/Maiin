/**
 * Integration tests for the rate limiter + monthly quota against
 * the Firestore emulator. Pins audit P0 #1 (concurrency race) and
 * adjacent cost-boundary invariants.
 *
 * Gated on FIRESTORE_EMULATOR_HOST so `npm test` from `functions/`
 * still passes when run outside the emulator (matches the pattern
 * used by firestore.rules.test.ts at the repo root).
 *
 * To run locally:
 *   firebase emulators:start --only firestore
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *     GCLOUD_PROJECT=demo-tropos \
 *     npm test --prefix functions
 *
 * To run via emulators:exec (matches the CI workflow):
 *   firebase emulators:exec --only firestore --project demo-tropos \
 *     'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-tropos npm test --prefix functions'
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");
const { isRateLimited } = require("../../rateLimiter");

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

async function clearCollections() {
  // Wipe the docs each test touches so each spec starts at a known
  // state. Emulator has no `clearFirestore` REST endpoint exposed
  // through admin SDK directly, so we delete by collection.
  const collections = ["rateLimits", "scanUsage", "users"];
  for (const name of collections) {
    const snap = await db.collection(name).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.docs.length) await batch.commit();
  }
}

suite("rateLimiter — emulator integration", () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it("allows the first call inside the window", async () => {
    const blocked = await isRateLimited(db, "user-a", "askGemini", 5, 60_000);
    expect(blocked).toBe(false);
  });

  it("blocks the (maxCalls + 1)-th call inside the window", async () => {
    for (let i = 0; i < 5; i++) {
      const blocked = await isRateLimited(db, "user-b", "askGemini", 5, 60_000);
      expect(blocked).toBe(false);
    }
    const blocked = await isRateLimited(db, "user-b", "askGemini", 5, 60_000);
    expect(blocked).toBe(true);
  });

  it("concurrency: 10 parallel calls with maxCalls=5 → exactly 5 allowed", async () => {
    // Audit P0 #1: pre-PR-C this read → calculate → write across two
    // RTTs, so two concurrent requests could both observe count=4
    // and both succeed (granting 6 calls when the limit is 5). The
    // runTransaction wrapper serialises them. Fires 10 in parallel
    // and asserts the count is exactly 5/5 — anything else means
    // the race re-opened.
    //
    // Timeout comes from the global 30_000ms set in
    // functions/vitest.config.js (the per-test bump from #547 was
    // folded into the global once #542's sibling did the same).
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        isRateLimited(db, "user-c", "askGemini", 5, 60_000),
      ),
    );
    const allowed = results.filter((r) => r === false).length;
    const blocked = results.filter((r) => r === true).length;
    expect(allowed).toBe(5);
    expect(blocked).toBe(5);
  });

  it("rate limit clears after the window expires", async () => {
    // Use a 50ms window so the test doesn't have to sleep for a
    // minute. Fill the bucket, wait past the window, retry.
    for (let i = 0; i < 3; i++) {
      await isRateLimited(db, "user-d", "askGemini", 3, 50);
    }
    expect(await isRateLimited(db, "user-d", "askGemini", 3, 50)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(await isRateLimited(db, "user-d", "askGemini", 3, 50)).toBe(false);
  });

  it("rate limit keys are scoped per (uid, action) pair", async () => {
    // Filling user-e's askGemini bucket should NOT affect user-e's
    // analyzeFood bucket (different action) OR user-f's askGemini
    // bucket (different uid).
    for (let i = 0; i < 3; i++) {
      await isRateLimited(db, "user-e", "askGemini", 3, 60_000);
    }
    expect(await isRateLimited(db, "user-e", "askGemini", 3, 60_000)).toBe(true);
    expect(await isRateLimited(db, "user-e", "analyzeFood", 3, 60_000)).toBe(false);
    expect(await isRateLimited(db, "user-f", "askGemini", 3, 60_000)).toBe(false);
  });
});
