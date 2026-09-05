/**
 * Pins the CORS gate on the two AI endpoints. Both are driven directly as
 * onRequest handlers with a synthetic req/res: a disallowed origin must
 * be answered 403 BEFORE auth runs (so no 401 and no Firestore touch),
 * while an allowed origin walks through to the handler, whose first gate
 * is the Bearer check.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

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

async function post(handler, headers) {
  const { res, done } = makeMockRes();
  handler({ method: "POST", headers, body: {} }, res);
  await done;
  return res;
}

async function preflight(handler, origin) {
  const { res, done } = makeMockRes();
  handler(
    {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
      body: {},
    },
    res
  );
  await done;
  return res;
}

describe.each([
  ["analyzeFood", analyzeFood],
  ["analyzeFoodText", analyzeFoodText],
])("%s — CORS gate", (_name, handler) => {
  it("answers 403 to a disallowed origin without reaching auth", async () => {
    const res = await post(handler, { origin: "https://evil.example" });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Origin not allowed" });
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("answers 403 to a disallowed preflight with no allow-origin header", async () => {
    const res = await preflight(handler, "https://evil.example");
    expect(res.statusCode).toBe(403);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it.each([
    "https://troposfit.com",
    "https://lemmonchess333.github.io",
    "https://adaptive-fitness-af8bb.web.app",
    "capacitor://localhost",
    "https://localhost",
    "http://localhost:5173",
  ])("reflects %s on a preflight and ends it 204", async (origin) => {
    const res = await preflight(handler, origin);
    expect(res.statusCode).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(origin);
  });

  it("runs the handler for an allowed origin — the Bearer gate answers 401", async () => {
    const res = await post(handler, { origin: "capacitor://localhost" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(
      "capacitor://localhost"
    );
  });

  it("runs the handler when Origin is absent (non-browser caller)", async () => {
    const res = await post(handler, {});
    expect(res.statusCode).toBe(401);
  });
});
