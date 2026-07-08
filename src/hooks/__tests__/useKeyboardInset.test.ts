/**
 * useKeyboardInset — pins the visualViewport overlap math (the px a soft
 * keyboard covers at the bottom, which BottomSheet reserves as padding).
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
