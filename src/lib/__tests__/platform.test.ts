/**
 * Tests for `platform.isNativePlatform()` — the Capacitor runtime
 * detect used to gate native-only features (IAP, push notifications,
 * Apple sign-in via plugin, etc.) and hide them from the PWA build.
 *
 * The detect now delegates to `Capacitor.isNativePlatform()` rather
 * than `!!window.Capacitor`. The old truthiness check was wrong:
 * `@capacitor/core` injects the `window.Capacitor` global on the WEB
 * too, so it reported native === true in the browser and routed web
 * users down native code paths (dead haptics, skipped service-worker
 * registration, App Check never initialising on web).
 *
 * Tests pin:
 *   1. Web context (Capacitor.isNativePlatform() === false) returns false.
 *   2. Native context (Capacitor.isNativePlatform() === true) returns true.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const isNativeMock = vi.fn();
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativeMock() },
}));

import { isNativePlatform } from "../platform";

beforeEach(() => {
  isNativeMock.mockReset();
});

describe("isNativePlatform", () => {
  it("returns false on the web (Capacitor reports non-native)", () => {
    isNativeMock.mockReturnValue(false);
    expect(isNativePlatform()).toBe(false);
  });

  it("returns true inside a native shell (Capacitor reports native)", () => {
    isNativeMock.mockReturnValue(true);
    expect(isNativePlatform()).toBe(true);
  });
});
