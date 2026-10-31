// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWatchSnapshotBeat } from "../useWatchSnapshotBeat";
import { restoreRealTimers } from "@/test/fakeTimers";
import type { WatchRunPhase } from "@/lib/watchRunBridge";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  restoreRealTimers();
});

describe("useWatchSnapshotBeat", () => {
  it("publishes on a beat, not on every render", () => {
    const publish = vi.fn();
    const { rerender } = renderHook(
      ({ tick }: { tick: number }) => {
        void tick;
        useWatchSnapshotBeat("running", "run-A", () => publish(tick));
      },
      { initialProps: { tick: 0 } }
    );
    expect(publish).toHaveBeenCalledOnce();
    // The run page re-renders several times a second.
    for (let tick = 1; tick <= 10; tick++) rerender({ tick });
    expect(publish).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(3_000);
    expect(publish).toHaveBeenCalledTimes(4);
    // Each beat sends the latest figures.
    expect(publish).toHaveBeenLastCalledWith(10);
  });

  it("keeps a heartbeat while paused, so the Watch's controls stay live", () => {
    const publish = vi.fn();
    const { rerender } = renderHook(
      ({ phase }: { phase: WatchRunPhase | null }) =>
        useWatchSnapshotBeat(phase, "run-A", publish),
      { initialProps: { phase: "running" as WatchRunPhase | null } }
    );
    publish.mockClear();
    rerender({ phase: "paused" });
    // At once on the change, then every five seconds.
    expect(publish).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(15_000);
    expect(publish).toHaveBeenCalledTimes(4);
    publish.mockClear();
    rerender({ phase: null });
    vi.advanceTimersByTime(15_000);
    expect(publish).not.toHaveBeenCalled();
  });
});
