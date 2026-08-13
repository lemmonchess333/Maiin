/**
 * STRUCT-SESS-02 — the segment player.
 *
 * Ports the load-bearing behaviours of the old `useIntervalWorkout`
 * machine to the data-driven walk, and adds the shapes the old machine
 * could not express (tempo blocks, strides):
 *  - idempotent start (the Run page's start effect re-fires every render;
 *    pre-guard, each re-fire silently reset a live workout to step 1);
 *  - duration segments advance on elapsed, distance segments on metres;
 *  - skip forces the same advance tick would take (one shared path);
 *  - degenerate zero-target segments can never wedge a run;
 *  - completion is terminal.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSessionPlayer } from "../useSessionPlayer";
import {
  segmentsFromEasyWithStrides,
  segmentsFromIntervals,
  segmentsFromTempo,
  type SessionSegment,
} from "@/lib/runSegments";

// STRUCT-SESS-03: the player anchors on the PUSHED pause-corrected
// elapsed, so tests drive time by passing it — no fake timers.

describe("useSessionPlayer", () => {
  const intervalSegs = segmentsFromIntervals({
    reps: 2,
    workDistance: 400,
    restDuration: 60,
    warmupDuration: 300,
    cooldownDuration: 120,
  }, "km");

  it("start is idempotent — re-fires never reset a live session", () => {
    const { result } = renderHook(() => useSessionPlayer(intervalSegs));
    act(() => result.current.start());
    expect(result.current.state.index).toBe(0);
    // Progress into the session, then re-fire start (as the Run page does
    // on every render of an active run).
    act(() => {
      result.current.tick(301, 0);
    });
    expect(result.current.state.index).toBe(1);
    act(() => result.current.start());
    expect(result.current.state.index).toBe(1); // NOT reset
  });

  it("duration segments advance on elapsed; distance segments on metres", () => {
    const { result } = renderHook(() => useSessionPlayer(intervalSegs));
    act(() => result.current.start());
    // Warmup (300s duration): time passes, distance irrelevant.
    act(() => {
      result.current.tick(301, 500);
    });
    expect(result.current.current?.type).toBe("hard");
    // Work rep 1 (400m distance): time alone does NOT advance it…
    act(() => {
      result.current.tick(801, 700); // only 200m into the rep
    });
    expect(result.current.current?.type).toBe("hard");
    // …metres do.
    act(() => {
      result.current.tick(802, 950); // 450m into the rep
    });
    expect(result.current.current?.type).toBe("recovery");
  });

  it("walks a tempo session: warmup → block → float → block → cooldown", () => {
    const segs = segmentsFromTempo(
      { warmupSec: 600, workSecs: [1200, 1200], floatSec: 180, cooldownSec: 300 }, "km",
      270
    );
    const { result } = renderHook(() => useSessionPlayer(segs));
    act(() => result.current.start());
    let elapsed = 0;
    const walk = (s: number) =>
      act(() => {
        elapsed += s + 1;
        result.current.tick(elapsed, 0);
      });
    expect(result.current.current?.type).toBe("warmup");
    walk(600);
    expect(result.current.current?.type).toBe("moderate");
    expect(result.current.current?.rep).toBe(1);
    walk(1200);
    expect(result.current.current?.label).toBe("Float");
    walk(180);
    expect(result.current.current?.rep).toBe(2);
    walk(1200);
    expect(result.current.current?.type).toBe("cooldown");
    walk(300);
    expect(result.current.isComplete).toBe(true);
  });

  it("walks a strided easy run and completes", () => {
    const segs = segmentsFromEasyWithStrides(30, { reps: 2, workSeconds: 20 });
    const { result } = renderHook(() => useSessionPlayer(segs));
    act(() => result.current.start());
    expect(result.current.current?.type).toBe("easy");
    // Skip through: easy → stride 1 → walk → stride 2 → walk → complete.
    for (let i = 0; i < segs.length; i++) {
      act(() => result.current.skip(0, 0));
    }
    expect(result.current.isComplete).toBe(true);
  });

  it("skip forces the advance tick would take, resetting the phase clock", () => {
    const { result } = renderHook(() => useSessionPlayer(intervalSegs));
    act(() => result.current.start());
    act(() => result.current.skip(50, 100)); // skip warmup at t=50s, 100m
    expect(result.current.current?.type).toBe("hard");
    // The phase odometer re-anchored at 100m: 350m total = 250m into the rep.
    act(() => {
      result.current.tick(60, 350);
    });
    expect(result.current.current?.type).toBe("hard");
    expect(
      Math.round(result.current.state.phaseDistanceCovered)
    ).toBe(250);
  });

  it("zero-target segments can never wedge the walk", () => {
    const segs: SessionSegment[] = [
      {
        type: "easy",
        label: "Easy 0",
        instruction: "",
        target: { kind: "duration", seconds: 0 },
      },
      {
        type: "cooldown",
        label: "Cool-down",
        instruction: "",
        target: { kind: "duration", seconds: 60 },
      },
    ];
    const { result } = renderHook(() => useSessionPlayer(segs));
    act(() => result.current.start());
    act(() => {
      result.current.tick(1, 0);
    });
    // The zero-length segment was walked past, not stuck on.
    expect(result.current.current?.type).toBe("cooldown");
  });

  it("STRUCT-SESS-03: pause-correct — the phase clock follows the pushed timer, not wall clock", () => {
    // The old interval machine anchored on Date.now(), so pausing mid-rep
    // silently burned the rep; the old guided hook carried private pause
    // accounting to avoid exactly that. The player anchors on the pushed
    // (pause-corrected) elapsed: a pause — however long in wall time —
    // freezes the phase clock because the timer freezes.
    const segs = segmentsFromTempo({
      warmupSec: 300,
      workSecs: [600],
      cooldownSec: 300,
    }, "km");
    const { result } = renderHook(() => useSessionPlayer(segs));
    act(() => result.current.start());
    act(() => result.current.tick(100, 0));
    expect(result.current.state.phaseElapsed).toBe(100);
    // Paused: the page pushes the SAME elapsed on resume, regardless of
    // how much wall time passed.
    act(() => result.current.tick(100, 0));
    expect(result.current.state.phaseElapsed).toBe(100);
    expect(result.current.current?.type).toBe("warmup");
    // Resume and cross the threshold on TIMER time.
    act(() => result.current.tick(301, 0));
    expect(result.current.current?.type).toBe("moderate");
  });

  it("no segments → inert player", () => {
    const { result } = renderHook(() => useSessionPlayer(null));
    act(() => result.current.start());
    expect(result.current.state.index).toBe(-1);
    expect(result.current.isComplete).toBe(false);
  });
});
