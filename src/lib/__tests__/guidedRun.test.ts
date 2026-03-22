import { describe, it, expect } from "vitest";
import {
  getSegmentColor,
  GUIDED_WORKOUTS,
  type SegmentType,
} from "@/lib/guidedRun";

describe("getSegmentColor", () => {
  it("returns correct color for each segment type", () => {
    const expected: Record<SegmentType, string> = {
      warmup: "#e09510",
      easy: "#22b558",
      moderate: "#3b7ee6",
      hard: "#e04040",
      recovery: "#7B72E9",
      cooldown: "#06a8c8",
    };

    for (const [type, color] of Object.entries(expected)) {
      expect(getSegmentColor(type as SegmentType)).toBe(color);
    }
  });
});

describe("GUIDED_WORKOUTS", () => {
  it("has 3 workouts", () => {
    expect(GUIDED_WORKOUTS).toHaveLength(3);
  });

  it("each workout has non-empty segments", () => {
    for (const workout of GUIDED_WORKOUTS) {
      expect(workout.segments.length).toBeGreaterThan(0);
    }
  });

  it("segment durations sum to approximately totalMinutes * 60", () => {
    for (const workout of GUIDED_WORKOUTS) {
      const sum = workout.segments.reduce((acc, s) => acc + s.durationSeconds, 0);
      const expected = workout.totalMinutes * 60;
      // Allow up to 15% tolerance (some workouts have brief segments)
      expect(sum).toBeGreaterThanOrEqual(expected * 0.85);
      expect(sum).toBeLessThanOrEqual(expected * 1.15);
    }
  });
});
