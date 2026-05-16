/**
 * Pins the auth-precedence contract on the v7 plan-writing CFs.
 *
 * Both `completeOnboarding` (updated in P0-4 to accept the v7
 * payload) and `configurePlan` (new in P0-4) MUST reject
 * unauthenticated requests BEFORE any rate-limit / validation /
 * Firestore touch. This is the same authentication-first
 * principle the createCheckoutSession.test.js pins for the
 * Stripe checkout endpoint — auth must be the first gate so a
 * brute-force attacker can't probe downstream layers without a
 * valid token.
 *
 * onCall's wrapped handler exposes `.run(data, context)` for
 * direct unit-test invocation — no firebase-functions-test or
 * emulator needed for the unauthenticated path.
 *
 * Authenticated-but-invalid paths (rate-limited, malformed
 * payload, missing schema versions) require either an
 * emulator-gated integration test or a Vitest mock of the rate
 * limiter — those live in
 * `__tests__/integration/configurePlan.test.js` (deferred,
 * follows the rateLimiter integration test pattern).
 *
 * The validator itself (validatePlanPayload.test.js) covers the
 * "invalid plan payload" error shape (36 tests across 7
 * describe blocks). The CF wrapper here translates non-empty
 * errors into HttpsError("invalid-argument") which is glue
 * verified in code review + the emulator-gated integration
 * tests once they land.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("completeOnboarding — auth precedence", () => {
  it("rejects when context.auth is missing", async () => {
    // Requiring ../index boots admin.initializeApp() as a side
    // effect. We never hit any RPC because the auth guard runs
    // first.
    const { completeOnboarding } = require("../index");
    // onCall exposes .run(data, context) for direct invocation
    // of the inner async handler.
    await expect(
      completeOnboarding.run({}, {}),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects when context.auth is explicitly null", async () => {
    const { completeOnboarding } = require("../index");
    await expect(
      completeOnboarding.run({ profileData: {} }, { auth: null }),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});

describe("configurePlan — auth precedence", () => {
  it("rejects when context.auth is missing", async () => {
    const { configurePlan } = require("../index");
    await expect(
      configurePlan.run({}, {}),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("rejects when context.auth is explicitly null", async () => {
    const { configurePlan } = require("../index");
    await expect(
      configurePlan.run({ profileUpdates: {} }, { auth: null }),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
