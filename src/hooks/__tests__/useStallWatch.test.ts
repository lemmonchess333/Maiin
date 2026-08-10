/**
 * useStallWatch — the diagnostic for the failure that had none.
 *
 * A Firestore listener that neither fires nor errors leaves a `loading`
 * flag true forever. No error is logged, `navigator.onLine` stays true,
 * and the user sees skeletons indefinitely. That is the residual shape
 * behind the unreproduced "analytics doesn't load" report, and nothing
 * in the app could observe it.
 *
 * The tests that matter here are the NEGATIVE ones — it must not fire
 * for a read that simply took a while and then arrived, because a false
 * stall notice on a slow connection is worse than no notice at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const logError = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => logError(...a) },
}));

import { useStallWatch } from "../useStallWatch";

beforeEach(() => {
  vi.useFakeTimers();
  logError.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useStallWatch", () => {
  it("reports nothing before the threshold", () => {
    const { result } = renderHook(() =>
      useStallWatch({ runs: true, workouts: true }, 15_000)
    );
    expect(result.current).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(result.current).toEqual([]);
  });

  it("names exactly the sources still loading, not all of them", () => {
    // The whole point: "analytics is stuck" is not actionable, "the runs
    // read is stuck" is. A watchdog that reported the union would have
    // left the next report as undiagnosable as the last.
    const { result } = renderHook(() =>
      useStallWatch({ runs: true, workouts: false, meals: true }, 15_000)
    );
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current).toEqual(["meals", "runs"]);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0][1]).toMatchObject({
      sources: ["meals", "runs"],
    });
  });

  it("does NOT fire for a slow read that arrives in time", () => {
    // The false-positive case, and the reason this is a watchdog rather
    // than a timeout. A 14-second read on a bad connection is a wait, not
    // a fault; telling the user it failed would be inventing an error.
    const { result, rerender } = renderHook(
      ({ loading }) => useStallWatch({ runs: loading }, 15_000),
      { initialProps: { loading: true } }
    );
    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });

  it("clears once a stalled source finally arrives", () => {
    // A wedged stream that recovers must take the notice down with it,
    // or the surface tells the user it is broken while it is working.
    const { result, rerender } = renderHook(
      ({ loading }) => useStallWatch({ runs: loading }, 15_000),
      { initialProps: { loading: true } }
    );
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current).toEqual(["runs"]);

    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual([]);
  });

  it("survives the inline-object call pattern every caller uses", () => {
    /* The bug this hook would otherwise have shipped with. Callers write
       `useStallWatch({ runs: runsLoading, ... })`, which is a NEW object
       every render. Depending on that identity restarts the timer on each
       render, so on a surface that re-renders faster than the threshold
       the watchdog never fires at all — a diagnostic that is silent
       precisely when something is wrong.

       Re-rendering 50 times with unchanged VALUES must still trip it. */
    const { result, rerender } = renderHook(() =>
      useStallWatch({ runs: true }, 15_000)
    );
    for (let i = 0; i < 50; i += 1) {
      act(() => {
        vi.advanceTimersByTime(300);
      });
      rerender();
    }
    expect(result.current).toEqual(["runs"]);
  });

  it("logs once per distinct stalled set, not once per render", () => {
    const { rerender } = renderHook(() =>
      useStallWatch({ runs: true }, 15_000)
    );
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    for (let i = 0; i < 10; i += 1) rerender();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("reports nothing when nothing is loading", () => {
    const { result } = renderHook(() =>
      useStallWatch({ runs: false, workouts: false }, 15_000)
    );
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toEqual([]);
    expect(logError).not.toHaveBeenCalled();
  });
});
