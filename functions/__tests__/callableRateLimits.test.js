/**
 * Pins the per-user rate limits on four callables, each driven through
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
  it("refuses with resource-exhausted at 3 calls per hour", async () => {
    await expect(
      recreditMyLiftVolume.run({ startAfter: "w1" }, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: UID,
        action: "recreditMyLiftVolume",
        maxCalls: 3,
        windowMs: ONE_HOUR,
      },
    ]);
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

  it("consults the deletion lock BEFORE the limiter writes", async () => {
    await applyProgramCommand.run({}, CONTEXT).catch(() => {});
    expect(order).toEqual(["lock", "limiter"]);
  });

  it("never reaches the limiter for a deleting account", async () => {
    accountDeletionLocks.assertCallableActorNotDeleting = async () => {
      order.push("lock");
      const err = new Error("Account deletion in progress.");
      err.code = "failed-precondition";
      throw err;
    };
    await expect(applyProgramCommand.run({}, CONTEXT)).rejects.toMatchObject({
      message: "Account deletion in progress.",
    });
    expect(order).toEqual(["lock"]);
    expect(limiterCalls).toEqual([]);
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
