/**
 * Tests for `useReducedMotion` — the matchMedia wrapper that returns
 * whether the OS has prefers-reduced-motion: reduce set.
 *
 * Used to suppress count-up animations (useCountUp), framer-motion
 * transitions, and the tooltip slide-in. A regression that always
 * returned false would break the motion-sensitive a11y contract;
 * one that always returned true would suppress animations for
 * everyone.
 *
 * Tests pin three behaviours:
 *   1. Initial value reflects matchMedia at mount.
 *   2. The hook subscribes to 'change' and updates when the
 *      preference flips.
 *   3. Cleanup removes the listener on unmount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReducedMotion } from "../useReducedMotion";

type ChangeHandler = (e: MediaQueryListEvent) => void;

let listeners: Set<ChangeHandler>;
let currentMatches: boolean;

function installMatchMediaMock(initialMatches: boolean) {
  currentMatches = initialMatches;
  listeners = new Set();
  const mql: MediaQueryList = {
    matches: currentMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (
      event: string,
      handler: EventListenerOrEventListenerObject,
    ) => {
      if (event === "change") listeners.add(handler as ChangeHandler);
    },
    removeEventListener: (
      event: string,
      handler: EventListenerOrEventListenerObject,
    ) => {
      if (event === "change") listeners.delete(handler as ChangeHandler);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  } as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => mql),
  );
  /* Some browsers expose matchMedia on window itself rather than
     globalThis; stub both to be safe. */
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => mql),
  });
}

function fireChange(matches: boolean) {
  currentMatches = matches;
  for (const handler of listeners) {
    handler({ matches } as MediaQueryListEvent);
  }
}

beforeEach(() => {
  listeners = new Set();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReducedMotion", () => {
  it("returns the initial matchMedia value (true)", () => {
    installMatchMediaMock(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("returns the initial matchMedia value (false)", () => {
    installMatchMediaMock(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it("updates when the user toggles the OS setting", () => {
    installMatchMediaMock(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => fireChange(true));
    expect(result.current).toBe(true);

    act(() => fireChange(false));
    expect(result.current).toBe(false);
  });

  it("removes the listener on unmount", () => {
    installMatchMediaMock(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
