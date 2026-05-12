/**
 * PR Q: unit tests for pure helpers extracted from index.js.
 * Imports `../helpers` rather than the index entrypoint so admin
 * SDK initialisation doesn't run during the test boot.
 *
 * Vitest requires ESM `import` for its own module, but helpers.js
 * is CommonJS — we use createRequire to import it cleanly without
 * dropping the rest of functions/ into ESM (which would require
 * editing every require() in index.js / appleIAP.js / etc.).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  pruneOldTimestamps,
  computeEffectiveTier,
  currentMonthCount,
  getStripePriceAllowlist,
} = require("../helpers");

describe("pruneOldTimestamps", () => {
  it("keeps timestamps inside the window", () => {
    const now = 10_000;
    const result = pruneOldTimestamps([9_500, 9_800, 9_999], now, 1_000);
    expect(result).toEqual([9_500, 9_800, 9_999]);
  });

  it("drops timestamps outside the window", () => {
    const now = 10_000;
    const result = pruneOldTimestamps([8_000, 8_500, 9_900], now, 1_000);
    expect(result).toEqual([9_900]);
  });

  it("drops the boundary exactly at windowMs (now - t < windowMs is strict)", () => {
    // t = 9000 is exactly 1000ms old; predicate is `<`, not `<=`,
    // so this drops. The original docstring explicitly chose this
    // semantic so the rate limit clears one tick faster.
    const now = 10_000;
    const result = pruneOldTimestamps([9_000, 9_001], now, 1_000);
    expect(result).toEqual([9_001]);
  });

  it("returns [] for non-array input (defensive)", () => {
    expect(pruneOldTimestamps(undefined, 10_000, 1_000)).toEqual([]);
    expect(pruneOldTimestamps(null, 10_000, 1_000)).toEqual([]);
    expect(pruneOldTimestamps("nope", 10_000, 1_000)).toEqual([]);
  });

  it("filters out non-number entries (defensive)", () => {
    const result = pruneOldTimestamps(
      [9_500, "9500", null, undefined, 9_800],
      10_000,
      1_000,
    );
    expect(result).toEqual([9_500, 9_800]);
  });

  it("returns [] for an empty array", () => {
    expect(pruneOldTimestamps([], 10_000, 1_000)).toEqual([]);
  });
});

describe("computeEffectiveTier", () => {
  it("returns 'free' for null / undefined userData", () => {
    expect(computeEffectiveTier(null)).toBe("free");
    expect(computeEffectiveTier(undefined)).toBe("free");
  });

  it("returns 'pro' when subscriptionTier === 'pro'", () => {
    expect(computeEffectiveTier({ subscriptionTier: "pro" })).toBe("pro");
  });

  it("paid pro wins even when trial has expired", () => {
    expect(
      computeEffectiveTier({
        subscriptionTier: "pro",
        trialExpiresAt: "2020-01-01T00:00:00Z",
      }),
    ).toBe("pro");
  });

  it("returns 'pro' for an unexpired trial", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(
      computeEffectiveTier({ trialExpiresAt: future }, new Date()),
    ).toBe("pro");
  });

  it("returns 'free' for an expired trial", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      computeEffectiveTier({ trialExpiresAt: past }, new Date()),
    ).toBe("free");
  });

  it("returns 'free' when trialExpiresAt is malformed", () => {
    expect(
      computeEffectiveTier({ trialExpiresAt: "not-a-date" }, new Date()),
    ).toBe("free");
  });

  it("returns 'free' when both fields are absent", () => {
    expect(computeEffectiveTier({})).toBe("free");
  });
});

describe("currentMonthCount", () => {
  it("returns 0 for null / undefined usage", () => {
    expect(currentMonthCount(null, "2026-05")).toBe(0);
    expect(currentMonthCount(undefined, "2026-05")).toBe(0);
  });

  it("returns 0 when the stored month differs (rollover)", () => {
    expect(currentMonthCount({ month: "2026-04", count: 9 }, "2026-05")).toBe(0);
  });

  it("returns the count when months match", () => {
    expect(currentMonthCount({ month: "2026-05", count: 7 }, "2026-05")).toBe(7);
  });

  it("coerces non-number count to 0 via Number()", () => {
    expect(currentMonthCount({ month: "2026-05", count: "5" }, "2026-05")).toBe(5);
    expect(currentMonthCount({ month: "2026-05", count: null }, "2026-05")).toBe(0);
    expect(currentMonthCount({ month: "2026-05", count: NaN }, "2026-05")).toBe(0);
  });
});

describe("getStripePriceAllowlist", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STRIPE_PRICE_ID_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_YEARLY;
    delete process.env.STRIPE_PRICE_ID_LIFETIME;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns empty object when no env vars set (fail-closed)", () => {
    expect(getStripePriceAllowlist()).toEqual({});
  });

  it("includes monthly when STRIPE_PRICE_ID_MONTHLY set", () => {
    process.env.STRIPE_PRICE_ID_MONTHLY = "price_monthly_abc";
    expect(getStripePriceAllowlist()).toEqual({
      price_monthly_abc: { kind: "monthly", mode: "subscription" },
    });
  });

  it("includes yearly + lifetime with correct modes", () => {
    process.env.STRIPE_PRICE_ID_YEARLY = "price_y";
    process.env.STRIPE_PRICE_ID_LIFETIME = "price_l";
    const allowlist = getStripePriceAllowlist();
    expect(allowlist.price_y).toEqual({ kind: "yearly", mode: "subscription" });
    expect(allowlist.price_l).toEqual({ kind: "lifetime", mode: "payment" });
  });

  it("includes all three when all env vars set", () => {
    process.env.STRIPE_PRICE_ID_MONTHLY = "m";
    process.env.STRIPE_PRICE_ID_YEARLY = "y";
    process.env.STRIPE_PRICE_ID_LIFETIME = "l";
    const allowlist = getStripePriceAllowlist();
    expect(Object.keys(allowlist).sort()).toEqual(["l", "m", "y"]);
  });

  it("reads env at call time (not import time)", () => {
    expect(getStripePriceAllowlist()).toEqual({});
    process.env.STRIPE_PRICE_ID_MONTHLY = "new_after_import";
    expect(getStripePriceAllowlist()).toEqual({
      new_after_import: { kind: "monthly", mode: "subscription" },
    });
  });
});
