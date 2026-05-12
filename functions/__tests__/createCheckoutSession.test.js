/**
 * Pins the auth-ordering invariant on createCheckoutSession.
 *
 * An unauthenticated POST with bad checkout URLs MUST return 401,
 * not 400. The handler validates auth before body shape and before
 * URL allowlist — otherwise the response shape leaks which layer
 * ran, and a brute-force attacker can probe the URL validator
 * before authenticating.
 *
 * If this test breaks, do NOT "fix" it by changing the assertion.
 * The handler ordering has regressed. See
 * functions/index.js exports.createCheckoutSession for the layered
 * order: 405 → verifyAuth → body shape → ownership → URL allowlist
 * → price allowlist → Stripe.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Minimal Express-style res mock. The handler is wrapped in cors()
 * middleware which expects standard res methods; only `status` +
 * `json` are exercised in the failure paths under test. The
 * `done` promise resolves on the first `.json(...)` call so the
 * test can await the response without polling.
 */
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
    set(key, value) {
      this.headers[key] = value;
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

describe("createCheckoutSession auth ordering", () => {
  it("returns 401 (not 400) when Authorization is missing and the URL is invalid", async () => {
    // Requiring ../index boots admin.initializeApp() as a side
    // effect. We never hit any RPC because verifyAuth rejects on
    // the missing Bearer prefix before touching admin.auth().
    const { createCheckoutSession } = require("../index");

    const req = {
      method: "POST",
      headers: {},
      body: {
        successUrl: "https://evil.example/x",
        cancelUrl: "https://evil.example/y",
        priceId: "price_test",
      },
    };
    const { res, done } = makeMockRes();

    // The handler is wrapped in cors(); calling it directly with
    // a synthetic req/res walks straight through to the inner
    // async block in non-preflight mode.
    createCheckoutSession(req, res);
    await done;

    expect(res.statusCode).toBe(401);
    expect(res.body && res.body.code).not.toBe("INVALID_RETURN_URL");
  });

  it("returns 401 (not 400) when Authorization is a malformed bearer header", async () => {
    // Belt-and-braces: even a present-but-malformed token must
    // surface as 401, never bleed into the body/URL paths.
    const { createCheckoutSession } = require("../index");

    const req = {
      method: "POST",
      headers: { authorization: "NotABearer xyz" },
      body: {
        successUrl: "https://evil.example/x",
        cancelUrl: "https://evil.example/y",
      },
    };
    const { res, done } = makeMockRes();

    createCheckoutSession(req, res);
    await done;

    expect(res.statusCode).toBe(401);
    expect(res.body && res.body.code).not.toBe("INVALID_RETURN_URL");
  });

  it("returns 405 for non-POST methods before auth runs", async () => {
    // Method check stays first so a GET probe doesn't even reach
    // verifyAuth (which would log a token-verification miss).
    const { createCheckoutSession } = require("../index");

    const req = { method: "GET", headers: {}, body: {} };
    const { res, done } = makeMockRes();

    createCheckoutSession(req, res);
    await done;

    expect(res.statusCode).toBe(405);
  });
});
