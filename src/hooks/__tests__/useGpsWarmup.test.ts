/**
 * The run screen watches location before Start (useGpsWarmup), so the fix
 * that starts a GPS run's clock is usually in hand when Start is tapped
 * (Run25 call 2): a watch while the screen is open and the app is in
 * front, never before location is allowed, and none once the screen goes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";

const h = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/platform")>()),
  isNativePlatform: () => h.native,
}));

import { useGpsWarmup } from "../useGpsWarmup";

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

function warmup(props: Partial<Parameters<typeof useGpsWarmup>[0]> = {}) {
  const warm = vi.fn();
  const cool = vi.fn();
  const hook = renderHook(
    (p: Parameters<typeof useGpsWarmup>[0]) => useGpsWarmup(p),
    {
      initialProps: {
        active: true,
        permissionState: "granted" as PermissionState,
        warm,
        cool,
        ...props,
      },
    }
  );
  return { ...hook, warm, cool };
}

describe("useGpsWarmup", () => {
  it("watches while the screen is open, and only once", () => {
    const { warm, cool, result } = warmup();
    expect(result.current).toBe(true);
    expect(warm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(warm).toHaveBeenCalledTimes(1);
    expect(cool).not.toHaveBeenCalled();
  });

  it.each([["prompt"], [null], [undefined], ["denied"]] as const)(
    "never watches on the web while location is %s",
    (permissionState) => {
      const { warm, result } = warmup({
        permissionState: permissionState as PermissionState | null,
      });
      act(() => vi.advanceTimersByTime(60_000));
      expect(warm).not.toHaveBeenCalled();
      expect(result.current).toBe(false);
    }
  );

  it("watches in the app before the web's permission is known, since its watch never asks", () => {
    h.native = true;
    const { warm, result } = warmup({ permissionState: null });
    expect(warm).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it("stops in the app once location is refused", () => {
    h.native = true;
    const { warm, cool, rerender } = warmup({ permissionState: null });
    rerender({
      active: true,
      permissionState: "denied",
      warm,
      cool,
    });
    expect(cool).toHaveBeenCalledTimes(1);
  });

  it("stops when the screen goes", () => {
    const { warm, cool, rerender } = warmup();
    rerender({ active: false, permissionState: "granted", warm, cool });
    expect(cool).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("rests while the app is in the background, and watches again on return", () => {
    const { warm, cool } = warmup();
    act(() => setVisibility("hidden"));
    expect(cool).toHaveBeenCalledTimes(1);
    act(() => setVisibility("visible"));
    expect(warm).toHaveBeenCalledTimes(2);
  });
});
