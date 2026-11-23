// @vitest-environment jsdom
/**
 * Firebase Analytics provider gating. The provider stays a strict no-op
 * unless a platform path actually wires up:
 *   - web: configured (measurementId) + browser-supported (isSupported)
 *   - native: the @capacitor-firebase/analytics plugin loads + enables
 * These tests pin each gate so a regression can't silently start (or stop)
 * delivering events on either platform. The last block is the person's own
 * gate, Share usage analytics (Priv1 call 2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { capacitorPlugin } from "@/test/capacitorPlugin";
import { readString, remove, writeString } from "@/lib/localStore";
import { USAGE_ANALYTICS_OFF_KEY } from "@/lib/usageAnalytics";

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
const setAnalyticsCollectionEnabled = vi.fn();
vi.mock("firebase/analytics", () => ({
  initializeAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
}));

const nativeSetEnabled = vi.fn(async (_opts: { enabled: boolean }) => {});
const nativeLogEvent = vi.fn(
  async (_opts: { name: string; params?: Record<string, unknown> }) => {}
);
/* The plugin as the bridge makes it, answering `then` with a native call:
   a loader that resolved a promise with it would hang these tests. */
vi.mock("@capacitor-firebase/analytics", () => ({
  FirebaseAnalytics: capacitorPlugin({
    setEnabled: (opts: { enabled: boolean }) => nativeSetEnabled(opts),
    logEvent: (opts: { name: string; params?: Record<string, unknown> }) =>
      nativeLogEvent(opts),
  }),
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
  setAnalyticsCollectionEnabled.mockReset();
  remove(USAGE_ANALYTICS_OFF_KEY);
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

    mod.logAnalyticsEvent("account_created", {
      method: "email",
      surface: "lifecycle",
    });
    expect(logEvent).toHaveBeenCalledWith(
      { __handle: true },
      "account_created",
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

  it("settles once init has an answer: true only when delivering", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const active = await import("../analyticsProvider");
    active.initAnalytics(FAKE_APP);
    await expect(active.analyticsSettled()).resolves.toBe(true);
    expect(active.isAnalyticsActive()).toBe(true);

    for (const arrange of [
      () => vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", ""),
      () => isSupported.mockResolvedValue(false),
      () => {
        isNativePlatform.mockReturnValue(true);
        nativeSetEnabled.mockRejectedValue(new Error("no plist"));
      },
    ]) {
      vi.resetModules();
      arrange();
      const mod = await import("../analyticsProvider");
      mod.initAnalytics(FAKE_APP);
      await expect(mod.analyticsSettled()).resolves.toBe(false);
      expect(mod.isAnalyticsActive()).toBe(false);
    }
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

  it("names the app as the page's title, not the tab's (a rest counts down there)", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(mod.isAnalyticsActive()).toBe(true));

    const before = document.title;
    document.title = "1:23 rest";
    mod.logAnalyticsEvent("guide_hint_viewed", { surface: "lifecycle" });
    document.title = before;

    const config = initializeAnalytics.mock.calls[0][1]?.config;
    expect(config?.page_title).toBe("Tropos");
    const params = (logEvent.mock.calls[0] as unknown[])[2] as Record<
      string,
      unknown
    >;
    expect(params.page_title).toBe("Tropos");
  });
});

/* Share usage analytics (Priv1 call 2): the person's simple, free way to
   object that PECR's analytics exemption asks for. Off on a device means
   nothing goes from it: no event, and on the web no analytics loaded at
   all, from the launch on. */
describe("analyticsProvider: Share usage analytics (Priv1)", () => {
  /** This device was told off before: the answer the app keeps for launch. */
  function deviceSaidOff() {
    writeString(USAGE_ANALYTICS_OFF_KEY, "1");
  }

  it("a device that turned it off sends nothing and loads no web analytics at launch", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    deviceSaidOff();
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");

    mod.logAnalyticsEvent("auth_screen_viewed", { surface: "lifecycle" });
    expect(isSupported).not.toHaveBeenCalled();
    expect(initializeAnalytics).not.toHaveBeenCalled();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("on iPhone, a device that turned it off keeps the native SDK off from launch", async () => {
    isNativePlatform.mockReturnValue(true);
    deviceSaidOff();
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
    expect(nativeSetEnabled.mock.calls).toEqual([[{ enabled: false }]]);

    mod.logAnalyticsEvent("auth_screen_viewed", { surface: "lifecycle" });
    expect(nativeLogEvent).not.toHaveBeenCalled();
  });

  it("on the web, off stops collection and every event, and on starts both again", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(true);

    mod.setUsageAnalytics(false);
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
    expect(setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(
      { __handle: true },
      false
    );
    expect(logEvent).not.toHaveBeenCalled();
    expect(readString(USAGE_ANALYTICS_OFF_KEY)).toBe("1");

    mod.setUsageAnalytics(true);
    await expect(mod.analyticsSettled()).resolves.toBe(true);
    expect(mod.getAnalyticsStatus()).toBe("active");
    expect(setAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(
      { __handle: true },
      true
    );
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(readString(USAGE_ANALYTICS_OFF_KEY)).toBeNull();
  });

  it("on the web, turned on after a launch with it off, starts analytics then", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    deviceSaidOff();
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(initializeAnalytics).not.toHaveBeenCalled();

    mod.setUsageAnalytics(true);
    await expect(mod.analyticsSettled()).resolves.toBe(true);
    expect(initializeAnalytics).toHaveBeenCalledTimes(1);
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it("on iPhone, off and on again switch the native SDK in the order tapped", async () => {
    isNativePlatform.mockReturnValue(true);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(true);

    mod.setUsageAnalytics(false);
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    mod.setUsageAnalytics(true);
    await expect(mod.analyticsSettled()).resolves.toBe(true);
    expect(nativeSetEnabled.mock.calls).toEqual([
      [{ enabled: true }],
      [{ enabled: false }],
      [{ enabled: true }],
    ]);
    expect(nativeLogEvent).not.toHaveBeenCalled();

    mod.logAnalyticsEvent("profile_viewed", { surface: "social" });
    expect(nativeLogEvent).toHaveBeenCalledWith({
      name: "profile_viewed",
      params: { surface: "social" },
    });
  });

  it("off stops the next event at once, before the plugin has answered", async () => {
    isNativePlatform.mockReturnValue(true);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(true);

    let answer = () => {};
    nativeSetEnabled.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        })
    );
    mod.setUsageAnalytics(false);
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    expect(mod.isAnalyticsActive()).toBe(false);
    expect(nativeLogEvent).not.toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(nativeSetEnabled).toHaveBeenLastCalledWith({ enabled: false })
    );
    answer();
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
  });

  it("an on overtaken by an off lets nothing through while the off is applied", async () => {
    isNativePlatform.mockReturnValue(true);
    deviceSaidOff();
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(false);

    let answerOff = () => {};
    nativeSetEnabled.mockImplementation(async ({ enabled }) => {
      if (!enabled)
        await new Promise<void>((resolve) => {
          answerOff = resolve;
        });
    });
    mod.setUsageAnalytics(true);
    mod.setUsageAnalytics(false);
    await vi.waitFor(() => expect(nativeSetEnabled).toHaveBeenCalledTimes(3));
    expect(nativeSetEnabled).toHaveBeenLastCalledWith({ enabled: false });

    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    expect(nativeLogEvent).not.toHaveBeenCalled();
    answerOff();
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
  });

  it("on the web, an on overtaken by an off never starts gtag collecting again", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(true);

    mod.setUsageAnalytics(false);
    mod.setUsageAnalytics(true);
    mod.setUsageAnalytics(false);
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
    expect(setAnalyticsCollectionEnabled).toHaveBeenCalled();
    expect(setAnalyticsCollectionEnabled).not.toHaveBeenCalledWith(
      expect.anything(),
      true
    );
  });

  it("on the web, turned off while the SDK is loading, starts nothing", async () => {
    vi.stubEnv("VITE_FIREBASE_MEASUREMENT_ID", "G-TEST");
    let answerSupported: (supported: boolean) => void = () => {};
    isSupported.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          answerSupported = resolve;
        })
    );
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await vi.waitFor(() => expect(isSupported).toHaveBeenCalledTimes(1));

    mod.setUsageAnalytics(false);
    answerSupported(true);
    await expect(mod.analyticsSettled()).resolves.toBe(false);
    expect(mod.getAnalyticsStatus()).toBe("off");
    expect(initializeAnalytics).not.toHaveBeenCalled();
    mod.logAnalyticsEvent("history_viewed", { surface: "history" });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it("the same answer twice changes nothing on the device's SDK", async () => {
    isNativePlatform.mockReturnValue(true);
    const mod = await import("../analyticsProvider");
    mod.initAnalytics(FAKE_APP);
    await expect(mod.analyticsSettled()).resolves.toBe(true);

    mod.setUsageAnalytics(true);
    await expect(mod.analyticsSettled()).resolves.toBe(true);
    expect(nativeSetEnabled).toHaveBeenCalledTimes(1);
  });
});
