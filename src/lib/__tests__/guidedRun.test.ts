import { describe, it, expect } from "vitest";
import {
  getSegmentColor,
  GUIDED_WORKOUTS,
  type SegmentType,
} from "@/lib/guidedRun";

describe("getSegmentColor", () => {
  it("returns correct color for each segment type", () => {
    const expected: Record<SegmentType, string> = {
      warmup: "#f59e0b",
      easy: "#22c55e",
      moderate: "#3b82f6",
      hard: "#ef4444",
      recovery: "#8b5cf6",
      cooldown: "#06b6d4",
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
