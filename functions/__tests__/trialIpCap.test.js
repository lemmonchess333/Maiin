/**
 * Free-week cap per address — Sub1a pin 1's mitigation.
 *
 * Pins: the address is read as the platform saw it (first forwarded hop,
 * then the request's own); the limiter key is a hash and never the
 * address; the cap rides the shared limiter with the locked window and
 * count; and with no address there is nothing to count, so the grant is
 * not withheld — the emulator and the harnesses send none.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TRIAL_IP_CAP,
  TRIAL_IP_WINDOW_MS,
  TRIAL_IP_ACTION,
  callerIp,
  ipKey,
  isTrialGrantCapped,
} = require("../lib/trialIpCap");

describe("trialIpCap.callerIp", () => {
  it("takes the first forwarded hop, trimmed", () => {
    expect(
      callerIp({ headers: { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" } })
    ).toBe("203.0.113.9");
    expect(
      callerIp({ headers: { "x-forwarded-for": ["198.51.100.2", "10.0.0.1"] } })
    ).toBe("198.51.100.2");
  });

  it("falls back to the request's own address, and to nothing", () => {
    expect(callerIp({ headers: {}, ip: "192.0.2.4" })).toBe("192.0.2.4");
    expect(callerIp({ headers: {} })).toBeNull();
    expect(callerIp(undefined)).toBeNull();
    expect(callerIp({ headers: { "x-forwarded-for": "" }, ip: "" })).toBeNull();
  });
});

describe("trialIpCap.ipKey", () => {
  it("is stable per address and never contains the address", () => {
    const a = ipKey("203.0.113.9");
    expect(a).toBe(ipKey("203.0.113.9"));
    expect(a).not.toBe(ipKey("203.0.113.10"));
    expect(a).toMatch(/^ip_[0-9a-f]{32}$/);
    expect(a).not.toContain("203.0.113.9");
  });
});

describe("trialIpCap.isTrialGrantCapped", () => {
  const db = { collection: vi.fn() };

  it("rides the shared limiter with the locked cap and window, keyed by the hash", async () => {
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(false) };
    const result = await isTrialGrantCapped({
      db,
      rawRequest: { headers: { "x-forwarded-for": "203.0.113.9" } },
      limiter,
    });
    expect(result).toEqual({ capped: false, key: ipKey("203.0.113.9") });
    expect(limiter.isRateLimited).toHaveBeenCalledWith(
      db,
      ipKey("203.0.113.9"),
      TRIAL_IP_ACTION,
      TRIAL_IP_CAP,
      TRIAL_IP_WINDOW_MS
    );
    expect(TRIAL_IP_CAP).toBe(3);
    expect(TRIAL_IP_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("withholds the grant when the limiter says the window is full", async () => {
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(true) };
    const result = await isTrialGrantCapped({
      db,
      rawRequest: { headers: {}, ip: "192.0.2.4" },
      limiter,
    });
    expect(result.capped).toBe(true);
  });

  it("with no address, counts nothing and withholds nothing", async () => {
    const limiter = { isRateLimited: vi.fn().mockResolvedValue(true) };
    const result = await isTrialGrantCapped({
      db,
      rawRequest: { headers: {} },
      limiter,
    });
    expect(result).toEqual({ capped: false, key: null });
    expect(limiter.isRateLimited).not.toHaveBeenCalled();
  });
});
