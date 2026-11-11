// @vitest-environment jsdom
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

const initializeAnalytics = vi.fn(
  (_app: unknown, _options?: { config?: Record<string, unknown> }) => ({
    __handle: true,
  })
);
const isSupported = vi.fn(async () => true);
const logEvent = vi.fn();
vi.mock("firebase/analytics", () => ({
  initializeAnalytics,
  isSupported,
  logEvent,
}));

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
  initializeAnalytics.mockReset();
  initializeAnalytics.mockReturnValue({ __handle: true });
  window.history.replaceState(null, "", import.meta.env.BASE_URL);
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
    expect(initializeAnalytics).not.toHaveBeenCalled();
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
      expect.objectContaining({
        method: "email",
        surface: "lifecycle",
      })
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
    expect(initializeAnalytics).not.toHaveBeenCalled();
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
    expect(initializeAnalytics).toHaveBeenCalledTimes(1);
  });
});

describe("analyticsProvider — the page address on web", () => {
  const base = import.meta.env.BASE_URL;
  const origin = window.location.origin;

  it("sends no automatic page view, and starts with a redacted address", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    window.history.replaceState(null, "", `${base}user/their-uid-123`);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));

    expect(initializeAnalytics).toHaveBeenCalledTimes(1);
    const config = initializeAnalytics.mock.calls[0][1]?.config;
    expect(config?.send_page_view).toBe(false);
    expect(config?.page_location).toBe(`${origin}${base}user/:id`);
  });

  it("gives each event the route it was sent from, without ids or a search", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));

    window.history.pushState(null, "", `${base}history/sessions?q=tempo#top`);
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    window.history.pushState(null, "", `${base}user/their-uid-123`);
    mod.logAnalyticsEvent("profile_viewed", { surface: "social" });

    const sent = logEvent.mock.calls.map(
      (call) => (call as unknown[])[2] as Record<string, unknown>
    );
    expect(sent[0].page_location).toBe(`${origin}${base}history/sessions`);
    expect(sent[1].page_location).toBe(`${origin}${base}user/:id`);
    for (const params of sent) {
      expect(JSON.stringify(params)).not.toMatch(/their-uid-123|tempo/);
    }
  });
});
