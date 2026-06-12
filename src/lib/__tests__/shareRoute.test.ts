import { describe, it, expect, vi, afterEach } from "vitest";
import { shareRoute, routeSlug } from "../shareRoute";
import type { GPSPoint } from "../gps";

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

describe("shareRoute", () => {
  const origNav = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
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
});
