import { describe, it, expect } from "vitest";

import {
  parseTemplateReps,
  templateExToProgEx,
  templateProgressionFor,
} from "@/features/program/templateConversion";
import type { TemplateExercise } from "@/features/program/templates";
import { applyProgression } from "@/features/program/programEngine";

/**
 * Template → program boundary (training-book backlog P1). This seam was
 * lossy in four ways before extraction; each loss gets a pin here so it
 * can't silently return.
 */

function te(overrides: Partial<TemplateExercise> = {}): TemplateExercise {
  return {
    name: "Barbell Bench Press",
    exerciseId: "bench-press",
    sets: 3,
    reps: "8-12",
    restSeconds: 120,
    ...overrides,
  };
}

describe("parseTemplateReps", () => {
  it("parses a rep range into floor + ceiling", () => {
    expect(parseTemplateReps("8-12")).toEqual({ reps: 8, repRangeMax: 12 });
    expect(parseTemplateReps("6 - 8")).toEqual({ reps: 6, repRangeMax: 8 });
  });

  it("parses a plain number with no range", () => {
    expect(parseTemplateReps("10")).toEqual({ reps: 10 });
  });

  it("keeps legacy behaviour for duration/format strings — no fabricated range", () => {
    // "30-45s" must NOT become a rep range of 30-45: time progression is a
    // separate backlog item. parseInt legacy: 30.
    expect(parseTemplateReps("30-45s")).toEqual({ reps: 30 });
    expect(parseTemplateReps("10/leg")).toEqual({ reps: 10 });
  });

  it("falls back to 8 for unparseable strings", () => {
    expect(parseTemplateReps("AMRAP")).toEqual({ reps: 8 });
  });

  it("ignores a degenerate range (hi <= lo)", () => {
    expect(parseTemplateReps("8-8")).toEqual({ reps: 8 });
  });
});

describe("templateProgressionFor", () => {
  it("maps template goals to the goal profile's main progression", () => {
    expect(templateProgressionFor("hypertrophy")).toBe("double");
    expect(templateProgressionFor("general")).toBe("double");
    expect(templateProgressionFor("strength")).toBe("linear");
    expect(templateProgressionFor("fat_loss")).toBe("linear");
  });

  it("defaults unknown goals to the general profile", () => {
    expect(templateProgressionFor("unknown-goal")).toBe("double");
  });
});

describe("templateExToProgEx", () => {
  it("carries the four previously-lost fields", () => {
    const ex = templateExToProgEx(te(), "double");
    // 1. Rep range survives (was: parseInt collapsed "8-12" to 8, no ceiling)
    expect(ex.reps).toBe(8);
    expect(ex.repRangeMax).toBe(12);
    expect(ex.baseReps).toBe(8);
    // 2. restSeconds survives (was: dropped entirely)
    expect(ex.restSeconds).toBe(120);
    // 3. progressionType from goal (was: hardcoded "linear")
    expect(ex.progressionType).toBe("double");
    // 4. isAccessory set explicitly (was: never set)
    expect(ex.isAccessory).toBe(false);
  });

  it("marks authored accessories and keeps them on linear progression", () => {
    const ex = templateExToProgEx(
      te({
        name: "Lateral Raise",
        exerciseId: "lateral-raise",
        isAccessory: true,
        reps: "12-15",
      }),
      "double"
    );
    expect(ex.isAccessory).toBe(true);
    // Parity with makeAccessory in programEngine — isolations move to double
    // progression only when backlog item #7 lands on both paths.
    expect(ex.progressionType).toBe("linear");
  });

  it("omits repRangeMax rather than writing undefined (Firestore rejects undefined)", () => {
    const ex = templateExToProgEx(te({ reps: "10" }), "double");
    expect("repRangeMax" in ex).toBe(false);
  });

  it("still carries notes", () => {
    const ex = templateExToProgEx(te({ notes: "swapped for knee" }), "linear");
    expect(ex.notes).toBe("swapped for knee");
  });

  it("produces an exercise the progression engine climbs through the range", () => {
    // End-to-end: a converted 8-12 exercise should climb its rep target, and
    // only add load at the ceiling. Calibrate a weight first (weight 0 skips
    // progression as uncalibrated).
    let ex = { ...templateExToProgEx(te(), "double"), weight: 60 };

    // Complete at the floor target → target climbs to 9, weight held.
    ex = applyProgression(ex, 8, 60, "recomp", false);
    expect(ex.reps).toBe(9);
    expect(ex.weight).toBe(60);

    // Overshoot to 11 → target jumps to 12 (actual + 1, capped), weight held.
    ex = applyProgression(ex, 11, 60, "recomp", false);
    expect(ex.reps).toBe(12);
    expect(ex.weight).toBe(60);

    // Hit the ceiling → load rises, target resets to the floor.
    ex = applyProgression(ex, 12, 60, "recomp", false);
    expect(ex.weight).toBe(62.5);
    expect(ex.reps).toBe(8);
  });

  it("holds the range climb at RPE >= 9.5", () => {
    let ex = { ...templateExToProgEx(te(), "double"), weight: 60 };
    ex = applyProgression(ex, 8, 60, "recomp", false, 9.5);
    expect(ex.reps).toBe(8); // held — no climb on a near-maximal set
    expect(ex.weight).toBe(60);
  });
});
