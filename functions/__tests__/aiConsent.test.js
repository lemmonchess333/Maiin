/**
 * Permission before food goes to AI — the server's half.
 *
 * analyzeFood and analyzeFoodText refuse an account whose
 * `aiAnalysisEnabled` is false, with failed-precondition and the reason
 * "ai-analysis-disabled", BEFORE the kill switch, the rate limit and the
 * quota: a refused request writes nothing and costs the person nothing.
 * Undefined (not asked yet) and true are let through.
 *
 * The handlers are driven whole — the real CORS wrapper, the real deletion
 * lock, the real gate — with the Admin SDK's auth and Firestore swapped
 * for a token check that names the caller and an in-memory Firestore. A
 * request that gets past the gate is stopped by the kill switch
 * (`config/flags.geminiEnabled = false`), which answers 503 with its own
 * message: that 503 is the positive proof the gate let it through, and it
 * keeps every test away from Vertex AI.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const aiConsent = require("../lib/aiConsent");
const { analyzeFood, analyzeFoodText } = require("../index");

const KILL_SWITCH_MESSAGE =
  "AI food scan is temporarily unavailable. Please use manual entry.";

function makeMockRes() {
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const res = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      resolveDone();
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    getHeader(key) {
      return this.headers[key];
    },
    end() {
      resolveDone();
      return this;
    },
  };
  return { res, done };
}

/** Point the Admin SDK at `db`, with every token belonging to `uid`. */
function installAdmin(db, uid = "u1") {
  Object.defineProperty(admin, "firestore", {
    configurable: true,
    get: () => () => db,
  });
  Object.defineProperty(admin, "auth", {
    configurable: true,
    get: () => () => ({ verifyIdToken: async () => ({ uid, email: "" }) }),
  });
}

afterEach(() => {
  // Back to the prototype's getters.
  delete admin.firestore;
  delete admin.auth;
});

function seed(user) {
  return memoryFirestore({
    ...(user === undefined ? {} : { "users/u1": user }),
    "config/flags": { geminiEnabled: false },
  });
}

async function post(handler, body) {
  const { res, done } = makeMockRes();
  handler(
    {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body,
    },
    res
  );
  await done;
  return res;
}

/** Documents the request wrote: rate-limit windows, scan counters. */
function writesBeyondSeed(db) {
  return [...db.data.keys()].filter(
    (path) => path !== "users/u1" && path !== "config/flags"
  );
}

describe.each([
  ["analyzeFood", analyzeFood, { imageBase64: "aGVsbG8=" }],
  ["analyzeFoodText", analyzeFoodText, { text: "2 eggs" }],
])("%s — permission before food goes to AI", (_name, handler, body) => {
  it("refuses an account that has turned AI analysis off, before anything is counted", async () => {
    const db = seed({ aiAnalysisEnabled: false, subscriptionTier: "pro" });
    installAdmin(db);
    const res = await post(handler, body);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: aiConsent.AI_ANALYSIS_DISABLED_MESSAGE,
      code: "failed-precondition",
      reason: "ai-analysis-disabled",
    });
    // Refused ahead of the rate limit and the quota: no window opened,
    // no scan counted.
    expect(writesBeyondSeed(db)).toEqual([]);
  });

  it.each([
    ["not asked yet (older clients)", {}],
    ["allowed", { aiAnalysisEnabled: true }],
  ])("lets an account through when %s", async (_label, user) => {
    const db = seed({ ...user, subscriptionTier: "pro" });
    installAdmin(db);
    const res = await post(handler, body);
    // Past the gate, stopped by the kill switch.
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: KILL_SWITCH_MESSAGE });
  });

  it("fails closed when the account can't be read", async () => {
    const db = seed({ aiAnalysisEnabled: true });
    db.failures.set("get:users/u1", new Error("unavailable"));
    installAdmin(db);
    const res = await post(handler, body);
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ transient: true });
    expect(res.body.error).toMatch(/Couldn't check your AI settings/);
    expect(writesBeyondSeed(db)).toEqual([]);
  });
});

describe("checkAiAnalysisConsent", () => {
  it("refuses only an explicit false", async () => {
    const answers = await Promise.all(
      [false, true, undefined, null].map(async (value) => {
        const db = memoryFirestore(
          value === undefined
            ? { "users/u1": {} }
            : { "users/u1": { aiAnalysisEnabled: value } }
        );
        return aiConsent.checkAiAnalysisConsent(db, "u1");
      })
    );
    expect(answers).toEqual([
      { allowed: false, reason: "ai-analysis-disabled" },
      { allowed: true },
      { allowed: true },
      { allowed: true },
    ]);
  });

  it("lets a missing user document through, as not asked", async () => {
    const db = memoryFirestore({});
    await expect(aiConsent.checkAiAnalysisConsent(db, "u1")).resolves.toEqual({
      allowed: true,
    });
  });
});
