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
import { scanQuotaDayKey, nextScanQuotaReset } from "../scanQuotaDay";

const require = createRequire(import.meta.url);
// aiScanQuota.js imports firebase-admin but only touches it inside functions,
// so requiring the module for its constants needs no admin init.
const {
  DAILY_LIMITS,
  quotaDayKey,
} = require("../../../functions/lib/aiScanQuota");

describe("AI scan quota — client DAILY_AI_LIMITS ↔ server DAILY_LIMITS parity", () => {
  it("the two copies are byte-identical", () => {
    expect(DAILY_LIMITS).toEqual(DAILY_AI_LIMITS);
  });

  // Pin the actual locked values too, so a same-direction edit on BOTH copies
  // (which the equality test alone would pass) still surfaces in review.
  it("pins the locked F1b tiers/actions", () => {
    expect(DAILY_AI_LIMITS).toEqual({
      free: { text_ai: 0, image_ai: 0 },
      pro: { text_ai: 100, image_ai: 100 },
    });
  });

  it("keeps AI Pro-only (free = 0 drives the upgrade CTA; #1102)", () => {
    expect(DAILY_AI_LIMITS.free).toEqual({ text_ai: 0, image_ai: 0 });
    expect(DAILY_LIMITS.free).toEqual({ text_ai: 0, image_ai: 0 });
  });
});

/**
 * The day a count belongs to. The server counts by the UTC date; the app
 * reads `scanUsage/{uid}` by `scanQuotaDayKey`. If the two named different
 * days, Settings would show 0 used beside a server refusing the next scan,
 * or a full count the server had already started again. CI runs this in
 * Kiritimati, Midway and Auckland, where a local date differs from the
 * UTC one for part of every day.
 */
describe("AI scan quota — client scanQuotaDayKey ↔ server quotaDayKey", () => {
  const instants = [
    "2026-05-25T00:00:00.000Z",
    "2026-05-25T09:59:59.999Z", // 23:59 on the 25th in Kiritimati
    "2026-05-25T10:00:00.000Z", // 00:00 on the 26th in Kiritimati
    "2026-05-25T10:59:59.999Z", // 23:59 on the 24th in Midway
    "2026-05-25T11:00:00.000Z", // 00:00 on the 25th in Midway
    "2026-05-25T23:59:59.999Z",
    "2026-04-04T14:30:00.000Z", // just after Auckland leaves daylight time
    "2026-12-31T23:30:00.000Z",
  ].map((iso) => new Date(iso));

  it("name the same day for every instant", () => {
    for (const now of instants) {
      expect(scanQuotaDayKey(now)).toBe(quotaDayKey(now));
    }
  });

  it("name the UTC date, whatever zone the device is in", () => {
    expect(scanQuotaDayKey(new Date("2026-05-25T23:30:00Z"))).toBe(
      "2026-05-25"
    );
    expect(scanQuotaDayKey(new Date("2026-05-25T10:30:00Z"))).toBe(
      "2026-05-25"
    );
  });

  it("start again at the next 00:00 UTC, the moment the server's key changes", () => {
    for (const now of instants) {
      const reset = nextScanQuotaReset(now);
      expect(reset.getTime()).toBeGreaterThan(now.getTime());
      expect(quotaDayKey(reset)).not.toBe(quotaDayKey(now));
      expect(quotaDayKey(new Date(reset.getTime() - 1))).toBe(quotaDayKey(now));
    }
  });
});
