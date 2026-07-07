import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIntervalWorkout, type IntervalConfig } from "../useIntervalWorkout";

describe("useIntervalWorkout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const basicConfig: IntervalConfig = {
    reps: 3,
    workDuration: 5,
    restDuration: 3,
  };

  it("starts in idle phase", () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.currentRep).toBe(0);
  });

  it("transitions to work phase on start (no warmup)", () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe("work");
    expect(result.current.state.currentRep).toBe(1);
  });

  it("transitions to warmup phase when configured", () => {
    const config: IntervalConfig = { ...basicConfig, warmupDuration: 10 };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe("warmup");
    expect(result.current.state.currentRep).toBe(0);
  });

  it("transitions from work to rest after work duration", () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());

    // Simulate time passing beyond work duration
    vi.advanceTimersByTime(6000);
    act(() => result.current.tick(6, 0));

    expect(result.current.state.phase).toBe("rest");
  });

  it("transitions from rest to work for next rep", () => {
    const { result } = renderHook(() => useIntervalWorkout(basicConfig));
    act(() => result.current.start());

    // Complete work phase
    vi.advanceTimersByTime(6000);
    act(() => result.current.tick(6, 0));
    expect(result.current.state.phase).toBe("rest");

    // Complete rest phase
    vi.advanceTimersByTime(4000);
    act(() => result.current.tick(10, 0));
    expect(result.current.state.phase).toBe("work");
    expect(result.current.state.currentRep).toBe(2);
  });

  it("completes after all reps are done (no cooldown)", () => {
    const config: IntervalConfig = {
      reps: 1,
      workDuration: 2,
      restDuration: 2,
    };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Complete the single work rep
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));

    expect(result.current.state.phase).toBe("complete");
  });

  it("goes to cooldown before complete when configured", () => {
    const config: IntervalConfig = {
      reps: 1,
      workDuration: 2,
      restDuration: 2,
      cooldownDuration: 5,
    };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Complete work
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));

    expect(result.current.state.phase).toBe("cooldown");
  });

  it("prevents rep counter from exceeding totalReps on rest→work transition", () => {
    const config: IntervalConfig = {
      reps: 2,
      workDuration: 2,
      restDuration: 2,
    };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());

    // Rep 1: work → rest
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(3, 0));
    expect(result.current.state.phase).toBe("rest");

    // rest → work (rep 2)
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(6, 0));
    expect(result.current.state.phase).toBe("work");
    expect(result.current.state.currentRep).toBe(2);

    // Rep 2: work → complete (no rest after final rep because reps exhausted)
    vi.advanceTimersByTime(3000);
    act(() => result.current.tick(9, 0));
    expect(result.current.state.phase).toBe("complete");
  });

  it("handles distance-based work phases", () => {
    const config: IntervalConfig = {
      reps: 1,
      workDistance: 400,
      restDuration: 3,
    };
    const { result } = renderHook(() => useIntervalWorkout(config));
    act(() => result.current.start());
    expect(result.current.state.isDistanceBased).toBe(true);

    // Simulate running 400m
    vi.advanceTimersByTime(2000);
    act(() => result.current.tick(2, 450));

    expect(result.current.state.phase).toBe("complete");
  });

  it("does nothing when config is undefined", () => {
    const { result } = renderHook(() => useIntervalWorkout(undefined));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe("idle");
  });
});

/* Manual step advance (the step shell's "Skip step" — Runna's Next Lap).
 * skip() must mirror tick()'s threshold transitions exactly, so it walks
 * the same phase sequence. */
describe("useIntervalWorkout.skip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const fullConfig: IntervalConfig = {
    reps: 2,
    workDistance: 1000,
    restDuration: 90,
    warmupDuration: 300,
    cooldownDuration: 300,
  };

  it("walks the full session: warmup → work → rest → work → cooldown → complete", () => {
    const { result } = renderHook(() => useIntervalWorkout(fullConfig));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe("warmup");

    act(() => result.current.skip(0));
    expect(result.current.state.phase).toBe("work");
    expect(result.current.state.currentRep).toBe(1);
    expect(result.current.state.isDistanceBased).toBe(true);

    act(() => result.current.skip(400));
    expect(result.current.state.phase).toBe("rest");
    expect(result.current.state.currentRep).toBe(1);
    expect(result.current.state.phaseTarget).toBe(90);

    act(() => result.current.skip(400));
    expect(result.current.state.phase).toBe("work");
    expect(result.current.state.currentRep).toBe(2);

    // Final rep skips straight past rest into the cooldown.
    act(() => result.current.skip(1400));
    expect(result.current.state.phase).toBe("cooldown");

    act(() => result.current.skip(1400));
    expect(result.current.state.phase).toBe("complete");
  });

  it("without a cooldown, skipping the final rep completes the session", () => {
    const cfg: IntervalConfig = { reps: 1, workDuration: 45, restDuration: 60 };
    const { result } = renderHook(() => useIntervalWorkout(cfg));
    act(() => result.current.start());
    expect(result.current.state.phase).toBe("work"); // no warmup configured

    act(() => result.current.skip(0));
    expect(result.current.state.phase).toBe("complete");
  });

  it("is a no-op when idle", () => {
    const { result } = renderHook(() => useIntervalWorkout(fullConfig));
    act(() => result.current.skip(0));
    expect(result.current.state.phase).toBe("idle");
  });

  it("re-anchors the phase odometer so the next step starts fresh", () => {
    const { result } = renderHook(() => useIntervalWorkout(fullConfig));
    act(() => result.current.start());
    act(() => result.current.skip(0)); // → work rep 1, anchored at 0m
    act(() => result.current.tick(0, 100)); // 100m into the rep
    expect(result.current.state.phaseDistanceCovered).toBeGreaterThanOrEqual(
      100
    );

    act(() => result.current.skip(100)); // → rest, re-anchored at 100m
    act(() => result.current.tick(0, 120));
    expect(result.current.state.phaseDistanceCovered).toBeLessThanOrEqual(20);
  });
});

/* start() idempotence — load-bearing. Run.tsx's start effect depends on the
 * hook's per-render return object, so it re-fires on every render of an
 * active run; before the idle guard each re-fire silently reset the machine
 * to work rep 1 (a live interval workout could never progress). */
describe("useIntervalWorkout.start idempotence", () => {
  it("a second start() while live does NOT reset the machine", () => {
    const cfg: IntervalConfig = {
      reps: 3,
      workDistance: 1000,
      restDuration: 90,
    };
    const { result } = renderHook(() => useIntervalWorkout(cfg));
    act(() => result.current.start());
    act(() => result.current.skip(1000)); // → rest after rep 1
    expect(result.current.state.phase).toBe("rest");

    act(() => result.current.start()); // the re-fired effect
    expect(result.current.state.phase).toBe("rest");
    expect(result.current.state.currentRep).toBe(1);
  });
});
