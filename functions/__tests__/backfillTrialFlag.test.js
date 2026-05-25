/**
 * Sub1a P1 cycle 9 — migration backfill: every user with
 * `trialExpiresAt` non-null gets `hasUsedTrial: true`. Idempotent on
 * rerun; users that already have `hasUsedTrial: true` are skipped to
 * keep the write count tight on large user bases.
 *
 * Why a backfill: pre-Sub1a P1, the `auth.tsx` `createDefaultProfile`
 * factory set `trialExpiresAt` on every new account — so every
 * existing user (including ones who never actively "opted in" to a
 * trial) has a trial-expiry timestamp. Post-#P1, the lifetime
 * trial-shopping guard reads `hasUsedTrial`. We migrate every
 * pre-existing trialled user to `hasUsedTrial: true` so they can't
 * claim a second free week.
 *
 * Behaviours pinned here:
 *   1. User with `trialExpiresAt` set + `hasUsedTrial` undefined →
 *      gets `hasUsedTrial: true`.
 *   2. User with `trialExpiresAt` null → NOT touched (never had a
 *      trial).
 *   3. User with `hasUsedTrial: true` already → NOT touched
 *      (idempotent).
 *   4. Dry-run mode returns the would-write count without
 *      committing.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function makeFirestoreStub({ users = [] } = {}) {
  // Each user is { id, data }. The stub mimics
  // firestore.collection("users").get() returning docs, with each doc
  // exposing `.ref.set(...)` to capture writes.
  const writes = [];
  const docs = users.map(({ id, data }) => {
    const ref = {
      _id: id,
      set: vi.fn((updates, opts) => {
        writes.push({ id, updates, opts });
        return Promise.resolve();
      }),
    };
    return {
      id,
      data: () => data,
      ref,
    };
  });
  const firestore = {
    collection: vi.fn((name) => {
      if (name !== "users") {
        throw new Error(`unexpected collection: ${name}`);
      }
      return {
        get: vi.fn(async () => ({
          docs,
          size: docs.length,
          empty: docs.length === 0,
        })),
      };
    }),
    _writes: writes,
  };
  return { firestore, writes };
}

describe("backfillTrialFlag", () => {
  it("Cycle 9 (tracer): user with trialExpiresAt set + no hasUsedTrial → writes hasUsedTrial: true", async () => {
    const { backfillTrialFlag } = require("../lib/backfillTrialFlag");
    const { firestore, writes } = makeFirestoreStub({
      users: [
        {
          id: "uid_legacy",
          data: { trialExpiresAt: "2026-05-01T00:00:00Z" },
        },
      ],
    });

    const result = await backfillTrialFlag({ firestore });

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].updates).toEqual({ hasUsedTrial: true });
    expect(writes[0].opts).toEqual({ merge: true });
    expect(writes[0].id).toBe("uid_legacy");
  });

  it("Cycle 9: user with trialExpiresAt=null is skipped", async () => {
    const { backfillTrialFlag } = require("../lib/backfillTrialFlag");
    const { firestore, writes } = makeFirestoreStub({
      users: [{ id: "uid_pristine", data: { trialExpiresAt: null } }],
    });
    const result = await backfillTrialFlag({ firestore });
    expect(result.updated).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("Cycle 9: idempotent — user with hasUsedTrial already true is skipped on rerun", async () => {
    const { backfillTrialFlag } = require("../lib/backfillTrialFlag");
    const { firestore, writes } = makeFirestoreStub({
      users: [
        {
          id: "uid_migrated",
          data: {
            trialExpiresAt: "2026-05-01T00:00:00Z",
            hasUsedTrial: true,
          },
        },
      ],
    });
    const result = await backfillTrialFlag({ firestore });
    expect(result.updated).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("Cycle 9: dry-run reports the would-write count without committing", async () => {
    const { backfillTrialFlag } = require("../lib/backfillTrialFlag");
    const { firestore, writes } = makeFirestoreStub({
      users: [
        {
          id: "uid_a",
          data: { trialExpiresAt: "2026-05-01T00:00:00Z" },
        },
        {
          id: "uid_b",
          data: { trialExpiresAt: "2026-05-02T00:00:00Z" },
        },
        {
          id: "uid_already",
          data: {
            trialExpiresAt: "2026-04-01T00:00:00Z",
            hasUsedTrial: true,
          },
        },
      ],
    });
    const result = await backfillTrialFlag({ firestore, dryRun: true });
    expect(result.scanned).toBe(3);
    expect(result.wouldUpdate).toBe(2);
    expect(result.updated).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("Cycle 9: mixed batch — only legacy-trial-without-flag users get written", async () => {
    const { backfillTrialFlag } = require("../lib/backfillTrialFlag");
    const { firestore, writes } = makeFirestoreStub({
      users: [
        { id: "uid_pristine", data: { trialExpiresAt: null } },
        {
          id: "uid_legacy",
          data: { trialExpiresAt: "2026-05-01T00:00:00Z" },
        },
        {
          id: "uid_migrated",
          data: {
            trialExpiresAt: "2026-04-01T00:00:00Z",
            hasUsedTrial: true,
          },
        },
        {
          id: "uid_no_field",
          data: { subscriptionTier: "free" },
        },
      ],
    });
    const result = await backfillTrialFlag({ firestore });
    expect(result.scanned).toBe(4);
    expect(result.updated).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe("uid_legacy");
  });
});
