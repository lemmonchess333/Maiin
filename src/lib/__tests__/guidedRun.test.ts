import { describe, it, expect } from "vitest";
import {
  auditGuidedWorkouts,
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

  it("segment durations sum exactly to totalMinutes * 60", () => {
    for (const workout of GUIDED_WORKOUTS) {
      const sum = workout.segments.reduce(
        (acc, s) => acc + s.durationSeconds,
        0
      );
      const expected = workout.totalMinutes * 60;
      expect(sum).toBe(expected);
    }
  });

  it("passes a strict metadata integrity audit", () => {
    const issues = auditGuidedWorkouts(GUIDED_WORKOUTS);
    expect(issues).toEqual([]);
  });
});

describe("auditGuidedWorkouts", () => {
  it("reports invalid programme issues with actionable codes", () => {
    const issues = auditGuidedWorkouts([
      {
        id: "dup",
        name: "Broken 1",
        description: "Broken",
        totalMinutes: 1,
        difficulty: "easy",
        color: "#fff",
        segments: [],
      },
      {
        id: "dup",
        name: "Broken 2",
        description: "Broken",
        totalMinutes: 1,
        difficulty: "hard",
        color: "#000",
        segments: [
          { type: "hard", durationSeconds: 0, label: " ", instruction: "" },
        ],
      },
    ]);

    expect(issues.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "segment_missing",
        "segment_duration_non_positive",
        "segment_label_blank",
        "segment_instruction_blank",
        "total_duration_mismatch",
        "workout_id_duplicate",
      ])
    );
  });
});
