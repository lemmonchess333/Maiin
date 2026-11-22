/**
 * The share sheet's callable for a card's page (Soc17 call 1): who may
 * call it and how often, driven through `.run(data, context)` with the
 * limiter, the deletion lock and the restriction check swapped on their
 * shared module objects (index.js calls each through its module). Nothing
 * here reaches Firestore: every case refuses before the first read.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const restriction = require("../lib/restriction");
const { sharedCard } = require("../index");

const UID = "uid-shared-card";
const CONTEXT = { auth: { uid: UID } };
const VERIFIED = { auth: { uid: UID, token: { email_verified: true } } };

const real = {
  isRateLimited: rateLimiter.isRateLimited,
  actorLock: accountDeletionLocks.assertCallableActorNotDeleting,
  assertNotRestricted: restriction.assertNotRestricted,
};

let order;
let limiterCalls;
let restricted;

beforeEach(() => {
  order = [];
  limiterCalls = [];
  restricted = false;
  rateLimiter.isRateLimited = async (_db, uid, action, maxCalls, windowMs) => {
    order.push(`limiter:${action}`);
    limiterCalls.push({ uid, action, maxCalls, windowMs });
    return true;
  };
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {
    order.push("lock");
  };
  restriction.assertNotRestricted = async () => {
    order.push("restriction");
    if (restricted) {
      const err = new Error("restricted");
      err.code = "permission-denied";
      throw err;
    }
  };
});

afterEach(() => {
  rateLimiter.isRateLimited = real.isRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = real.actorLock;
  restriction.assertNotRestricted = real.assertNotRestricted;
});

describe("sharedCard", () => {
  it("asks for a signed-in caller and a known action", async () => {
    await expect(sharedCard.run({ action: "store" }, {})).rejects.toMatchObject(
      { code: "unauthenticated" }
    );
    await expect(
      sharedCard.run({ action: "publish" }, CONTEXT)
    ).rejects.toMatchObject({ code: "invalid-argument" });
    expect(order).toEqual([]);
  });

  it("refuses a store from an unverified email before any read, and leaves prepare and remove open", async () => {
    for (const context of [
      CONTEXT,
      { auth: { uid: UID, token: { email_verified: false } } },
    ]) {
      await expect(
        sharedCard.run({ action: "store" }, context)
      ).rejects.toMatchObject({ code: "failed-precondition" });
    }
    expect(order).toEqual([]);
    for (const action of ["prepare", "remove"]) {
      await expect(sharedCard.run({ action }, CONTEXT)).rejects.toMatchObject({
        code: "resource-exhausted",
      });
    }
  });

  it("limits a store to 20 in 10 minutes and 100 a day, after the lock and the restriction", async () => {
    await expect(
      sharedCard.run({ action: "store" }, VERIFIED)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(order).toEqual(["lock", "restriction", "limiter:sharedCardStore"]);
    expect(limiterCalls).toEqual([
      { uid: UID, action: "sharedCardStore", maxCalls: 20, windowMs: 600_000 },
    ]);

    rateLimiter.isRateLimited = async (
      _db,
      uid,
      action,
      maxCalls,
      windowMs
    ) => {
      limiterCalls.push({ uid, action, maxCalls, windowMs });
      return action === "sharedCardStoreDay";
    };
    limiterCalls = [];
    await expect(
      sharedCard.run({ action: "store" }, VERIFIED)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls.at(-1)).toEqual({
      uid: UID,
      action: "sharedCardStoreDay",
      maxCalls: 100,
      windowMs: 86_400_000,
    });
  });

  it("limits a prepare to 30 in 10 minutes", async () => {
    await expect(
      sharedCard.run({ action: "prepare" }, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(limiterCalls).toEqual([
      {
        uid: UID,
        action: "sharedCardPrepare",
        maxCalls: 30,
        windowMs: 600_000,
      },
    ]);
  });

  it("refuses a restricted account a store and a prepare, and lets it take a copy back", async () => {
    restricted = true;
    for (const action of ["store", "prepare"]) {
      await expect(sharedCard.run({ action }, VERIFIED)).rejects.toMatchObject({
        code: "permission-denied",
      });
    }
    expect(limiterCalls).toEqual([]);
    order = [];
    await expect(
      sharedCard.run({ action: "remove" }, CONTEXT)
    ).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(order).toEqual(["lock", "limiter:sharedCardRemove"]);
    expect(limiterCalls).toEqual([
      { uid: UID, action: "sharedCardRemove", maxCalls: 60, windowMs: 600_000 },
    ]);
  });
});
