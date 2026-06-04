/**
 * Firebase Analytics provider gating. The provider stays a strict no-op
 * unless web + configured + browser-supported — these tests pin each gate
 * so a regression can't silently start (or stop) delivering events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const isNativePlatform = vi.fn(() => false);
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => isNativePlatform(),
}));

const getAnalytics = vi.fn(() => ({ __handle: true }));
const isSupported = vi.fn(async () => true);
const logEvent = vi.fn();
vi.mock("firebase/analytics", () => ({ getAnalytics, isSupported, logEvent }));

const FAKE_APP = {} as Parameters<
  typeof import("../analyticsProvider").initAnalytics
>[0];

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  isNativePlatform.mockReturnValue(false);
  isSupported.mockReset();
  isSupported.mockResolvedValue(true);
  getAnalytics.mockReset();
  getAnalytics.mockReturnValue({ __handle: true });
  logEvent.mockReset();
});

describe("analyticsProvider", () => {
  it("logAnalyticsEvent is a no-op before init (never throws, no delivery)", async () => {
    const mod = await import("../analyticsProvider");
    expect(() => mod.logAnalyticsEvent("x", {})).not.toThrow();
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("stays a no-op on native (no firebase/analytics handle)", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await new Promise((r) => setTimeout(r));
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("stays a no-op when no measurementId is configured", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await new Promise((r) => setTimeout(r));
    expect(mod.isAnalyticsActive()).toBe(false);
  });

  it("stays a no-op when isSupported() is false", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    isSupported.mockResolvedValue(false);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(isSupported).toHaveBeenCalled());
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("activates on web + configured + supported, then delivers events", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));

    mod.logAnalyticsEvent("signup_completed", {
      method: "email",
      surface: "lifecycle",
    });
    expect(logEvent).toHaveBeenCalledWith(
      { __handle: true },
      "signup_completed",
      {
        method: "email",
        surface: "lifecycle",
      }
    );
  });

  it("init is idempotent (second call does not re-init)", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));
    mod.initAnalytics(FAKE_APP);
    await new Promise((r) => setTimeout(r));
    expect(getAnalytics).toHaveBeenCalledTimes(1);
  });
});
