// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
import { describe, it, expect, vi, afterEach } from "vitest";

/* The web unless a test says it is the native app. */
const platform = vi.hoisted(() => ({ native: false }));
vi.mock("@/lib/platform", () => ({
  isNativePlatform: () => platform.native,
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: toasts }));

import {
  announceRouteShare,
  shareGpx,
  shareRoute,
  routeSlug,
  resolveShareRoute,
} from "../shareRoute";
import type { GPSPoint } from "../gps";
import type { PrivacyZone } from "../privacyZones";

function pt(lat: number, lon: number): GPSPoint {
  return {
    lat,
    lon,
    altitude: null,
    accuracy: 0,
    speed: null,
    timestamp: 0,
    rawLat: lat,
    rawLon: lon,
  };
}

const ROUTE = [pt(51.5, -0.1), pt(51.501, -0.1)];

describe("routeSlug", () => {
  it("slugifies names and falls back to 'route'", () => {
    expect(routeSlug("Morning Loop")).toBe("morning-loop");
    expect(routeSlug("  Park 5K!! ")).toBe("park-5k");
    expect(routeSlug("")).toBe("route");
    expect(routeSlug("///")).toBe("route");
  });
});

describe("resolveShareRoute (privacy trim)", () => {
  // A 12-point line heading north from ~(51.500..51.511, -0.1).
  const line: GPSPoint[] = Array.from({ length: 12 }, (_, i) =>
    pt(51.5 + i * 0.001, -0.1)
  );

  it("returns the route unchanged when there are no zones", () => {
    expect(resolveShareRoute(line, [])).toBe(line);
  });

  it("trims start/end points inside a zone (fewer points, still ≥2)", () => {
    // Zone over the start point only.
    const zones: PrivacyZone[] = [
      { id: "z", name: "Home", lat: 51.5, lon: -0.1, radiusMeters: 150 },
    ];
    const out = resolveShareRoute(line, zones);
    expect(out).not.toBeNull();
    expect(out!.length).toBeGreaterThanOrEqual(2);
    expect(out!.length).toBeLessThan(line.length);
  });

  it("returns null when the whole route is inside a zone", () => {
    const zones: PrivacyZone[] = [
      { id: "z", name: "Home", lat: 51.505, lon: -0.1, radiusMeters: 100000 },
    ];
    expect(resolveShareRoute(line, zones)).toBeNull();
  });
});

describe("shareRoute", () => {
  const origNav = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    platform.native = false;
    Object.defineProperty(globalThis, "navigator", {
      value: origNav,
      configurable: true,
    });
  });

  function setNavigator(nav: Partial<Navigator>) {
    Object.defineProperty(globalThis, "navigator", {
      value: nav,
      configurable: true,
    });
  }

  it("returns 'failed' for a degenerate route", async () => {
    expect(await shareRoute("x", [pt(51.5, -0.1)])).toBe("failed");
  });

  it("shares via the Web Share API when files are supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ canShare: () => true, share } as unknown as Navigator);
    expect(await shareRoute("Loop", ROUTE)).toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toBe("loop.gpx");
  });

  it("returns 'cancelled' when the user dismisses the sheet", async () => {
    const share = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("cancelled"), { name: "AbortError" })
      );
    setNavigator({ canShare: () => true, share } as unknown as Navigator);
    expect(await shareRoute("Loop", ROUTE)).toBe("cancelled");
  });

  it("falls back to download when file-share is unsupported", async () => {
    setNavigator({ canShare: () => false } as unknown as Navigator);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    expect(await shareRoute("Loop", ROUTE)).toBe("downloaded");
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it("fails on the native app rather than claim a download it cannot make", async () => {
    // WKWebView drops a blob download without a word.
    platform.native = true;
    setNavigator({ canShare: () => false } as unknown as Navigator);
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:x");
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    expect(await shareRoute("Loop", ROUTE)).toBe("failed");
    expect(createUrl).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it("shares a GPX built elsewhere under the name it is given", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ canShare: () => true, share } as unknown as Navigator);
    expect(await shareGpx("<gpx/>", "tropos-run-1.gpx")).toBe("shared");
    const file = share.mock.calls[0][0].files[0] as File;
    expect(file.name).toBe("tropos-run-1.gpx");
    expect(file.type).toBe("application/gpx+xml");
    expect(await file.text()).toBe("<gpx/>");
  });

  it("calls a native sheet refused for want of a fresh tap a failure", async () => {
    platform.native = true;
    const share = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("no tap"), { name: "NotAllowedError" })
      );
    setNavigator({ canShare: () => true, share } as unknown as Navigator);
    expect(await shareGpx("<gpx/>", "tropos-run-1.gpx")).toBe("failed");
    expect(share).toHaveBeenCalledOnce();
  });
});

describe("announceRouteShare", () => {
  afterEach(() => {
    toasts.success.mockClear();
    toasts.error.mockClear();
  });

  it("confirms a download and says when nothing was shared", () => {
    announceRouteShare("downloaded");
    expect(toasts.success).toHaveBeenCalledWith("Route downloaded");
    announceRouteShare("failed");
    expect(toasts.error).toHaveBeenCalledWith("Couldn't share route");
  });

  it("says nothing after a share or a dismissed sheet", () => {
    announceRouteShare("downloaded");
    expect(toasts.success).toHaveBeenCalledOnce();
    announceRouteShare("shared");
    announceRouteShare("cancelled");
    expect(toasts.success).toHaveBeenCalledOnce();
    expect(toasts.error).not.toHaveBeenCalled();
  });
});
