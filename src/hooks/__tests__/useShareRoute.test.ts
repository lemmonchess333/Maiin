import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  privacy: { zones: [], loading: false, error: false },
  share: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../usePrivacyZones", () => ({ usePrivacyZones: () => mock.privacy }));
vi.mock("@/lib/shareRoute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shareRoute")>()),
  shareRoute: mock.share,
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: mock.error, success: vi.fn() },
}));
import { useShareRoute } from "../useShareRoute";
import type { GPSPoint } from "@/lib/gps";
const route: GPSPoint[] = [0.01, 0.02].map((lon) => ({
  lat: 51.5,
  lon,
  rawLat: 51.5,
  rawLon: lon,
  timestamp: 0,
  speed: null,
  altitude: null,
  accuracy: 0,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.privacy = { zones: [], loading: false, error: false };
  mock.share.mockResolvedValue("shared");
});
it.each(["loading", "error"] as const)(
  "withholds all coordinates while privacy settings report %s",
  async (state) => {
    mock.privacy[state] = true;
    const { result } = renderHook(() => useShareRoute());
    await act(() => result.current("My route", route));
    expect(mock.error).toHaveBeenCalledOnce();
    expect(mock.share).not.toHaveBeenCalled();
  }
);
it("shares after settings have positively loaded", async () => {
  mock.privacy.loading = true;
  const { result, rerender } = renderHook(() => useShareRoute());
  mock.privacy.loading = false;
  rerender();
  await act(() => result.current("My route", route));
  expect(mock.share).toHaveBeenCalledWith("My route", route);
});
