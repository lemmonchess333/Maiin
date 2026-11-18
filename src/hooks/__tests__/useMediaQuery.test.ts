import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** A matchMedia whose answer the test sets, telling its listeners. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  return {
    matchMedia: vi.fn(() => mql),
    set(next: boolean) {
      matches = next;
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe("useMediaQuery", () => {
  it("answers the query, and again when it changes, as a fold does", () => {
    const fake = fakeMatchMedia(false);
    window.matchMedia = fake.matchMedia as unknown as typeof window.matchMedia;
    const { result, unmount } = renderHook(() =>
      useMediaQuery("(min-width: 800px)")
    );
    expect(result.current).toBe(false);
    act(() => fake.set(true));
    expect(result.current).toBe(true);
    act(() => fake.set(false));
    expect(result.current).toBe(false);
    unmount();
    expect(fake.listeners.size).toBe(0);
  });

  it("is false where the setup's stub answers nothing", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 800px)"));
    expect(result.current).toBe(false);
  });
});
