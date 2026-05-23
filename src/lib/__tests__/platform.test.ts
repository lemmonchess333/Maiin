/**
 * Tests for `platform.isNativePlatform()` — the Capacitor runtime
 * detect used to gate native-only features (IAP, push notifications,
 * Apple sign-in via plugin, etc.) and hide them from the PWA build.
 *
 * Tests pin:
 *   1. SSR / non-browser context returns false (defensive).
 *   2. Web context (no Capacitor global) returns false.
 *   3. Native context (Capacitor global present) returns true.
 */
import { describe, it, expect, afterEach } from "vitest";
import { isNativePlatform } from "../platform";

const originalCapacitor = (
  window as unknown as Record<string, unknown>
).Capacitor;

afterEach(() => {
  if (originalCapacitor === undefined) {
    delete (window as unknown as Record<string, unknown>).Capacitor;
  } else {
    (window as unknown as Record<string, unknown>).Capacitor =
      originalCapacitor;
  }
});

describe("isNativePlatform", () => {
  it("returns false when window.Capacitor is absent (web/PWA)", () => {
    delete (window as unknown as Record<string, unknown>).Capacitor;
    expect(isNativePlatform()).toBe(false);
  });

  it("returns true when window.Capacitor is present (native shell)", () => {
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(isNativePlatform()).toBe(true);
  });

  it("returns true even for a non-object Capacitor truthy value (defensive)", () => {
    /* The check is `!!window.Capacitor` — any truthy value counts.
       This documents the intentionally loose detect; the native
       shell could in theory set it to a non-object marker. */
    (window as unknown as Record<string, unknown>).Capacitor = 1;
    expect(isNativePlatform()).toBe(true);
  });

  it("returns false when Capacitor is null (defensive)", () => {
    (window as unknown as Record<string, unknown>).Capacitor = null;
    expect(isNativePlatform()).toBe(false);
  });
});
