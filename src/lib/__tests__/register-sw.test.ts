/**
 * registerServiceWorker — web/native split. The SW must register on WEB and be a
 * no-op on NATIVE (Capacitor): a service worker inside the native WKWebView
 * causes stale API responses + broken auth. This pins the real bug fixed here —
 * the old `!!window.Capacitor` check was truthy on web too, so the SW never
 * registered anywhere; the fix routes through `isNativePlatform()`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const isNativePlatform = vi.fn();
vi.mock("../platform", () => ({
  isNativePlatform: () => isNativePlatform(),
}));

import { registerServiceWorker } from "../register-sw";

const register = vi.fn().mockResolvedValue({
  scope: "/",
  update: vi.fn().mockResolvedValue(undefined),
  addEventListener: vi.fn(),
  installing: null,
});

beforeEach(() => {
  register.mockClear();
  // Provide a serviceWorker on navigator for the web path.
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register, controller: null, addEventListener: vi.fn() },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("registerServiceWorker", () => {
  it("is a no-op on native — never registers a service worker", () => {
    isNativePlatform.mockReturnValue(true);
    registerServiceWorker();
    // The 'load' listener is never attached, so even firing load does nothing.
    window.dispatchEvent(new Event("load"));
    expect(register).not.toHaveBeenCalled();
  });

  it("registers the SW on web once the window load event fires", () => {
    isNativePlatform.mockReturnValue(false);
    registerServiceWorker();
    // Registration is deferred to the load event (don't block first paint).
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(expect.stringContaining("sw.js"));
  });
});
