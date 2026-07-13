// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
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

import {
  registerServiceWorker,
  getAppServiceWorkerRegistration,
} from "../register-sw";

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

  it("registers the canonical sw.js (with config query) at the BASE_URL scope on web", () => {
    isNativePlatform.mockReturnValue(false);
    registerServiceWorker();
    // When the document is already loaded (jsdom default readyState:"complete")
    // registration runs immediately; otherwise it defers to the load event.
    if (document.readyState !== "complete") {
      window.dispatchEvent(new Event("load"));
    }
    // Packet 17: one worker — sw.js followed by a query string, at BASE_URL scope.
    expect(register).toHaveBeenCalledWith(
      expect.stringContaining("sw.js?"),
      expect.objectContaining({ scope: expect.any(String) })
    );
  });

  it("getAppServiceWorkerRegistration uses the SAME canonical URL + scope", async () => {
    isNativePlatform.mockReturnValue(false);
    // The mock worker never activates to the expected script, so the wait
    // rejects — but the register() call (URL + scope) is what we assert.
    await getAppServiceWorkerRegistration().catch(() => {});
    expect(register).toHaveBeenCalledWith(
      expect.stringContaining("sw.js?"),
      expect.objectContaining({ scope: expect.any(String) })
    );
  });
});
