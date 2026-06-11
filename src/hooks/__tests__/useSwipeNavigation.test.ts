import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSwipeNavigation } from "../useSwipeNavigation";

/* These tests pin the conflict-avoidance maths that can't be felt on the
   rig (CI has no touch device): direction-lock, distance/flick thresholds,
   edge guard, the data-no-page-swipe / data-swipe-card opt-out, multi-touch
   bail, and the tab-root gating. They drive the hook's two handlers with
   synthetic touch events and assert which adjacent route it navigates to. */

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const ROUTES = ["/", "/program", "/food", "/social", "/history"];

// performance.now() backs the velocity calc — drive it deterministically so
// the flick branch is testable. Each gesture: now() at start, now() at end.
let nowValue = 0;
beforeEach(() => {
  navigate.mockClear();
  nowValue = 0;
  vi.spyOn(performance, "now").mockImplementation(() => nowValue);
  Object.defineProperty(window, "innerWidth", {
    value: 400,
    writable: true,
    configurable: true,
  });
});

function startEvent(
  x: number,
  y: number,
  opts: { touches?: number; target?: Partial<HTMLElement> } = {}
) {
  const target = {
    closest: (sel: string) =>
      opts.target?.closest ? opts.target.closest(sel) : null,
  };
  return {
    touches: { length: opts.touches ?? 1, 0: { clientX: x, clientY: y } },
    target,
  } as unknown as React.TouchEvent;
}

function endEvent(x: number, y: number) {
  return {
    changedTouches: { 0: { clientX: x, clientY: y } },
  } as unknown as React.TouchEvent;
}

/** Run one full gesture from (x1,y1)→(x2,y2) over `dt` ms. */
function swipe(
  result: { current: ReturnType<typeof useSwipeNavigation> },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dt = 200,
  startOpts?: Parameters<typeof startEvent>[2]
) {
  nowValue = 0;
  result.current.onTouchStart(startEvent(x1, y1, startOpts));
  nowValue = dt;
  result.current.onTouchEnd(endEvent(x2, y2));
}

describe("useSwipeNavigation — direction + commit", () => {
  it("swipe left advances to the next tab", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 200, 300, 100, 305); // dx = -100
    expect(navigate).toHaveBeenCalledWith("/food");
  });

  it("swipe right goes to the previous tab", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 200, 300, 300, 305); // dx = +100
    expect(navigate).toHaveBeenCalledWith("/");
  });

  it("does not advance past the last tab", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/history"));
    swipe(result, 200, 300, 100, 305);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not go back before the first tab", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/"));
    swipe(result, 200, 300, 300, 305);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("fires onDirection with +1 / -1 before navigating", () => {
    const onDir = vi.fn();
    const { result } = renderHook(() =>
      useSwipeNavigation(ROUTES, "/program", onDir)
    );
    swipe(result, 200, 300, 100, 305);
    expect(onDir).toHaveBeenCalledWith(1);
    swipe(result, 200, 300, 300, 305);
    expect(onDir).toHaveBeenCalledWith(-1);
  });
});

describe("useSwipeNavigation — conflict avoidance", () => {
  it("ignores a mostly-vertical drag (direction-lock)", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    // dx = -100 but dy = 200 → |dx| <= |dy| * 1.5, not horizontal
    swipe(result, 200, 100, 100, 300);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores a short slow drag below the distance threshold", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    // dx = -40 (< 64px), slow (40px / 200ms = 0.2px/ms < 0.45) → no commit
    swipe(result, 200, 300, 160, 302, 200);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("commits a short FAST flick even below the distance floor", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    // dx = -40 (> 32 flick floor), fast (40px / 50ms = 0.8px/ms > 0.45)
    swipe(result, 200, 300, 160, 302, 50);
    expect(navigate).toHaveBeenCalledWith("/food");
  });

  it("ignores a gesture starting in the left edge guard", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 10, 300, 200, 305); // starts at x=10 (< 28px guard)
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores a gesture starting in the right edge guard", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 395, 300, 200, 305); // starts at x=395 (> 400-28)
    expect(navigate).not.toHaveBeenCalled();
  });

  it("bails when the gesture starts inside a data-no-page-swipe element", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 200, 300, 100, 305, 200, {
      target: { closest: () => ({}) as Element },
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores multi-touch gestures", () => {
    const { result } = renderHook(() => useSwipeNavigation(ROUTES, "/program"));
    swipe(result, 200, 300, 100, 305, 200, { touches: 2 });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing on a non-tab sub-page", () => {
    const { result } = renderHook(() =>
      useSwipeNavigation(ROUTES, "/settings")
    );
    swipe(result, 200, 300, 100, 305);
    expect(navigate).not.toHaveBeenCalled();
  });
});
