/**
 * getSubscriptionManagementUrl — the web's Manage subscription (owner,
 * 13 Nov 2026: web sales through RevenueCat Billing on Stripe), driven
 * whole: the real handler, deletion lock and limiter, an in-memory
 * Firestore and a fake RevenueCat REST API.
 *
 *   - The subscriber is the signed-in person's own; nothing is read from
 *     the request.
 *   - It returns RevenueCat's management link, https only.
 *   - No link says, in words for the person, where theirs is managed.
 *   - RevenueCat down is "try again", not a wrong answer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* firebase-functions/v1 needs a project id to construct triggers. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { _internals } = require("../revenueCat");
const {
  handleManagementUrl,
  readManagementUrl,
  NO_MANAGEMENT_URL,
  SUBSCRIBERS_API,
} = _internals;

const PORTAL = "https://billing.revenuecat.example/portal/abc123";

function fakeRevenueCat(byUid) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const reply = byUid[decodeURIComponent(url.slice(SUBSCRIBERS_API.length))];
    if (reply instanceof Error) throw reply;
    if (!reply) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(reply) };
  };
  return { fetchImpl, calls };
}

const subscriberWith = (management_url) => ({
  request_date_ms: Date.parse("2026-11-13T12:00:00Z"),
  subscriber: { entitlements: {}, subscriptions: {}, management_url },
});

let logs;
function deps(db, fetchImpl) {
  const logger = {};
  for (const level of ["log", "info", "warn", "error"]) {
    logger[level] = (...args) => logs.push([level, ...args]);
  }
  return { db, apiKey: "sk_rest", fetchImpl, logger };
}

beforeEach(() => {
  logs = [];
});

describe("getSubscriptionManagementUrl", () => {
  it("returns RevenueCat's management link for the signed-in person", async () => {
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriberWith(PORTAL) });
    await expect(
      handleManagementUrl({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).resolves.toEqual({ url: PORTAL });
    expect(rc.calls).toEqual([SUBSCRIBERS_API + "uid-1"]);
  });

  it("asks a signed-out caller to sign in, and reads nothing", async () => {
    const rc = fakeRevenueCat({});
    await expect(
      handleManagementUrl({}, deps(memoryFirestore(), rc.fetchImpl))
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(rc.calls).toEqual([]);
  });

  it("says where a subscription is managed when RevenueCat has no link", async () => {
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": subscriberWith(null) });
    await expect(
      handleManagementUrl({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).rejects.toMatchObject({
      code: "failed-precondition",
      message: NO_MANAGEMENT_URL,
    });
  });

  it("asks to try again when RevenueCat cannot be read", async () => {
    const db = memoryFirestore({ "users/uid-1": {} });
    const rc = fakeRevenueCat({ "uid-1": new Error("socket hang up") });
    await expect(
      handleManagementUrl({ auth: { uid: "uid-1" } }, deps(db, rc.fetchImpl))
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("readManagementUrl", () => {
  it("keeps an https link and refuses anything else", () => {
    expect(readManagementUrl(subscriberWith(PORTAL))).toBe(PORTAL);
    expect(
      readManagementUrl(subscriberWith("http://example.com/x"))
    ).toBeNull();
    expect(readManagementUrl(subscriberWith("javascript:alert(1)"))).toBeNull();
    expect(readManagementUrl(subscriberWith("not a url"))).toBeNull();
    expect(readManagementUrl({})).toBeNull();
  });
});
