/**
 * Cross-consistency test for the daily AI-scan limits.
 *
 * The limits live in two copies: the client `DAILY_AI_LIMITS`
 * (`src/lib/subscription.ts`, drives the Scan-Meal CTA + usage display) and the
 * server `DAILY_LIMITS` (`functions/lib/aiScanQuota.js`, the AUTHORITATIVE gate
 * that actually allows/denies a scan). The client comment already says "Both
 * must move together if the lock is renegotiated" — but nothing enforced it.
 * If they drift, the UI promises a quota the server won't honour (or hides one
 * it would). This pins them byte-identical so drift fails CI.
 *
 * Same mirror+parity discipline as performanceEngineParity / runModeResolution /
 * scheduledRunCompletion / challengeTiers.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { DAILY_AI_LIMITS } from "../subscription";

const require = createRequire(import.meta.url);
// aiScanQuota.js imports firebase-admin but only touches it inside functions,
// so requiring the module for its constants needs no admin init.
const { DAILY_LIMITS } = require("../../../functions/lib/aiScanQuota");

describe("AI scan quota — client DAILY_AI_LIMITS ↔ server DAILY_LIMITS parity", () => {
  it("the two copies are byte-identical", () => {
    expect(DAILY_LIMITS).toEqual(DAILY_AI_LIMITS);
  });

  // Pin the actual locked values too, so a same-direction edit on BOTH copies
  // (which the equality test alone would pass) still surfaces in review.
  it("pins the locked F1b tiers/actions", () => {
    expect(DAILY_AI_LIMITS).toEqual({
      free: { text_ai: 10, image_ai: 0 },
      pro: { text_ai: 100, image_ai: 100 },
    });
  });

  it("keeps image AI Pro-only (free = 0 drives the upgrade CTA)", () => {
    expect(DAILY_AI_LIMITS.free.image_ai).toBe(0);
    expect(DAILY_LIMITS.free.image_ai).toBe(0);
  });
});
