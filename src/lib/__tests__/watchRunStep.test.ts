import { describe, expect, it } from "vitest";
import {
  isWatchRunStep,
  watchRunStep,
  WATCH_STEP_MAX_STEPS,
  WATCH_STEP_TEXT_MAX,
} from "../watchRunStep";
import {
  segmentsFromIntervals,
  segmentsFromRunWalk,
  segmentsFromTempo,
  stepEyebrow,
  stepHeadline,
  type SessionSegment,
} from "../runSegments";

// 6 × 800 m at 3:50 /km with 90 s recoveries, a 10 min warm-up and cool-down.
const intervals = segmentsFromIntervals(
  {
    reps: 6,
    workDistance: 800,
    workPace: 230,
    restDuration: 90,
    warmupDuration: 600,
    cooldownDuration: 600,
  },
  "km"
);

const stepAt = (
  segments: readonly SessionSegment[],
  index: number,
  phaseElapsed = 0,
  phaseDistanceCovered = 0,
  band?: [number, number]
) =>
  watchRunStep({
    segments,
    index,
    phaseElapsed,
    phaseDistanceCovered,
    unit: "km",
    band,
  });

describe("the step a structured run sends the Watch", () => {
  it("names each step as the Run screen does: warm-up, each rep, recovery, cool-down", () => {
    // Warm-up, then rep and recovery five times, the sixth rep, cool-down.
    expect(intervals).toHaveLength(13);
    const names = intervals.map((_, i) => {
      const step = stepAt(intervals, i)!;
      return `${step.eyebrow} | ${step.headline}`;
    });
    expect(names[0]).toBe("EASY | Warm-up");
    expect(names[1]).toBe("QUICK AND RELAXED · REP 1/6 | 800 m @ 3:50 /km");
    expect(names[2]).toBe("EASY · AFTER REP 1/6 | Recover");
    expect(names[11]).toBe("QUICK AND RELAXED · REP 6/6 | 800 m @ 3:50 /km");
    expect(names[12]).toBe("EASY | Cool-down");
    // One source of words: the shell's own functions.
    intervals.forEach((segment, i) => {
      expect(stepAt(intervals, i)!.eyebrow).toBe(stepEyebrow(segment));
      expect(stepAt(intervals, i)!.headline).toBe(stepHeadline(segment, "km"));
    });
  });

  it("carries the pace target, band-first when the runner has a band", () => {
    const step = stepAt(intervals, 1, 0, 0, [225, 235]);
    expect(step?.headline).toBe("800 m at 3:45–3:55 /km");
    expect(step?.next).toBe("Recover");
    // A tempo at the runner's goal pace keeps the goal: it is pinned.
    const goal = segmentsFromTempo(
      { warmupSec: 600, workSecs: [1200], cooldownSec: 600 },
      "mi",
      300,
      { atGoalPace: true }
    );
    const block = watchRunStep({
      segments: goal,
      index: 1,
      phaseElapsed: 0,
      phaseDistanceCovered: 0,
      unit: "mi",
      band: [280, 300],
    });
    expect(block?.eyebrow).toBe("RACE PACE");
    expect(block?.headline).toBe("20 min goal pace @ 8:03 /mi");
  });

  it("says what is left of the step, rounded up like the Run screen's countdown", () => {
    const warmUp = stepAt(intervals, 0, 128.4);
    expect(warmUp).toMatchObject({
      index: 0,
      total: 13,
      effort: "easy",
      remainingSeconds: 472,
      next: "800 m @ 3:50 /km",
    });
    expect(warmUp?.progress).toBeCloseTo(0.214, 3);
    expect(warmUp?.remainingMeters).toBeUndefined();
    const rep = stepAt(intervals, 1, 40, 212.6);
    expect(rep).toMatchObject({
      effort: "work",
      remainingMeters: 587,
    });
    expect(rep?.remainingSeconds).toBeUndefined();
    expect(rep?.progress).toBeCloseTo(0.266, 3);
    // Past the target before the player has ticked on: nothing left, no
    // negative figure, never past full.
    expect(stepAt(intervals, 0, 640)).toMatchObject({
      remainingSeconds: 0,
      progress: 1,
    });
  });

  it("names the next step, and none on the last", () => {
    expect(stepAt(intervals, 2)?.next).toBe("800 m @ 3:50 /km");
    expect(stepAt(intervals, 11)?.next).toBe("Cool-down");
    expect(stepAt(intervals, 12)?.next).toBeUndefined();
  });

  it("marks each change with a haptic for effort up, effort down or the same", () => {
    const haptics = intervals.map((_, i) => stepAt(intervals, i)?.haptic);
    expect(haptics).toEqual([
      undefined, // the run's start, not a change
      "start",
      "stop",
      "start",
      "stop",
      "start",
      "stop",
      "start",
      "stop",
      "start",
      "stop",
      "start",
      "stop", // the cool-down
    ]);
    // A run-walk: the warm-up walk to a run is up, a run to a walk down.
    const runWalk = segmentsFromRunWalk({
      warmupWalkSec: 300,
      runSecs: [60, 60],
      walkSecs: [90],
      cooldownWalkSec: 300,
    });
    expect(runWalk.map((_, i) => stepAt(runWalk, i)?.haptic)).toEqual([
      undefined,
      "start",
      "stop",
      "start",
      "stop",
    ]);
    // Two tempo blocks back to back are the same effort.
    const blocks: SessionSegment[] = [
      { ...intervals[1], label: "One" },
      { ...intervals[1], label: "Two" },
    ];
    expect(stepAt(blocks, 1)?.haptic).toBe("next");
  });

  it("says when every step is done, with a haptic of its own", () => {
    expect(stepAt(intervals, 13)).toEqual({
      index: 13,
      total: 13,
      haptic: "done",
    });
  });

  it("sends no step for a run without steps, or before the player starts", () => {
    expect(stepAt([], 0)).toBeNull();
    expect(
      watchRunStep({
        segments: null,
        index: 0,
        phaseElapsed: 0,
        phaseDistanceCovered: 0,
        unit: "km",
      })
    ).toBeNull();
    expect(stepAt(intervals, -1)).toBeNull();
    const tooMany = Array.from(
      { length: WATCH_STEP_MAX_STEPS + 1 },
      () => intervals[0]
    );
    expect(stepAt(tooMany, 0)).toBeNull();
  });

  it("clips a line the bridge would refuse, rather than lose the step", () => {
    const long: SessionSegment = {
      ...intervals[1],
      eyebrow: "E".repeat(90),
      label: "L".repeat(90),
    };
    const step = stepAt([long], 0)!;
    expect(step.eyebrow).toHaveLength(WATCH_STEP_TEXT_MAX);
    expect(step.eyebrow?.endsWith("…")).toBe(true);
    expect(step.headline).toHaveLength(WATCH_STEP_TEXT_MAX);
    expect(isWatchRunStep(step)).toBe(true);
  });
});

describe("isWatchRunStep", () => {
  it("accepts every step the builder makes", () => {
    for (let i = 0; i <= intervals.length; i++)
      expect(isWatchRunStep(stepAt(intervals, i, 30, 100))).toBe(true);
  });

  it("refuses a step out of its bounds", () => {
    const step = stepAt(intervals, 1, 10, 10)!;
    expect(isWatchRunStep({ ...step, index: 14 })).toBe(false);
    expect(isWatchRunStep({ ...step, total: 0 })).toBe(false);
    expect(isWatchRunStep({ ...step, index: 1.5 })).toBe(false);
    expect(isWatchRunStep({ ...step, headline: "" })).toBe(false);
    expect(isWatchRunStep({ ...step, next: "x".repeat(65) })).toBe(false);
    expect(isWatchRunStep({ ...step, effort: "sprint" })).toBe(false);
    expect(isWatchRunStep({ ...step, haptic: "buzz" })).toBe(false);
    expect(isWatchRunStep({ ...step, remainingMeters: -1 })).toBe(false);
    expect(isWatchRunStep({ ...step, remainingSeconds: Infinity })).toBe(false);
    expect(isWatchRunStep({ ...step, progress: 1.2 })).toBe(false);
    expect(isWatchRunStep(null)).toBe(false);
  });
});
