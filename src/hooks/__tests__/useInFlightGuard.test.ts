/**
 * useInFlightGuard — synchronous double-submit latch. Pins that begin()
 * rejects a second same-tick call before end() runs (the same-frame ghost-click
 * window a state guard alone can't close), and that end() releases it.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInFlightGuard } from "../useInFlightGuard";

describe("useInFlightGuard", () => {
  it("begin() acquires once; a second call is rejected until end()", () => {
    const { result } = renderHook(() => useInFlightGuard());
    expect(result.current.begin()).toBe(true); // first acquires
    expect(result.current.begin()).toBe(false); // second, still in flight
    expect(result.current.begin()).toBe(false); // and again
    result.current.end();
    expect(result.current.begin()).toBe(true); // released → re-acquires
  });

  it("begin/end are stable across renders", () => {
    const { result, rerender } = renderHook(() => useInFlightGuard());
    const first = result.current;
    rerender();
    expect(result.current.begin).toBe(first.begin);
    expect(result.current.end).toBe(first.end);
  });
});
