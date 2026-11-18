/**
 * Run27 (1): the 3-2-1 between Start and a run's clock. It shows each
 * second, goes once at the end or at the tap that skips it, and never goes
 * for a screen that has closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { restoreRealTimers } from "@/test/fakeTimers";
import { START_COUNTDOWN_MS, useStartCountdown } from "../useStartCountdown";

const T0 = Date.parse("2026-11-15T08:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => restoreRealTimers());

function countdown() {
  const onGo = vi.fn();
  const hook = renderHook(() => useStartCountdown(onGo));
  return { onGo, hook };
}
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("useStartCountdown", () => {
  it("counts 3, 2, 1 and goes once, three seconds after it began", () => {
    const { onGo, hook } = countdown();
    expect(START_COUNTDOWN_MS).toBe(3000);
    expect(hook.result.current.seconds).toBeNull();
    act(() => hook.result.current.begin());
    expect(hook.result.current.seconds).toBe(3);
    wait(999);
    expect(hook.result.current.seconds).toBe(3);
    wait(1);
    expect(hook.result.current.seconds).toBe(2);
    wait(1000);
    expect(hook.result.current.seconds).toBe(1);
    expect(onGo).not.toHaveBeenCalled();
    wait(1000);
    expect(onGo).toHaveBeenCalledExactlyOnceWith(T0 + 3000);
    expect(hook.result.current.seconds).toBeNull();
    wait(10_000);
    expect(onGo).toHaveBeenCalledOnce();
  });

  it("goes at the tap that skips it, and not again when its time runs out", () => {
    const { onGo, hook } = countdown();
    act(() => hook.result.current.begin());
    wait(1200);
    act(() => hook.result.current.skip());
    expect(onGo).toHaveBeenCalledExactlyOnceWith(T0 + 1200);
    expect(hook.result.current.seconds).toBeNull();
    act(() => hook.result.current.skip());
    wait(5000);
    expect(onGo).toHaveBeenCalledOnce();
  });

  it("goes for no screen that has closed", () => {
    const { onGo, hook } = countdown();
    act(() => hook.result.current.begin());
    wait(1500);
    hook.unmount();
    vi.advanceTimersByTime(5000);
    expect(onGo).not.toHaveBeenCalled();
  });

  it("a skip before it begins starts nothing", () => {
    const { onGo, hook } = countdown();
    act(() => hook.result.current.skip());
    expect(onGo).not.toHaveBeenCalled();
  });

  it("goes when a held timer fires, so the clock counts no time unseen", () => {
    const { onGo, hook } = countdown();
    act(() => hook.result.current.begin());
    // The app behind for a minute: the phone held the timers, and the
    // wall clock moved on without them.
    vi.setSystemTime(T0 + 60_000);
    wait(3000);
    expect(onGo).toHaveBeenCalledExactlyOnceWith(T0 + 63_000);
  });
});
