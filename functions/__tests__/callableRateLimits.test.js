/**
 * Pins the per-user rate limits on four callables, and that each asks the
 * deletion lock before the limiter writes, each driven through
 * `.run(data, context)` with the limiter and the deletion lock swapped
 * on their shared module objects (index.js calls both through the
 * module, so the swap is what it sees). Nothing here reaches Firestore:
 * a limited call must throw before the handler's first read.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const {
  applyProgramCommand,
  backfillMyActivityCategories,
  recreditMyLiftVolume,
  sendTestPush,
} = require("../index");

const TEN_MINUTES = 600_000;
const ONE_HOUR = 3_600_000;
const UID = "uid-rate-limit";
const CONTEXT = { auth: { uid: UID } };

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;

let limiterCalls;
let order;

beforeEach(() => {
  limiterCalls = [];
  order = [];
  rateLimiter.isRateLimited = async (_db, uid, action, maxCalls, windowMs) => {
    order.push("limiter");
    limiterCalls.push({ uid, action, maxCalls, windowMs });
    return true;
  };
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {
    order.push("lock");
  };
});

afterEach(() => {
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
});

describe("backfillMyActivityCategories — rate limit", () => {
  it("refuses with resource-exhausted at 3 calls per hour", async () => {
    await expect(
      backfillMyActivityCategories.run({}, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: UID,
        action: "backfillMyActivityCategories",
        maxCalls: 3,
        windowMs: ONE_HOUR,
      },
    ]);
  });
});

describe("recreditMyLiftVolume — rate limit", () => {
  it("refuses with resource-exhausted at 30 pages per 10 minutes", async () => {
    await expect(
      recreditMyLiftVolume.run({ startAfter: "w1" }, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: UID,
        action: "recreditMyLiftVolume",
        maxCalls: 30,
        windowMs: TEN_MINUTES,
      },
    ]);
  });

  it("rejects a malformed cursor before consulting the limiter", async () => {
    await expect(
      recreditMyLiftVolume.run({ startAfter: 42 }, CONTEXT)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(limiterCalls).toEqual([]);
  });
});

describe("applyProgramCommand — rate limit", () => {
  it("refuses with resource-exhausted at 120 calls per 10 minutes", async () => {
    await expect(
      applyProgramCommand.run(
        { kind: "dismissFellBehindPrompt", commandId: "c".repeat(20) },
        CONTEXT
      )
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: UID,
        action: "applyProgramCommand",
        maxCalls: 120,
        windowMs: TEN_MINUTES,
      },
    ]);
  });
});

describe("sendTestPush — rate limit", () => {
  it("throws resource-exhausted at 5 calls per 10 minutes instead of an ok:false report", async () => {
    await expect(sendTestPush.run({}, CONTEXT)).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    expect(limiterCalls).toEqual([
      { uid: UID, action: "sendTestPush", maxCalls: 5, windowMs: TEN_MINUTES },
    ]);
  });
});

/* The limiter writes `rateLimits/{uid}_…`, and a deleting account must
   receive no new server writes, so every one of these asks the deletion
   lock first. Three of the four did not: recreditMyLiftVolume, which the
   app calls by itself on each device, could re-create lifetime totals and
   challenge markers the deletion executor had already swept. */
describe("rate-limited callables — deletion lock first", () => {
  const CALLS = [
    ["applyProgramCommand", applyProgramCommand, {}],
    ["backfillMyActivityCategories", backfillMyActivityCategories, {}],
    ["recreditMyLiftVolume", recreditMyLiftVolume, { startAfter: "w1" }],
    ["sendTestPush", sendTestPush, {}],
  ];

  it.each(CALLS)(
    "%s consults the deletion lock BEFORE the limiter writes",
    async (_n, fn, data) => {
      await fn.run(data, CONTEXT).catch(() => {});
      expect(order).toEqual(["lock", "limiter"]);
    }
  );

  it.each(CALLS)(
    "%s never reaches the limiter for a deleting account",
    async (_n, fn, data) => {
      accountDeletionLocks.assertCallableActorNotDeleting = async (
        _db,
        uid
      ) => {
        order.push("lock");
        expect(uid).toBe(UID);
        const err = new Error("Account deletion in progress.");
        err.code = "failed-precondition";
        throw err;
      };
      await expect(fn.run(data, CONTEXT)).rejects.toMatchObject({
        message: "Account deletion in progress.",
      });
      expect(order).toEqual(["lock"]);
      expect(limiterCalls).toEqual([]);
    }
  );
});

describe("rate-limited callables — auth precedence", () => {
  it.each([
    ["applyProgramCommand", applyProgramCommand],
    ["backfillMyActivityCategories", backfillMyActivityCategories],
    ["recreditMyLiftVolume", recreditMyLiftVolume],
    ["sendTestPush", sendTestPush],
  ])(
    "%s rejects unauthenticated before consulting the limiter",
    async (_n, fn) => {
      await expect(fn.run({}, {})).rejects.toMatchObject({
        code: "unauthenticated",
      });
      expect(limiterCalls).toEqual([]);
    }
  );
});
