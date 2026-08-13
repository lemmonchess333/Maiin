/**
 * useKeyboardInset — pins the visualViewport overlap math: the px a soft
 * keyboard covers at the bottom, which BottomSheet uses to lift its
 * ANCHOR clear of the keyboard. (It reserved this as `paddingBottom`
 * until 2026-08-13, which grew a `bottom-0` sheet upward and stranded its
 * CTA off the top of the screen — see BottomSheet.test.tsx.)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardInset } from "../useKeyboardInset";

type Listeners = Record<string, Array<() => void>>;

function stubViewport(height: number, offsetTop = 0) {
  const listeners: Listeners = {};
  const vv = {
    height,
    offsetTop,
    addEventListener: (t: string, cb: () => void) => {
      (listeners[t] ||= []).push(cb);
    },
    removeEventListener: vi.fn(),
    fire: (t: string) => (listeners[t] || []).forEach((cb) => cb()),
  };
  Object.defineProperty(window, "visualViewport", {
    value: vv,
    configurable: true,
    writable: true,
  });
  return vv;
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe("useKeyboardInset", () => {
  it("is 0 when the visual viewport fills the layout viewport (no keyboard)", () => {
    stubViewport(window.innerHeight, 0);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it("reports the overlap when the keyboard shrinks the visual viewport", () => {
    const vv = stubViewport(window.innerHeight, 0);
    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = window.innerHeight - 300; // keyboard opens, 300px tall
      vv.fire("resize");
    });
    expect(result.current).toBe(300);
  });

  it("subtracts offsetTop and never goes negative", () => {
    const vv = stubViewport(window.innerHeight + 50, 0); // taller VV → clamp
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    act(() => {
      vv.height = window.innerHeight - 260;
      vv.offsetTop = 40;
      vv.fire("scroll");
    });
    expect(result.current).toBe(220); // 260 - 40
  });

  it("no-ops when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});

/**
 * The two viewport models, and why one hook serves both.
 *
 * The bug that prompted this was iOS Safari, where the LAYOUT viewport
 * does not shrink when the keyboard opens — only the visual one does, so
 * a `bottom: 0` sheet stays pinned behind the keyboard and needs lifting.
 * Android and desktop Chrome resize the layout viewport instead, so the
 * sheet is already above the keyboard and must NOT be lifted again.
 *
 * `innerHeight - vv.height` yields the keyboard height in the first case
 * and ~0 in the second, so the same expression is correct in both without
 * a platform branch. That is the property worth pinning, because it is
 * what makes the BottomSheet fix safe to ship to platforms this sandbox
 * cannot drive — the arithmetic, not a device screenshot, is the argument.
 */
describe("useKeyboardInset — both keyboard viewport models", () => {
  it("lifts nothing when the LAYOUT viewport already shrank (Android/Chrome)", () => {
    /* Both viewports shrink together, so there is no overlap left to
       reserve. A hook that keyed off "is a keyboard open" rather than the
       overlap would double-lift here and push the sheet up by a keyboard
       height for no reason. */
    const originalInner = window.innerHeight;
    try {
      Object.defineProperty(window, "innerHeight", {
        value: originalInner - 300,
        configurable: true,
      });
      stubViewport(window.innerHeight, 0);
      const { result } = renderHook(() => useKeyboardInset());
      expect(result.current).toBe(0);
    } finally {
      Object.defineProperty(window, "innerHeight", {
        value: originalInner,
        configurable: true,
      });
    }
  });

  it("lifts by the keyboard height when only the VISUAL viewport shrank (iOS Safari)", () => {
    const vv = stubViewport(window.innerHeight, 0);
    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = window.innerHeight - 336; // iPhone keyboard, portrait
      vv.fire("resize");
    });
    expect(result.current).toBe(336);
  });

  it("no-ops where visualViewport is absent entirely", () => {
    /* Older WebViews. The sheet then behaves exactly as it did before any
       of this existed, rather than throwing on a missing API. */
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});
