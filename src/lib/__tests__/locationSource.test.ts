import { describe, it, expect, vi, beforeEach } from "vitest";
import { webLocationSource, getLocationSource } from "../locationSource";

/** Stub navigator.geolocation (jsdom doesn't provide it). */
function stubGeolocation() {
  const watchPosition = vi.fn().mockReturnValue(42);
  const clearWatch = vi.fn();
  const getCurrentPosition = vi.fn();
  Object.defineProperty(globalThis.navigator, "geolocation", {
    value: { watchPosition, clearWatch, getCurrentPosition },
    configurable: true,
  });
  return { watchPosition, clearWatch, getCurrentPosition };
}

describe("webLocationSource", () => {
  beforeEach(() => stubGeolocation());

  it("watch() delegates to watchPosition and clear() to clearWatch", () => {
    const g = stubGeolocation();
    const onFix = vi.fn();
    const onErr = vi.fn();
    const opts = { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 };

    const handle = webLocationSource.watch(opts, onFix, onErr);
    // watchPosition's native signature is (success, error, options).
    expect(g.watchPosition).toHaveBeenCalledWith(onFix, onErr, opts);

    handle.clear();
    expect(g.clearWatch).toHaveBeenCalledWith(42);
  });

  it("getCurrent() delegates to getCurrentPosition", () => {
    const g = stubGeolocation();
    const onFix = vi.fn();
    const onErr = vi.fn();
    const opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 };

    webLocationSource.getCurrent(opts, onFix, onErr);
    expect(g.getCurrentPosition).toHaveBeenCalledWith(onFix, onErr, opts);
  });

  it("getLocationSource() returns the web source on web (non-native)", () => {
    // jsdom is not a native Capacitor platform, so this is the web path.
    expect(getLocationSource()).toBe(webLocationSource);
  });
});
