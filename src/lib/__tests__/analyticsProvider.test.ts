/**
 * Firebase Analytics provider gating. The provider stays a strict no-op
 * unless a platform path actually wires up:
 *   - web: configured (measurementId) + browser-supported (isSupported)
 *   - native: the @capacitor-firebase/analytics plugin loads + enables
 * These tests pin each gate so a regression can't silently start (or stop)
 * delivering events on either platform.
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

const nativeSetEnabled = vi.fn(async (_opts: { enabled: boolean }) => {});
const nativeLogEvent = vi.fn(
  async (_opts: { name: string; params?: Record<string, unknown> }) => {}
);
vi.mock("@capacitor-firebase/analytics", () => ({
  FirebaseAnalytics: {
    setEnabled: (opts: { enabled: boolean }) => nativeSetEnabled(opts),
    logEvent: (opts: { name: string; params?: Record<string, unknown> }) =>
      nativeLogEvent(opts),
  },
}));

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
  nativeSetEnabled.mockReset();
  nativeSetEnabled.mockResolvedValue(undefined);
  nativeLogEvent.mockReset();
  nativeLogEvent.mockResolvedValue(undefined);
});

describe("analyticsProvider", () => {
  it("logAnalyticsEvent is a no-op before init (never throws, no delivery)", async () => {
    const mod = await import("../analyticsProvider");
    expect(() => mod.logAnalyticsEvent("x", {})).not.toThrow();
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("uninitialised");
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("stays a no-op when no measurementId is configured (web)", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await new Promise((r) => setTimeout(r));
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("unconfigured");
  });

  it("stays a no-op when isSupported() is false (web)", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    isSupported.mockResolvedValue(false);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() =>
      expect(mod.getAnalyticsStatus()).toBe("unsupported")
    );
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("activates on web + configured + supported, then delivers events", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));
    expect(mod.getAnalyticsStatus()).toBe("active");

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
    // The native plugin is never touched on web.
    expect(nativeLogEvent).not.toHaveBeenCalled();
  });

  it("activates on native via the Capacitor plugin, then delivers events", async () => {
    isNativePlatform.mockReturnValue(true);
    // No measurementId needed on native — the plist drives it.
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));
    expect(mod.getAnalyticsStatus()).toBe("active");
    expect(nativeSetEnabled).toHaveBeenCalledWith({ enabled: true });

    mod.logAnalyticsEvent("onboarding_completed", {
      primaryGoal: "running",
      surface: "lifecycle",
    });
    expect(nativeLogEvent).toHaveBeenCalledWith({
      name: "onboarding_completed",
      params: { primaryGoal: "running", surface: "lifecycle" },
    });
    // The web SDK is never touched on native.
    expect(getAnalytics).not.toHaveBeenCalled();
  });

  it("native init failure (e.g. missing plist) → error status, stays a no-op", async () => {
    isNativePlatform.mockReturnValue(true);
    nativeSetEnabled.mockRejectedValue(new Error("no plist"));
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.getAnalyticsStatus()).toBe("error"));
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(() => mod.logAnalyticsEvent("x", {})).not.toThrow();
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
