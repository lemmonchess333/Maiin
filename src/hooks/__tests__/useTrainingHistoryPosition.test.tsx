import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrainingHistoryPosition } from "../useTrainingHistoryPosition";

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
let scrollY = 0;

beforeEach(() => {
  scrollY = 0;
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  vi.spyOn(window, "scrollTo").mockImplementation((options) => {
    scrollY = (options as ScrollToOptions).top ?? 0;
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollY)
    Object.defineProperty(window, "scrollY", originalScrollY);
});

describe("Training History position", () => {
  it("restores again after a provisional sync banner leaves without repeatedly moving offline readers", () => {
    const uid = "history-position-banner-test";
    const filters = "older-period";
    const firstVisit = renderHook(() =>
      useTrainingHistoryPosition(uid, filters, true, 71, false)
    );
    act(() => firstVisit.result.current.showMore());
    expect(firstVisit.result.current.count).toBe(60);
    scrollY = 4574;
    act(() => firstVisit.result.current.remember());
    firstVisit.unmount();

    scrollY = 0;
    const back = renderHook(
      ({ ready, rowCount, provisional }) =>
        useTrainingHistoryPosition(uid, filters, ready, rowCount, provisional),
      {
        initialProps: { ready: false, rowCount: 0, provisional: false },
      }
    );
    expect(back.result.current.count).toBe(60);
    expect(scrollY).toBe(0);

    back.rerender({ ready: true, rowCount: 71, provisional: true });
    expect(scrollY).toBe(4574);

    // A cached/offline period may keep the banner for a long time. Renders
    // while it stays visible must not pull the reader back after they scroll.
    scrollY = 4400;
    back.rerender({ ready: true, rowCount: 72, provisional: true });
    expect(scrollY).toBe(4400);

    // The banner above the list leaves when the server confirms the period.
    scrollY = 4450;
    back.rerender({ ready: true, rowCount: 72, provisional: false });
    expect(scrollY).toBe(4574);

    scrollY = 4000;
    back.rerender({ ready: true, rowCount: 73, provisional: false });
    expect(scrollY).toBe(4000);
  });
});
