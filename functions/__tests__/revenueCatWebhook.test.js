/**
 * revenueCatWebhook + syncRevenueCatEntitlement, driven whole: the real
 * handlers, the real deletion locks and limiter, an in-memory Firestore
 * and a fake RevenueCat REST API. The decision table itself lives in
 * revenueCatEntitlement.test.js; this file pins the wiring around it.
 *
 *   - Auth comes first. A wrong or missing Authorization header touches
 *     neither Firestore nor RevenueCat.
 *   - Every event re-reads the subscriber from RevenueCat; nothing is
 *     granted from the event body.
 *   - A replay is skipped, a failure is retried (500, no event record),
 *     and a late delivery cannot undo a newer snapshot.
 *   - No user document is ever created, and a deleting account gets a
 *     minimised log instead of a write.
 *   - A sandbox purchase grants Pro through either entry point only to a
 *     uid on REVENUECAT_SANDBOX_UIDS; a refusal is logged with the uid and
 *     no transaction id.
 *   - Neither secret appears in a response or a log line.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* firebase-functions/v1 needs a project id to construct triggers. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const rateLimiter = require("../rateLimiter");
const { _internals } = require("../revenueCat");
const { handleWebhook, handleSync, SUBSCRIBERS_API, SYNC_RATE_LIMIT } =
  _internals;

const SECRET = "rc-webhook-secret-value";
const REST_KEY = "sk_rest_key_value";
const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;
const MONTHLY = "com.tropos.app.pro.monthly";
const STORE_TRANSACTION_ID = "2000000456";
const iso = (ms) => new Date(ms).toISOString();

function subscriber({
  expires = NOW + 30 * DAY,
  requestMs = NOW,
  entitlement = true,
  sandbox = false,
} = {}) {
  return {
    request_date_ms: requestMs,
    subscriber: {
      entitlements: entitlement
        ? {
            pro: {
              expires_date: iso(expires),
              grace_period_expires_date: null,
              product_identifier: MONTHLY,
            },
          }
        : {},
      subscriptions: {
        [MONTHLY]: {
          expires_date: iso(expires),
          store: "app_store",
          is_sandbox: sandbox,
          store_transaction_id: STORE_TRANSACTION_ID,
        },
      },
      non_subscriptions: {},
    },
  };
}

/** A user RevenueCat made Pro in an earlier snapshot. */
const RC_PRO = {
  subscriptionTier: "pro",
  subscriptionSource: "ios_iap",
  subscriptionExpiresAt: iso(NOW + 2 * DAY),
  revenueCat: {
    entitlementActive: true,
    productId: MONTHLY,
    store: "app_store",
    expiresAt: iso(NOW + 2 * DAY),
    sandbox: false,
    syncedAtMs: NOW - DAY,
  },
};

/** RevenueCat's REST API: per-uid responses, `{ status }` for an HTTP
 *  failure, or an Error for a network failure. */
function fakeRevenueCat(byUid) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const reply = byUid[decodeURIComponent(url.slice(SUBSCRIBERS_API.length))];
    if (reply instanceof Error) throw reply;
    if (!reply || reply.status)
      return {
        ok: false,
        status: reply ? reply.status : 404,
        json: async () => ({}),
      };
    return { ok: true, status: 200, json: async () => structuredClone(reply) };
  };
  return { fetchImpl, calls };
}

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

let logs;
function deps(db, fetchImpl, overrides = {}) {
  const logger = {};
  for (const level of ["log", "info", "warn", "error"]) {
    logger[level] = (...args) => logs.push([level, ...args]);
  }
  return {
    db,
    webhookAuth: SECRET,
    apiKey: REST_KEY,
    fetchImpl,
    serverTimestamp: () => "SERVER_TIME",
    logger,
    ...overrides,
  };
}

/** `authorization: null` sends no header at all. */
function post(event, authorization = `Bearer ${SECRET}`) {
  return {
    method: "POST",
    headers: authorization === null ? {} : { authorization },
    body: event === undefined ? {} : { api_version: "1.0", event },
  };
}

async function deliver(db, rc, event, authorization) {
  const res = fakeRes();
  await handleWebhook(post(event, authorization), res, deps(db, rc.fetchImpl));
  return res;
}

const purchase = (overrides = {}) => ({
  type: "INITIAL_PURCHASE",
  id: "evt-1",
  app_user_id: "uid-1",
  original_transaction_id: "2000000123",
  ...overrides,
});

const SANDBOX_UIDS = process.env.REVENUECAT_SANDBOX_UIDS;

beforeEach(() => {
  logs = [];
  delete process.env.REVENUECAT_SANDBOX_UIDS;
});

afterEach(() => {
  const printed = JSON.stringify(logs);
  expect(printed).not.toContain(SECRET);
  expect(printed).not.toContain(REST_KEY);
  if (SANDBOX_UIDS === undefined) delete process.env.REVENUECAT_SANDBOX_UIDS;
  else process.env.REVENUECAT_SANDBOX_UIDS = SANDBOX_UIDS;
});

const refusals = () =>
  logs.filter(([, message]) => message === "revenueCat.sandbox_refused");

describe("revenueCatWebhook — the gate", () => {
  it("refuses a missing or wrong Authorization header before any read", async () => {
    for (const header of [null, "", "Bearer nope", SECRET.slice(1)]) {
      const db = memoryFirestore({
        "users/uid-1": { subscriptionTier: "free" },
      });
      const rc = fakeRevenueCat({ "uid-1": subscriber() });
      const res = await deliver(db, rc, purchase(), header);
      expect(res.statusCode).toBe(401);
      expect(rc.calls).toHaveLength(0);
      expect(db.operations).toEqual([]);
      expect(db.data.get("users/uid-1")).toEqual({ subscriptionTier: "free" });
    }
  });

  it("refuses everything when the webhook secret is not provisioned", async () => {
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    const res = fakeRes();
    await handleWebhook(
      post(purchase(), "Bearer "),
      res,
      deps(db, rc.fetchImpl, { webhookAuth: undefined })
    );
    expect(res.statusCode).toBe(401);
    expect(rc.calls).toHaveLength(0);
  });

  it("answers only POST", async () => {
    const db = memoryFirestore();
    const res = fakeRes();
    await handleWebhook(
      { method: "GET", headers: {} },
      res,
      deps(db, fakeRevenueCat({}).fetchImpl)
    );
    expect(res.statusCode).toBe(405);
  });

  it("refuses a body with no event, and acknowledges the dashboard's test event without work", async () => {
    const db = memoryFirestore();
    const rc = fakeRevenueCat({});
    expect((await deliver(db, rc, undefined)).statusCode).toBe(400);
    expect(
      (await deliver(db, rc, { type: "TEST", id: "t", app_user_id: "whoever" }))
        .statusCode
    ).toBe(200);
    expect(rc.calls).toHaveLength(0);
    expect(db.operations).toEqual([]);
  });
});

describe("revenueCatWebhook — syncing", () => {
  it("makes a buyer Pro from RevenueCat's answer, not from the event", async () => {
    const db = memoryFirestore({
      "users/uid-1": { subscriptionTier: "free", displayName: "Sam" },
    });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    // The event claims a year; RevenueCat says a month. RevenueCat wins.
    const res = await deliver(
      db,
      rc,
      purchase({ expiration_at_ms: NOW + 365 * DAY })
    );

    expect(res.statusCode).toBe(200);
    expect(rc.calls).toHaveLength(1);
    expect(rc.calls[0].url).toBe(`${SUBSCRIBERS_API}uid-1`);
    expect(rc.calls[0].init.headers.Authorization).toBe(`Bearer ${REST_KEY}`);
    expect(db.data.get("users/uid-1")).toMatchObject({
      displayName: "Sam",
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
      subscriptionExpiresAt: iso(NOW + 30 * DAY),
      revenueCat: {
        entitlementActive: true,
        store: "app_store",
        syncedAtMs: NOW,
      },
      updatedAt: "SERVER_TIME",
    });
    const record = db.data.get("revenueCatEvents/evt-1");
    expect(record).toEqual({
      type: "INITIAL_PURCHASE",
      results: ["granted"],
      processedAt: "SERVER_TIME",
    });
    expect(JSON.stringify(record)).not.toContain("uid-1");
  });

  it("skips a replayed event without calling RevenueCat again", async () => {
    const db = memoryFirestore({ "users/uid-1": { subscriptionTier: "free" } });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    await deliver(db, rc, purchase());
    const after = structuredClone(db.data.get("users/uid-1"));
    const res = await deliver(db, rc, purchase());
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ duplicate: true });
    expect(rc.calls).toHaveLength(1);
    expect(db.data.get("users/uid-1")).toEqual(after);
  });

  it("takes Pro away when RevenueCat reports the entitlement expired", async () => {
    const db = memoryFirestore({ "users/uid-1": structuredClone(RC_PRO) });
    const rc = fakeRevenueCat({ "uid-1": subscriber({ expires: NOW - DAY }) });
    await deliver(db, rc, purchase({ type: "EXPIRATION", id: "evt-2" }));
    expect(db.data.get("users/uid-1")).toMatchObject({
      subscriptionTier: "free",
      subscriptionSource: null,
      subscriptionExpiresAt: iso(NOW - DAY),
    });
  });

  it("keeps Pro that another path granted when RevenueCat has nothing", async () => {
    const stripePro = { subscriptionTier: "pro", subscriptionSource: "stripe" };
    const db = memoryFirestore({ "users/uid-1": stripePro });
    const rc = fakeRevenueCat({ "uid-1": subscriber({ entitlement: false }) });
    await deliver(db, rc, purchase({ type: "EXPIRATION", id: "evt-3" }));
    expect(db.data.get("users/uid-1")).toMatchObject(stripePro);
    expect(db.data.get("revenueCatEvents/evt-3").results).toEqual(["not-ours"]);
  });

  it("does not let a delivery that finishes late undo a newer snapshot", async () => {
    const newer = {
      ...RC_PRO,
      revenueCat: { ...RC_PRO.revenueCat, syncedAtMs: NOW + 10 },
    };
    const db = memoryFirestore({ "users/uid-1": structuredClone(newer) });
    const rc = fakeRevenueCat({
      "uid-1": subscriber({ expires: NOW - DAY, requestMs: NOW }),
    });
    const res = await deliver(
      db,
      rc,
      purchase({ type: "EXPIRATION", id: "evt-4" })
    );
    expect(res.statusCode).toBe(200);
    expect(db.data.get("users/uid-1")).toEqual(newer);
    expect(db.data.get("revenueCatEvents/evt-4").results).toEqual(["stale"]);
  });

  it("re-reads both accounts in a transfer", async () => {
    const db = memoryFirestore({
      "users/uid-old": structuredClone(RC_PRO),
      "users/uid-new": { subscriptionTier: "free" },
    });
    const rc = fakeRevenueCat({
      "uid-old": subscriber({ entitlement: false }),
      "uid-new": subscriber(),
    });
    await deliver(db, rc, {
      type: "TRANSFER",
      id: "evt-5",
      transferred_from: ["uid-old"],
      transferred_to: ["uid-new"],
    });
    expect(db.data.get("users/uid-old").subscriptionTier).toBe("free");
    expect(db.data.get("users/uid-new").subscriptionTier).toBe("pro");
    expect(db.data.get("revenueCatEvents/evt-5").results).toEqual([
      "revoked",
      "granted",
    ]);
  });

  it("never creates a user, and does not ask RevenueCat about one it cannot find", async () => {
    const db = memoryFirestore();
    const rc = fakeRevenueCat({ "uid-ghost": subscriber() });
    const res = await deliver(
      db,
      rc,
      purchase({ app_user_id: "uid-ghost", id: "evt-6" })
    );
    expect(res.statusCode).toBe(200);
    expect(rc.calls).toHaveLength(0);
    expect(db.data.has("users/uid-ghost")).toBe(false);
    expect(db.data.get("revenueCatEvents/evt-6").results).toEqual(["no-user"]);
  });

  it("ignores anonymous RevenueCat ids", async () => {
    const db = memoryFirestore();
    const rc = fakeRevenueCat({});
    const res = await deliver(
      db,
      rc,
      purchase({ app_user_id: "$RCAnonymousID:abc", id: "evt-7" })
    );
    expect(res.statusCode).toBe(200);
    expect(rc.calls).toHaveLength(0);
    expect(db.data.get("revenueCatEvents/evt-7").results).toEqual([]);
  });

  it("writes nothing to a deleting account, and logs a minimised record instead", async () => {
    const db = memoryFirestore({
      "users/uid-1": { subscriptionTier: "free" },
      "accountDeletionRequests/uid-1": { status: "running" },
    });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    const res = await deliver(db, rc, purchase({ id: "evt-8" }));
    expect(res.statusCode).toBe(200);
    expect(rc.calls).toHaveLength(0);
    expect(db.data.get("users/uid-1")).toEqual({ subscriptionTier: "free" });
    const logged = db.data.get("paymentEventsPostDeletion/revenuecat_evt-8");
    expect(logged).toMatchObject({
      provider: "revenuecat",
      eventType: "INITIAL_PURCHASE",
      action: "logged",
    });
    expect(JSON.stringify(logged)).not.toContain("uid-1");
  });

  it("answers 500 when RevenueCat can't be read, so RevenueCat retries, and records nothing", async () => {
    for (const reply of [
      { status: 500 },
      { status: 429 },
      new Error("socket hang up"),
    ]) {
      const db = memoryFirestore({
        "users/uid-1": { subscriptionTier: "free" },
      });
      const rc = fakeRevenueCat({ "uid-1": reply });
      const res = await deliver(db, rc, purchase({ id: "evt-9" }));
      expect(res.statusCode).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain(REST_KEY);
      expect(db.data.has("revenueCatEvents/evt-9")).toBe(false);
      expect(db.data.get("users/uid-1")).toEqual({ subscriptionTier: "free" });
    }
  });

  it("answers 500 on a response it cannot read, rather than guessing", async () => {
    const db = memoryFirestore({ "users/uid-1": { subscriptionTier: "free" } });
    const rc = fakeRevenueCat({ "uid-1": { subscriber: {} } });
    expect((await deliver(db, rc, purchase({ id: "evt-10" }))).statusCode).toBe(
      500
    );
    expect(db.data.get("users/uid-1")).toEqual({ subscriptionTier: "free" });
  });
});

describe("syncRevenueCatEntitlement", () => {
  const realIsRateLimited = rateLimiter.isRateLimited;
  afterEach(() => {
    rateLimiter.isRateLimited = realIsRateLimited;
  });

  it("needs a signed-in caller", async () => {
    const db = memoryFirestore();
    await expect(
      handleSync({}, deps(db, fakeRevenueCat({}).fetchImpl))
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("makes the buyer Pro straight away and says so", async () => {
    const db = memoryFirestore({ "users/uid-1": { subscriptionTier: "free" } });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    const result = await handleSync(
      { auth: { uid: "uid-1" } },
      deps(db, rc.fetchImpl)
    );
    expect(result).toEqual({
      result: "granted",
      tier: "pro",
      expiresAt: iso(NOW + 30 * DAY),
    });
    expect(db.data.get("users/uid-1").subscriptionTier).toBe("pro");
  });

  it("syncs only the caller", async () => {
    const db = memoryFirestore({ "users/uid-1": {}, "users/uid-2": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriber(), "uid-2": subscriber() });
    await handleSync({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl));
    expect(rc.calls.map((c) => c.url)).toEqual([`${SUBSCRIBERS_API}uid-1`]);
    expect(db.data.get("users/uid-2")).toEqual({});
  });

  it("is rate limited per user, before RevenueCat is called", async () => {
    const seen = [];
    rateLimiter.isRateLimited = async (
      _db,
      uid,
      action,
      maxCalls,
      windowMs
    ) => {
      seen.push({ uid, action, maxCalls, windowMs });
      return true;
    };
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    await expect(
      handleSync({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).rejects.toMatchObject({
      code: "resource-exhausted",
    });
    expect(seen).toEqual([{ uid: "uid-1", ...SYNC_RATE_LIMIT }]);
    expect(rc.calls).toHaveLength(0);
  });

  it("refuses a deleting account before the limiter writes anything", async () => {
    let limiterCalled = false;
    rateLimiter.isRateLimited = async () => {
      limiterCalled = true;
      return false;
    };
    const db = memoryFirestore({
      "users/uid-1": {},
      "accountDeletionRequests/uid-1": { status: "running" },
    });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    await expect(
      handleSync({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).rejects.toBeTruthy();
    expect(limiterCalled).toBe(false);
    expect(rc.calls).toHaveLength(0);
  });

  it("reports unavailable when RevenueCat can't be read, without the key", async () => {
    const db = memoryFirestore({ "users/uid-1": { subscriptionTier: "free" } });
    const rc = fakeRevenueCat({ "uid-1": { status: 503 } });
    const error = await handleSync(
      { auth: { uid: "uid-1" } },
      deps(db, rc.fetchImpl)
    ).catch((e) => e);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(
      JSON.stringify({ message: error.message, details: error.details })
    ).not.toContain(REST_KEY);
    expect(db.data.get("users/uid-1")).toEqual({ subscriptionTier: "free" });
  });

  it("refuses to run with no REST key rather than calling RevenueCat unauthenticated", async () => {
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriber() });
    await expect(
      handleSync(
        { auth: { uid: "uid-1" } },
        deps(db, rc.fetchImpl, { apiKey: undefined })
      )
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(rc.calls).toHaveLength(0);
  });
});

describe("sandbox purchases, through the webhook and the sync", () => {
  it("grant Pro to a listed uid", async () => {
    process.env.REVENUECAT_SANDBOX_UIDS = " uid-owner , ,uid-review ,";
    const db = memoryFirestore({
      "users/uid-owner": { subscriptionTier: "free" },
      "users/uid-review": { subscriptionTier: "free" },
    });
    const rc = fakeRevenueCat({
      "uid-owner": subscriber({ sandbox: true }),
      "uid-review": subscriber({ sandbox: true }),
    });

    const res = await deliver(
      db,
      rc,
      purchase({ app_user_id: "uid-owner", id: "evt-s1" })
    );
    expect(res.statusCode).toBe(200);
    expect(db.data.get("users/uid-owner")).toMatchObject({
      subscriptionTier: "pro",
      subscriptionSource: "ios_iap",
      revenueCat: { entitlementActive: true, sandbox: true },
    });

    expect(
      await handleSync({ auth: { uid: "uid-review" } }, deps(db, rc.fetchImpl))
    ).toEqual({
      result: "granted",
      tier: "pro",
      expiresAt: iso(NOW + 30 * DAY),
    });
    expect(refusals()).toEqual([]);
  });

  it("grant nothing to anyone else, and log the refusal without a transaction id", async () => {
    process.env.REVENUECAT_SANDBOX_UIDS = "uid-owner";
    const db = memoryFirestore({ "users/uid-1": { subscriptionTier: "free" } });
    const rc = fakeRevenueCat({ "uid-1": subscriber({ sandbox: true }) });

    const res = await deliver(db, rc, purchase({ id: "evt-s2" }));
    expect(res.statusCode).toBe(200);
    expect(db.data.get("revenueCatEvents/evt-s2").results).toEqual([
      "not-ours",
    ]);
    expect(
      await handleSync({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).toEqual({ result: "not-ours", tier: "free", expiresAt: null });

    const user = db.data.get("users/uid-1");
    expect(user).toMatchObject({
      subscriptionTier: "free",
      revenueCat: { entitlementActive: false, sandbox: true },
    });
    expect(user).not.toHaveProperty("subscriptionSource");
    expect(user).not.toHaveProperty("subscriptionExpiresAt");

    const refused = {
      uid: "uid-1",
      store: "app_store",
      productId: MONTHLY,
      result: "not-ours",
    };
    expect(refusals()).toEqual([
      ["warn", "revenueCat.sandbox_refused", refused],
      ["warn", "revenueCat.sandbox_refused", refused],
    ]);
    const printed = JSON.stringify(logs);
    expect(printed).not.toContain(STORE_TRANSACTION_ID);
    expect(printed).not.toContain(purchase().original_transaction_id);
  });

  it("leave Pro from another source alone", async () => {
    process.env.REVENUECAT_SANDBOX_UIDS = "uid-owner";
    const stripePro = { subscriptionTier: "pro", subscriptionSource: "stripe" };
    const db = memoryFirestore({ "users/uid-1": structuredClone(stripePro) });
    const rc = fakeRevenueCat({ "uid-1": subscriber({ sandbox: true }) });
    await deliver(db, rc, purchase({ id: "evt-s3" }));
    await handleSync({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl));
    expect(db.data.get("users/uid-1")).toMatchObject(stripePro);
    expect(refusals()).toHaveLength(2);
  });

  it("grant nothing to anybody while the list is unset or empty", async () => {
    for (const [i, value] of [undefined, "", "   ", " , ,"].entries()) {
      if (value === undefined) delete process.env.REVENUECAT_SANDBOX_UIDS;
      else process.env.REVENUECAT_SANDBOX_UIDS = value;
      const name = JSON.stringify(value);
      const db = memoryFirestore({
        "users/uid-1": { subscriptionTier: "free" },
      });
      const rc = fakeRevenueCat({ "uid-1": subscriber({ sandbox: true }) });
      await deliver(db, rc, purchase({ id: `evt-empty-${i}` }));
      const synced = await handleSync(
        { auth: { uid: "uid-1" } },
        deps(db, rc.fetchImpl)
      );
      expect(synced.tier, name).toBe("free");
      expect(db.data.get("users/uid-1").subscriptionTier, name).toBe("free");
    }
  });

  it("still grant a production purchase with no list at all", async () => {
    const db = memoryFirestore({
      "users/uid-1": { subscriptionTier: "free" },
      "users/uid-2": { subscriptionTier: "free" },
    });
    const rc = fakeRevenueCat({
      "uid-1": subscriber(),
      "uid-2": subscriber(),
    });
    await deliver(db, rc, purchase({ id: "evt-s5" }));
    expect(db.data.get("users/uid-1").subscriptionTier).toBe("pro");
    expect(
      await handleSync({ auth: { uid: "uid-2" } }, deps(db, rc.fetchImpl))
    ).toMatchObject({ result: "granted", tier: "pro" });
    expect(refusals()).toEqual([]);
  });
});
