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

  /**
   * The no-keyboard case as a real browser actually reports it.
   *
   * The Android/Chrome test above stubs the two viewports EQUAL, which is
   * the idealised reading. Chromium does not do that. Measured directly,
   * headless Chromium with an input focused reports:
   *
   *   desktop 1280x720      innerHeight 720   vv 720                  → 0
   *   iPhone 13 emulation   innerHeight 1669  vv 1668.5128173828125   → 0.487
   *   Pixel 5 emulation     innerHeight 1813  vv 1812.8753662109375   → 0.125
   *
   * A sub-pixel gap, with no keyboard anywhere. `Math.round` absorbs it —
   * but incidentally, and nothing pinned that. `Math.ceil` is the natural
   * "round up to be safe" edit, and it would give EVERY Chrome-based
   * device a permanent 1px inset: the sheet would take the inline-style
   * branch forever instead of `undefined`, on every mount, for a keyboard
   * that is not open.
   *
   * These fixtures are the measured numbers rather than invented ones,
   * because the whole point is that the real gap is not zero.
   */
  it.each([
    ["iPhone 13 emulation", 1669, 1668.5128173828125],
    ["Pixel 5 emulation", 1813, 1812.8753662109375],
    ["desktop 1280x720", 720, 720],
  ])("reports exactly 0 for %s with no keyboard", (_label, inner, vvHeight) => {
    const originalInner = window.innerHeight;
    try {
      Object.defineProperty(window, "innerHeight", {
        value: inner,
        configurable: true,
      });
      stubViewport(vvHeight, 0);
      const { result } = renderHook(() => useKeyboardInset());
      expect(result.current).toBe(0);
    } finally {
      Object.defineProperty(window, "innerHeight", {
        value: originalInner,
        configurable: true,
      });
    }
  });
});

/**
 * WHY THERE IS NO CHROMIUM E2E TEST FOR THE KEYBOARD LIFT.
 *
 * Recorded here rather than in a PR body so the next person weighing it
 * does not have to re-derive the answer — and because the first reason I
 * gave was the weaker one.
 *
 * The reason I originally gave: Chromium implements the RESIZE viewport
 * model, so a test there exercises semantics that were never broken and
 * could pass while iOS Safari still failed.
 *
 * The actual, stronger reason, measured: headless Chromium has NO SOFT
 * KEYBOARD. Focusing an input does not shrink the visual viewport under
 * any device emulation — the table above is what it reports with the
 * caret in a field. The condition the hook responds to cannot be produced
 * at all, on either model. Any such e2e test would have to synthesise the
 * divergence itself, which is precisely what these unit tests do, with
 * fewer moving parts and no browser to mislead a reader into thinking a
 * real keyboard was involved.
 *
 * What the probe DID earn is the sub-pixel case above; the real numbers
 * came from that run. The genuinely device-level claim — that the lifted
 * sheet looks right on iOS Safari — remains a manual pass, and is listed
 * in the pre-launch QA backlog rather than pretended away.
 */
