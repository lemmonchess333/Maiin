import { describe, it, expect } from "vitest";
import { formatRepTarget } from "../repTarget";
import type { ProgramExercise } from "../programTypes";

describe("formatRepTarget — the range a lift climbs, or its fixed target (Lift4 (3))", () => {
  const ex = (o: Partial<ProgramExercise>) => o as ProgramExercise;

  it("shows a climbing lift's range from its bottom, wherever the target is", () => {
    const climbing = { progressionType: "double" as const, baseReps: 8 };
    expect(formatRepTarget(ex({ ...climbing, reps: 8, repRangeMax: 12 }))).toBe(
      "8–12"
    );
    expect(
      formatRepTarget(ex({ ...climbing, reps: 10, repRangeMax: 12 }))
    ).toBe("8–12");
  });

  it("shows a fixed target alone, even with a range stamped", () => {
    expect(formatRepTarget(ex({ reps: 5, baseReps: 5 }))).toBe("5");
    expect(
      formatRepTarget(
        ex({ reps: 5, baseReps: 5, repRangeMax: 7, progressionType: "linear" })
      )
    ).toBe("5");
  });

  it("shows how far a target has climbed past its range", () => {
    // The next weight was too big a step, so the reps climbed on.
    expect(
      formatRepTarget(
        ex({
          reps: 18,
          baseReps: 12,
          repRangeMax: 15,
          progressionType: "double",
        })
      )
    ).toBe("12–18");
    expect(
      formatRepTarget(ex({ reps: 8, baseReps: 5, progressionType: "linear" }))
    ).toBe("5–8");
  });

  it("shows a range-less climbing lift's own range", () => {
    expect(
      formatRepTarget(ex({ reps: 6, baseReps: 6, progressionType: "double" }))
    ).toBe("6–8");
  });

  it("shows seconds and the authored range for a hold", () => {
    expect(
      formatRepTarget(
        ex({
          reps: 30,
          baseReps: 30,
          repRangeMax: 45,
          repUnit: "seconds",
          progressionType: "double",
        })
      )
    ).toBe("30–45s");
  });

  it("shows a single duration when there is no range", () => {
    expect(formatRepTarget(ex({ reps: 45, repUnit: "seconds" }))).toBe("45s");
  });

  it("a plank no longer reads as thirty repetitions", () => {
    const plank = ex({
      exerciseId: "plank",
      reps: 30,
      baseReps: 30,
      repRangeMax: 45,
      repUnit: "seconds",
      progressionType: "double",
    });
    expect(formatRepTarget(plank)).toBe("30–45s");
  });
});
