import { describe, it, expect } from "vitest";
import { inferMovementCategory, movementCategoryLabel } from "../exerciseMovementCategory";

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

describe("movementCategoryLabel", function () {
  /* Activity-feed chips display these labels next to the workout title.
     The taxonomy is deliberately session-level (Push/Pull/Legs/Arms/Core)
     so a "Bench Press" workout doesn't get a "Bench" chip that just
     restates the exercise name. */
  it("collapses horizontal/vertical push into 'Push'", function () {
    expect(movementCategoryLabel("horizontal_push")).toBe("Push");
    expect(movementCategoryLabel("vertical_push")).toBe("Push");
  });

  it("collapses horizontal/vertical pull into 'Pull'", function () {
    expect(movementCategoryLabel("horizontal_pull")).toBe("Pull");
    expect(movementCategoryLabel("vertical_pull")).toBe("Pull");
  });

  it("collapses knee/hip dominant into 'Legs'", function () {
    expect(movementCategoryLabel("knee_dominant")).toBe("Legs");
    expect(movementCategoryLabel("hip_dominant")).toBe("Legs");
  });

  it("collapses biceps/triceps into 'Arms'", function () {
    expect(movementCategoryLabel("arms_biceps")).toBe("Arms");
    expect(movementCategoryLabel("arms_triceps")).toBe("Arms");
  });

  it("keeps Core as its own label", function () {
    expect(movementCategoryLabel("core")).toBe("Core");
  });

  it("falls back to title-case for unknown keys rather than throwing", function () {
    expect(movementCategoryLabel("brand_new_pattern")).toBe("Brand New Pattern");
  });
});
