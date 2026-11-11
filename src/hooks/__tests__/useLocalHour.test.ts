/**
 * useLocalHour: the clock's hour for a screen, kept current.
 *
 * Food files a log under the meal the hour says, and nothing on the page
 * shows which meal that is. A phone keeps a page mounted for hours, so an
 * hour read once when Food opened would file a lunch as breakfast.
 * Pinned here: the hour holds within the hour, moves when it turns while
 * the page is open, and moves on a return to the app later in the day.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { inferMostLikelyMealSlot } from "@/components/food/mealConstants";
import { restoreRealTimers } from "@/test/fakeTimers";
import { useLocalHour } from "../useLocalHour";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 9, 9, 59, 0));
});
afterEach(async () => {
  await restoreRealTimers();
});

describe("useLocalHour", () => {
  it("holds within the hour", () => {
    const { result } = renderHook(() => useLocalHour());
    expect(result.current).toBe(9);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(9);
  });

  it("moves when the hour turns while the page stays open, and the meal with it", () => {
    const { result } = renderHook(() => useLocalHour());
    expect(inferMostLikelyMealSlot(result.current)).toBe("breakfast");
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(result.current).toBe(10);
    expect(inferMostLikelyMealSlot(result.current)).toBe("lunch");
  });

  it("moves on a return to the app later in the day", () => {
    const { result } = renderHook(() => useLocalHour());
    // In the background since breakfast: no timer ran, the clock moved.
    vi.setSystemTime(new Date(2026, 10, 9, 19, 5, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(19);
    expect(inferMostLikelyMealSlot(result.current)).toBe("dinner");
  });

  it("stops watching the clock when nothing reads it", () => {
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() => useLocalHour());
    unmount();
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
