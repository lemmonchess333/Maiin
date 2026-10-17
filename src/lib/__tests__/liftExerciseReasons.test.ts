/**
 * Why each lift is in a session (owner, 2026-10-16: "Why this session"
 * said nothing about "the actual exercises").
 */
import { describe, it, expect } from "vitest";
import { liftExerciseReasons } from "../liftExerciseReasons";

const pullDay = [
  { exerciseId: "barbell-row", name: "Barbell Row", isAccessory: false },
  { exerciseId: "lat-pulldown", name: "Lat Pulldown", isAccessory: true },
  {
    exerciseId: "straight-arm-pulldown",
    name: "Straight-Arm Pulldown",
    isAccessory: true,
  },
  { exerciseId: "cable-curl", name: "Cable Curl", isAccessory: true },
];

describe("liftExerciseReasons", () => {
  it("names each lift's role and what it trains, in the session's order", () => {
    expect(liftExerciseReasons(pullDay)).toEqual([
      {
        name: "Barbell Row",
        role: "main",
        label: "Main lift",
        reason:
          "The lift this session is built around. Trains your lats, with your rhomboids and rear delts.",
      },
      {
        name: "Lat Pulldown",
        role: "compound",
        label: "Supporting lift",
        reason: "Trains your lats, with your biceps and rear delts.",
      },
      {
        name: "Straight-Arm Pulldown",
        role: "isolation",
        label: "Isolation",
        reason: "Trains your lats directly.",
      },
      {
        name: "Cable Curl",
        role: "isolation",
        label: "Isolation",
        reason:
          "Trains your biceps directly, which the Barbell Row works only in part.",
      },
    ]);
  });

  it("says when the session is built around more than one lift", () => {
    const [squat, bench] = liftExerciseReasons([
      { exerciseId: "squat", name: "Barbell Squat" },
      { exerciseId: "bench-press", name: "Bench Press" },
    ]);
    expect(squat.reason).toMatch(/^One of the two lifts this session is built around\./);
    // The catalogue's "Pectorals" is said the way a person says it.
    expect(bench.reason).toContain("Trains your chest, with your triceps and front delts.");
  });

  it("only credits a main lift with a muscle the catalogue lists for it", () => {
    // A push day: the bench press's others are triceps and front delts,
    // so a lateral raise's side delts are trained directly, with no claim.
    const [, raise] = liftExerciseReasons([
      { exerciseId: "bench-press", name: "Bench Press" },
      { exerciseId: "lateral-raise", name: "Lateral Raise", isAccessory: true },
    ]);
    expect(raise.reason).toBe("Trains your side delts directly.");
  });

  it("says what a swap put the lift in place of", () => {
    const [press] = liftExerciseReasons([
      {
        exerciseId: "leg-press",
        name: "Leg Press",
        swappedFrom: { exerciseId: "squat" },
      },
    ]);
    expect(press.reason).toBe(
      "The lift this session is built around. Trains your quads, with your glutes and hamstrings. In place of the Barbell Squat, which your equipment or an injury rules out."
    );
  });

  it("says nothing it cannot read for a lift the catalogue does not know", () => {
    const [own] = liftExerciseReasons([
      { exerciseId: "my-own-lift", name: "My Own Lift", isAccessory: true },
    ]);
    expect(own).toEqual({
      name: "My Own Lift",
      role: "compound",
      label: "Supporting lift",
      reason: "",
    });
  });
});
