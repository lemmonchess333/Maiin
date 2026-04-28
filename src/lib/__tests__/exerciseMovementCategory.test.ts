import { describe, it, expect } from "vitest";
import { inferMovementCategory } from "../exerciseMovementCategory";

describe("inferMovementCategory", function () {
  it("classifies Pull A's exercises correctly (regression for activity-card horizontal_push bug)", function () {
    expect(inferMovementCategory("Deadlift", "deadlift")).toBe("hip_dominant");
    expect(inferMovementCategory("Pull-Ups", "pull-ups")).toBe("vertical_pull");
    expect(inferMovementCategory("Barbell Row", "barbell-row")).toBe("horizontal_pull");
    expect(inferMovementCategory("Face Pulls", "face-pulls")).toBe("horizontal_pull");
    expect(inferMovementCategory("Barbell Curl", "barbell-curl")).toBe("arms_biceps");
    expect(inferMovementCategory("Hammer Curl", "hammer-curl")).toBe("arms_biceps");
  });

  it("distinguishes vertical and horizontal push patterns", function () {
    expect(inferMovementCategory("Bench Press", "bench-press")).toBe("horizontal_push");
    expect(inferMovementCategory("Overhead Press", "overhead-press")).toBe("vertical_push");
    expect(inferMovementCategory("Push-Up", "push-up")).toBe("horizontal_push");
    expect(inferMovementCategory("Lateral Raise", "lateral-raise")).toBe("vertical_push");
  });

  it("classifies leg exercises as knee or hip dominant correctly", function () {
    expect(inferMovementCategory("Barbell Squat", "squat")).toBe("knee_dominant");
    expect(inferMovementCategory("Bulgarian Split Squat", "split-squat")).toBe("knee_dominant");
    expect(inferMovementCategory("Romanian Deadlift", "romanian-deadlift")).toBe("hip_dominant");
    expect(inferMovementCategory("Hip Thrust", "hip-thrust")).toBe("hip_dominant");
    expect(inferMovementCategory("Leg Press", "leg-press")).toBe("knee_dominant");
    expect(inferMovementCategory("Calf Raise", "calf-raise")).toBe("knee_dominant");
  });

  it("classifies tricep work distinctly from biceps", function () {
    expect(inferMovementCategory("Tricep Pushdown", "tricep-pushdown")).toBe("arms_triceps");
    expect(inferMovementCategory("Skullcrusher", "skullcrusher")).toBe("arms_triceps");
    expect(inferMovementCategory("Dumbbell Curl", "dumbbell-curl")).toBe("arms_biceps");
  });

  it("falls back to 'core' for unmatched names rather than mis-categorising", function () {
    // Deliberately gibberish so no rule matches — surfacing the
    // failure as 'core' is more honest than silently picking a wrong
    // push/pull bucket (the old default).
    expect(inferMovementCategory("Mystery Lift", "mystery-lift")).toBe("core");
    expect(inferMovementCategory("Plank", "plank")).toBe("core");
    expect(inferMovementCategory("Russian Twist", "russian-twist")).toBe("core");
  });

  it("matches case-insensitively and uses both name + id", function () {
    expect(inferMovementCategory("BARBELL ROW", "barbell-row")).toBe("horizontal_pull");
    expect(inferMovementCategory("Unknown", "deadlift")).toBe("hip_dominant");
  });
});
