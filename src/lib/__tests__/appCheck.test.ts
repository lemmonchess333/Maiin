// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * Unit tests for App Check initialisation.
 *
 * PR F (audit P0 #6): pre-PR-F the native branch was a hardcoded
 * stub that always returned false. The current `initAppCheck`
 * routes through `setNativeAppCheckProvider` on native and through
 * `ReCaptchaV3Provider` on web. Listed in LAUNCH_TODO.md item 23
 * for test coverage.
 *
 * Invariants pinned here:
 *  - Provider routing follows isNativePlatform().
 *  - Native + no factory registered → returns false, NO call into
 *    initializeAppCheck (fail-open on native rather than bricking
 *    TestFlight builds before the plugin is wired).
 *  - Native + factory → installs the CustomProvider the factory
 *    returns, with isTokenAutoRefreshEnabled: true.
 *  - Web + no VITE_RECAPTCHA_V3_SITE_KEY → returns false, NO call
 *    into initializeAppCheck.
 *  - Web + site key → ReCaptchaV3Provider is constructed with the
 *    env key and passed in.
 *  - Debug-token env populates `self.FIREBASE_APPCHECK_DEBUG_TOKEN`
 *    so the Firebase SDK's debug-provider global is honoured.
 *  - Idempotency — a second initAppCheck call short-circuits to
 *    true without re-initialising (the SDK throws on repeat).
 *  - initializeAppCheck throw is caught (e.g. HMR re-run, double
 *    init) — returns false, no propagation.
 *  - getAppCheckToken / isAppCheckActive reflect state correctly.
 *
 * Test infrastructure note: module-level state (`appCheckHandle`,
 * `nativeProviderFactory`) is captured by `vi.resetModules()` +
 * dynamic re-import per test, so each case starts from a clean
 * "App Check has never been initialised" baseline.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";

// Mock the Firebase App Check SDK so we can assert provider
// construction without hitting Google's reCAPTCHA endpoint.
const initializeAppCheckMock = vi.fn();
const getTokenMock = vi.fn();
const reCaptchaV3ProviderMock = vi.fn();
const customProviderMock = vi.fn();

vi.mock("firebase/app-check", () => {
  class FakeReCaptchaV3Provider {
    __kind = "recaptcha-v3";
    __siteKey: string;
    constructor(siteKey: string) {
      reCaptchaV3ProviderMock(siteKey);
      this.__siteKey = siteKey;
    }
  }
  class FakeCustomProvider {
    __kind = "custom";
    constructor() {
      customProviderMock();
    }
  }
  return {
    initializeAppCheck: (...args: unknown[]) => initializeAppCheckMock(...args),
    ReCaptchaV3Provider: FakeReCaptchaV3Provider,
    CustomProvider: FakeCustomProvider,
    getToken: (...args: unknown[]) => getTokenMock(...args),
  };
});

const isNativePlatformMock = vi.fn();
vi.mock("../platform", () => ({
  isNativePlatform: () => isNativePlatformMock(),
}));

// Silence logger output during tests; we don't assert log content,
// only behaviour.
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Stub FirebaseApp — we never pass it through to a real SDK, the
 *  mock just receives it as opaque. */
const fakeApp = { name: "[DEFAULT]" } as never;

/** Stub the import.meta.env values the module reads. vitest's
 *  default is whatever Vite's test config exposes; we override per
 *  test by writing into the module's vite-injected env object. */
function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete (import.meta.env as Record<string, unknown>)[key];
    } else {
      (import.meta.env as Record<string, unknown>)[key] = value;
    }
  }
}

beforeEach(() => {
  vi.resetModules();
  initializeAppCheckMock.mockReset();
  getTokenMock.mockReset();
  reCaptchaV3ProviderMock.mockReset();
  customProviderMock.mockReset();
  isNativePlatformMock.mockReset();
  // Clear the debug-token globals that one test sets.
  delete (self as unknown as Record<string, unknown>)
    .FIREBASE_APPCHECK_DEBUG_TOKEN;
  // Default env: site key absent so web tests can opt-in explicitly.
  setEnv({
    VITE_RECAPTCHA_V3_SITE_KEY: undefined,
    VITE_APP_CHECK_DEBUG_TOKEN: undefined,
  });
});

describe("initAppCheck — native routing", () => {
  beforeEach(() => {
    isNativePlatformMock.mockReturnValue(true);
  });

  it("returns false and does NOT call initializeAppCheck when no native provider is registered", async () => {
    // Pre-PR-F was a hardcoded stub; post-PR-F is "no factory →
    // fail-open silently" so TestFlight builds don't brick before
    // the @capacitor-firebase/app-check plugin is wired.
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");
    expect(initAppCheck(fakeApp)).toBe(false);
    expect(initializeAppCheckMock).not.toHaveBeenCalled();
    expect(isAppCheckActive()).toBe(false);
  });

  it("installs the factory-returned CustomProvider with auto-refresh enabled", async () => {
    initializeAppCheckMock.mockReturnValue({ __mock: "appCheckHandle" });
    const { initAppCheck, setNativeAppCheckProvider, isAppCheckActive } =
      await import("../appCheck");

    const customProvider = { __kind: "custom-from-factory" };
    const factory = vi.fn(() => customProvider) as Mock;
    setNativeAppCheckProvider(factory as never);

    const result = initAppCheck(fakeApp);

    expect(result).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
    expect(initializeAppCheckMock).toHaveBeenCalledWith(fakeApp, {
      provider: customProvider,
      isTokenAutoRefreshEnabled: true,
    });
    expect(isAppCheckActive()).toBe(true);
  });

  it("does NOT construct a ReCaptchaV3Provider on the native path", async () => {
    initializeAppCheckMock.mockReturnValue({});
    const { initAppCheck, setNativeAppCheckProvider } =
      await import("../appCheck");
    setNativeAppCheckProvider(() => ({ __kind: "custom" }) as never);
    initAppCheck(fakeApp);
    expect(reCaptchaV3ProviderMock).not.toHaveBeenCalled();
  });

  it("returns false and stays inactive when initializeAppCheck throws on native", async () => {
    // Plugin token-fetch failures during init shouldn't crash app
    // boot. The catch logs and returns false; getToken stays null.
    initializeAppCheckMock.mockImplementation(() => {
      throw new Error("native init failed");
    });
    const { initAppCheck, setNativeAppCheckProvider, isAppCheckActive } =
      await import("../appCheck");
    setNativeAppCheckProvider(() => ({ __kind: "custom" }) as never);

    expect(initAppCheck(fakeApp)).toBe(false);
    expect(isAppCheckActive()).toBe(false);
  });
});

describe("initAppCheck — web routing", () => {
  beforeEach(() => {
    isNativePlatformMock.mockReturnValue(false);
  });

  it("returns false and skips init when VITE_RECAPTCHA_V3_SITE_KEY is unset", async () => {
    // The "running without enforcement" path — production builds
    // log a warning, but we don't crash the app. Pin that no
    // provider is constructed at all (so no third-party request
    // fires on a misconfigured deploy).
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");
    expect(initAppCheck(fakeApp)).toBe(false);
    expect(initializeAppCheckMock).not.toHaveBeenCalled();
    expect(reCaptchaV3ProviderMock).not.toHaveBeenCalled();
    expect(isAppCheckActive()).toBe(false);
  });

  it("constructs ReCaptchaV3Provider with the env key and calls initializeAppCheck", async () => {
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockReturnValue({ __mock: "appCheckHandle" });
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");

    const result = initAppCheck(fakeApp);

    expect(result).toBe(true);
    expect(reCaptchaV3ProviderMock).toHaveBeenCalledWith("site-key-abc123");
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
    const [appArg, options] = initializeAppCheckMock.mock.calls[0];
    expect(appArg).toBe(fakeApp);
    expect(options).toMatchObject({ isTokenAutoRefreshEnabled: true });
    expect((options.provider as { __kind?: string }).__kind).toBe(
      "recaptcha-v3"
    );
    expect(isAppCheckActive()).toBe(true);
  });

  it("sets FIREBASE_APPCHECK_DEBUG_TOKEN on self when VITE_APP_CHECK_DEBUG_TOKEN is configured", async () => {
    setEnv({
      VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123",
      VITE_APP_CHECK_DEBUG_TOKEN: "debug-token-zzz",
    });
    initializeAppCheckMock.mockReturnValue({});
    const { initAppCheck } = await import("../appCheck");

    initAppCheck(fakeApp);

    expect(
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
        .FIREBASE_APPCHECK_DEBUG_TOKEN
    ).toBe("debug-token-zzz");
  });

  it("does NOT set the debug-token global when the env var is unset", async () => {
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockReturnValue({});
    const { initAppCheck } = await import("../appCheck");

    initAppCheck(fakeApp);

    expect(
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
        .FIREBASE_APPCHECK_DEBUG_TOKEN
    ).toBeUndefined();
  });

  it("returns false when initializeAppCheck throws on the web path (HMR re-run, double init)", async () => {
    // The repeat-call case the original code calls out: the
    // Firebase SDK throws when initializeAppCheck is invoked twice
    // for the same app. The wrapper catches and returns false.
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockImplementation(() => {
      throw new Error("already initialised");
    });
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");

    expect(initAppCheck(fakeApp)).toBe(false);
    expect(isAppCheckActive()).toBe(false);
  });
});

describe("initAppCheck — idempotency", () => {
  it("short-circuits to true on a second call without re-initialising", async () => {
    // The SDK throws if initializeAppCheck runs twice. The module
    // caches the handle and returns true without calling the SDK
    // again on subsequent invocations.
    isNativePlatformMock.mockReturnValue(false);
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockReturnValue({ __mock: "handle" });
    const { initAppCheck } = await import("../appCheck");

    expect(initAppCheck(fakeApp)).toBe(true);
    expect(initAppCheck(fakeApp)).toBe(true);
    // Critical: the SDK is called exactly ONCE.
    expect(initializeAppCheckMock).toHaveBeenCalledTimes(1);
  });
});

describe("getAppCheckToken", () => {
  it("returns null when App Check is not initialised", async () => {
    isNativePlatformMock.mockReturnValue(false);
    // No init call — handle stays null.
    const { getAppCheckToken } = await import("../appCheck");
    expect(await getAppCheckToken()).toBeNull();
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  it("returns the SDK token after init", async () => {
    isNativePlatformMock.mockReturnValue(false);
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    const fakeHandle = { __mock: "handle" };
    initializeAppCheckMock.mockReturnValue(fakeHandle);
    const tokenResult = { token: "tok-abc", expireTimeMillis: 12345 };
    getTokenMock.mockResolvedValueOnce(tokenResult);
    const { initAppCheck, getAppCheckToken } = await import("../appCheck");
    initAppCheck(fakeApp);

    const result = await getAppCheckToken();
    expect(result).toBe(tokenResult);
    expect(getTokenMock).toHaveBeenCalledWith(fakeHandle, false);
  });

  it("never throws — returns null on SDK getToken failure", async () => {
    // Diagnostics shouldn't crash the app even if the provider is
    // misconfigured. Pin the catch.
    isNativePlatformMock.mockReturnValue(false);
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockReturnValue({ __mock: "handle" });
    getTokenMock.mockRejectedValueOnce(new Error("network"));
    const { initAppCheck, getAppCheckToken } = await import("../appCheck");
    initAppCheck(fakeApp);

    await expect(getAppCheckToken()).resolves.toBeNull();
  });
});

describe("isAppCheckActive", () => {
  it("is false before initAppCheck", async () => {
    const { isAppCheckActive } = await import("../appCheck");
    expect(isAppCheckActive()).toBe(false);
  });

  it("flips to true after successful initialisation", async () => {
    isNativePlatformMock.mockReturnValue(false);
    setEnv({ VITE_RECAPTCHA_V3_SITE_KEY: "site-key-abc123" });
    initializeAppCheckMock.mockReturnValue({ __mock: "handle" });
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");

    expect(isAppCheckActive()).toBe(false);
    initAppCheck(fakeApp);
    expect(isAppCheckActive()).toBe(true);
  });

  it("stays false when initialisation skips (no site key)", async () => {
    isNativePlatformMock.mockReturnValue(false);
    const { initAppCheck, isAppCheckActive } = await import("../appCheck");
    initAppCheck(fakeApp);
    expect(isAppCheckActive()).toBe(false);
  });
});
