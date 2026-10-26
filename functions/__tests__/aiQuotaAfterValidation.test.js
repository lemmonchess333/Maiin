/**
 * A malformed AI food request is refused before it costs a scan.
 *
 * checkDailyAiQuota increments the day's counter as it checks it, so the
 * handlers must check the request first. They checked it after: a request
 * with no image, an oversized one, or empty text spent one of a Pro
 * account's scans and was then refused. And `text.trim()` ran before the
 * type check, so a non-string body answered 500 instead of 400.
 *
 * Driven whole, as aiConsent.test.js drives them: the real handler with the
 * Admin SDK's auth, credential and Firestore swapped for a token check, a
 * stub token and an in-memory Firestore. The kill switch is ON here, so a
 * request reaches the rate limit, the quota and the body checks. The one
 * well-formed request per endpoint gets as far as the model call, which a
 * stubbed fetch refuses: it proves the counter IS written for a counted
 * request, so the "nothing counted" assertions are not vacuous.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { analyzeFood, analyzeFoodText } = require("../index");

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

function installAdmin(db, uid = "u1") {
  // The rate limiter and the quota write `admin.firestore.FieldValue`
  // sentinels, so the stand-in keeps the real namespace's statics; without
  // them the rate limiter throws, fails closed and answers 429.
  const real = admin.firestore;
  const firestore = Object.assign(() => db, {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
  });
  Object.defineProperty(admin, "firestore", {
    configurable: true,
    get: () => firestore,
  });
  Object.defineProperty(admin, "auth", {
    configurable: true,
    get: () => () => ({ verifyIdToken: async () => ({ uid, email: "" }) }),
  });
  Object.defineProperty(admin, "credential", {
    configurable: true,
    get: () => ({
      applicationDefault: () => ({
        getAccessToken: async () => ({ access_token: "test-access-token" }),
      }),
    }),
  });
}

afterEach(() => {
  delete admin.firestore;
  delete admin.auth;
  delete admin.credential;
  vi.unstubAllGlobals();
});

/** A Pro account that has said yes to AI analysis, with the scan on. */
function seed() {
  return memoryFirestore({
    "users/u1": { subscriptionTier: "pro", aiAnalysisEnabled: true },
    "config/flags": { geminiEnabled: true },
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

const counted = (db) => db.data.has("scanUsage/u1");

describe.each([
  [
    "analyzeFood",
    analyzeFood,
    { imageBase64: "aGVsbG8=" },
    [
      ["no image", {}],
      ["an empty image", { imageBase64: "" }],
      ["an image that is not a string", { imageBase64: 42 }],
      ["an image past the size cap", { imageBase64: "a".repeat(5000001) }],
      ["no body at all", undefined],
    ],
  ],
  [
    "analyzeFoodText",
    analyzeFoodText,
    { text: "2 eggs and toast" },
    [
      ["no text", {}],
      ["only whitespace", { text: "   " }],
      ["text that is not a string", { text: 42 }],
      ["text past the length cap", { text: "a".repeat(5001) }],
      ["no body at all", undefined],
    ],
  ],
])(
  "%s — the request is checked before a scan is spent",
  (_name, handler, good, bad) => {
    it("counts a well-formed request (the anchor for the cases below)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 503,
          text: async () => "unavailable",
          json: async () => ({}),
        }))
      );
      const db = seed();
      installAdmin(db);
      await post(handler, good);
      expect(counted(db)).toBe(true);
    });

    it.each(bad)(
      "refuses %s with 400 and spends no scan",
      async (_label, body) => {
        const db = seed();
        installAdmin(db);
        const res = await post(handler, body);
        expect(res.statusCode).toBe(400);
        expect(counted(db)).toBe(false);
      }
    );
  }
);

/* A scan the service failed, not the person, is given back. It cost the
   day's scan all the same, and answered "AI service error". */
describe.each([
  ["analyzeFood", analyzeFood, { imageBase64: "aGVsbG8=" }, "image_ai"],
  ["analyzeFoodText", analyzeFoodText, { text: "2 eggs and toast" }, "text_ai"],
])(
  "%s — a scan the service failed costs nothing",
  (_name, handler, good, action) => {
    const model = (status, body) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: status >= 200 && status < 300,
          status,
          text: async () => JSON.stringify(body),
          json: async () => body,
        }))
      );
    const spent = (db) => db.data.get("scanUsage/u1")?.[action]?.count;
    const answer = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"foodName":"Eggs","items":[],"totalCalories":150,"totalProtein":12,"totalCarbs":1,"totalFat":10,"confidence":"high"}',
              },
            ],
          },
        },
      ],
    };

    it("keeps the charge for a scan that worked (the anchor)", async () => {
      model(200, answer);
      const db = seed();
      installAdmin(db);
      const res = await post(handler, good);
      expect(res.statusCode).toBe(200);
      expect(spent(db)).toBe(1);
    });

    it("says the model is busy, and gives the scan back", async () => {
      model(429, { error: { status: "RESOURCE_EXHAUSTED" } });
      const db = seed();
      installAdmin(db);
      const res = await post(handler, good);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({
        error: "ai-busy",
        message:
          "Food analysis is busy right now. Try again in a minute. This one didn't use a scan.",
      });
      expect(spent(db)).toBe(0);
    });

    it.each([
      ["a model error", () => model(500, {})],
      ["an answer with nothing to read", () => model(200, { candidates: [] })],
    ])("gives the scan back after %s", async (_label, arrange) => {
      arrange();
      const db = seed();
      installAdmin(db);
      const res = await post(handler, good);
      expect(res.statusCode).toBe(500);
      expect(res.body.message).toMatch(/didn't use a scan/);
      expect(spent(db)).toBe(0);
    });

    it("keeps the charge when the model refused the request itself", async () => {
      model(400, { error: { status: "INVALID_ARGUMENT" } });
      const db = seed();
      installAdmin(db);
      const res = await post(handler, good);
      expect(res.statusCode).toBe(500);
      expect(spent(db)).toBe(1);
    });
  }
);
