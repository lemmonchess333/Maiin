/**
 * The run setup screen warms the GPS (useGpsWarmup): a one-shot fix at
 * once and every 15 seconds while the screen is open and the app is in
 * front, never before location is allowed, and nothing once the screen
 * goes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  isNativePlatform: () => h.native,
}));

import { GPS_WARM_INTERVAL_MS, useGpsWarmup } from "../useGpsWarmup";

let visibility: DocumentVisibilityState = "visible";
function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  h.native = false;
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});
afterEach(() => restoreRealTimers());

function warm(
  props: Partial<Parameters<typeof useGpsWarmup>[0]> = {},
  preWarm = vi.fn()
) {
  const hook = renderHook(
    (p: Parameters<typeof useGpsWarmup>[0]) => useGpsWarmup(p),
    {
      initialProps: {
        active: true,
        permissionState: "granted" as PermissionState,
        preWarm,
        ...props,
      },
    }
  );
  return { ...hook, preWarm };
}

describe("useGpsWarmup", () => {
  it("asks for a fix at once and again every 15 seconds", () => {
    const { preWarm, result } = warm();
    expect(result.current).toBe(true);
    expect(preWarm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(GPS_WARM_INTERVAL_MS * 2));
    expect(preWarm).toHaveBeenCalledTimes(3);
  });

  it.each([["prompt"], [null], [undefined], ["denied"]] as const)(
    "never asks on the web while location is %s",
    (permissionState) => {
      const { preWarm, result } = warm({
        permissionState: permissionState as PermissionState | null,
      });
      act(() => vi.advanceTimersByTime(GPS_WARM_INTERVAL_MS * 2));
      expect(preWarm).not.toHaveBeenCalled();
      expect(result.current).toBe(false);
    }
  );

  it("warms in the app before the web's permission is known, since its one-shot never asks", () => {
    h.native = true;
    const { preWarm, result } = warm({ permissionState: null });
    expect(preWarm).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it("stops in the app once location is refused", () => {
    h.native = true;
    const { preWarm, result } = warm({ permissionState: "denied" });
    expect(preWarm).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("stops when the setup screen goes", () => {
    const { preWarm, rerender } = warm();
    rerender({ active: false, permissionState: "granted", preWarm });
    act(() => vi.advanceTimersByTime(GPS_WARM_INTERVAL_MS * 3));
    expect(preWarm).toHaveBeenCalledTimes(1);
  });

  it("rests while the app is in the background, and warms again on return", () => {
    const { preWarm } = warm();
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(GPS_WARM_INTERVAL_MS * 3));
    expect(preWarm).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    expect(preWarm).toHaveBeenCalledTimes(2);
  });
});
