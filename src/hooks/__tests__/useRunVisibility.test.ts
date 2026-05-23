/**
 * Tests for `useRunVisibility` — the visibility-change hook that
 * coordinates GPS / timer / audio teardown when the run page is
 * backgrounded and rebuilds them on foreground.
 *
 * Pins:
 *   1. enabled=true mounts a visibilitychange listener; enabled=false
 *      does not.
 *   2. onHidden fires when document.visibilityState flips to hidden.
 *   3. onVisible fires when it flips back, with a VisibilityEvent
 *      carrying hiddenAt, visibleAt, hiddenDuration.
 *   4. lastGap state captures the most recent gap.
 *   5. Callback refs stay fresh — handler captures the latest
 *      onHidden / onVisible from props without re-running the effect.
 *   6. Cleanup removes the listener on unmount.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRunVisibility, type VisibilityEvent } from "../useRunVisibility";

function setVisibilityState(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
    writable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setVisibilityState("visible");
  vi.useRealTimers();
});

describe("useRunVisibility — enabled / disabled", () => {
  it("starts with isVisible=true and no recorded gap", () => {
    const { result } = renderHook(() => useRunVisibility({}));
    expect(result.current.isVisible).toBe(true);
    expect(result.current.lastGap).toBeNull();
  });

  it("does NOT attach a listener when enabled=false", () => {
    const onHidden = vi.fn();
    renderHook(() =>
      useRunVisibility({ onHidden, enabled: false }),
    );
    act(() => setVisibilityState("hidden"));
    expect(onHidden).not.toHaveBeenCalled();
  });
});

describe("useRunVisibility — onHidden / onVisible", () => {
  it("fires onHidden when visibility flips to hidden", () => {
    const onHidden = vi.fn();
    renderHook(() => useRunVisibility({ onHidden }));
    act(() => setVisibilityState("hidden"));
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it("fires onVisible with a VisibilityEvent when it flips back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    const onVisible = vi.fn();
    renderHook(() => useRunVisibility({ onVisible }));

    /* Background for 7.5s, then foreground. */
    act(() => setVisibilityState("hidden"));
    vi.advanceTimersByTime(7500);
    act(() => setVisibilityState("visible"));

    expect(onVisible).toHaveBeenCalledTimes(1);
    const event = onVisible.mock.calls[0][0] as VisibilityEvent;
    expect(event.hiddenDuration).toBeCloseTo(7.5, 1);
    expect(event.visibleAt - event.hiddenAt).toBeCloseTo(7500, -2);
  });

  it("captures the gap in lastGap state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));

    const { result } = renderHook(() => useRunVisibility({}));
    act(() => setVisibilityState("hidden"));
    vi.advanceTimersByTime(3000);
    act(() => setVisibilityState("visible"));

    expect(result.current.lastGap).not.toBeNull();
    expect(result.current.lastGap?.hiddenDuration).toBeCloseTo(3, 1);
  });

  it("does NOT fire onVisible when the page was visible the whole time", () => {
    /* Without a preceding hidden, the visibilitychange to 'visible'
       has nothing to report — hiddenAt is null. */
    const onVisible = vi.fn();
    renderHook(() => useRunVisibility({ onVisible }));
    act(() => setVisibilityState("visible"));
    expect(onVisible).not.toHaveBeenCalled();
  });
});

describe("useRunVisibility — fresh callback refs", () => {
  it("uses the LATEST onHidden even after a rerender", () => {
    /* The hook's effect only re-runs when `enabled` changes — the
       callback refs update inside their own effects so a parent
       passing inline lambdas doesn't get a stale closure. */
    const v1 = vi.fn();
    const v2 = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useRunVisibility({ onHidden: cb }),
      { initialProps: { cb: v1 } },
    );
    rerender({ cb: v2 });

    act(() => setVisibilityState("hidden"));
    expect(v1).not.toHaveBeenCalled();
    expect(v2).toHaveBeenCalledTimes(1);
  });
});

describe("useRunVisibility — cleanup on unmount", () => {
  it("removes the visibilitychange listener", () => {
    const onHidden = vi.fn();
    const { unmount } = renderHook(() =>
      useRunVisibility({ onHidden }),
    );
    unmount();
    act(() => setVisibilityState("hidden"));
    expect(onHidden).not.toHaveBeenCalled();
  });
});
