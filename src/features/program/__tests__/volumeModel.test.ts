import { describe, it, expect } from "vitest";
import {
  weeklyVolumeByMuscle,
  volumeLandmark,
  classifyVolume,
  balanceWeeklyVolume,
  balancePushPull,
} from "../volumeModel";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function ex(overrides: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "X",
    exerciseId: "x",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

function day(
  exercises: ProgramExercise[],
  over: Partial<WorkoutDay> = {}
): WorkoutDay {
  return {
    dayName: "D",
    dayType: "upper",
    completed: false,
    exercises,
    ...over,
  };
}

describe("weeklyVolumeByMuscle", () => {
  it("counts primary 1.0 and each secondary 0.5 (fractional volume)", () => {
    // bench-press: Pectorals (primary) + Triceps, Front Delts (secondary)
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })]),
    ]);
    const get = (m: string) => v.find((x) => x.muscle === m)?.sets;
    expect(get("Chest")).toBe(4); // primary 4 × 1.0
    expect(get("Triceps")).toBe(2); // secondary 4 × 0.5
    expect(get("Shoulders")).toBe(2); // Front Delts → Shoulders, 4 × 0.5
  });

  it("sums across days and exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
      day([ex({ exerciseId: "bench-press", sets: 3 })]),
    ]);
    expect(v.find((x) => x.muscle === "Chest")?.sets).toBe(6);
  });

  it("excludes skipped days (no stimulus)", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 4 })], { skipped: true }),
    ]);
    expect(v).toEqual([]);
  });

  it("ignores zero-set and non-positive entries", () => {
    const v = weeklyVolumeByMuscle([
      day([ex({ exerciseId: "bench-press", sets: 0 })]),
    ]);
    expect(v).toEqual([]);
  });

  it("falls back to movement category for custom (non-DB) exercises", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({
          exerciseId: "my-custom-lift",
          movementCategory: "knee_dominant",
          sets: 5,
        }),
      ]),
    ]);
    expect(v.find((x) => x.muscle === "Quads")?.sets).toBe(5);
  });

  it("returns muscles in canonical display order", () => {
    const v = weeklyVolumeByMuscle([
      day([
        ex({ exerciseId: "bench-press", sets: 3 }), // Chest, Triceps, Shoulders
      ]),
    ]);
    const order = v.map((x) => x.muscle);
    // Chest before Shoulders before Triceps per CANONICAL_MUSCLE_ORDER
    expect(order.indexOf("Chest")).toBeLessThan(order.indexOf("Shoulders"));
    expect(order.indexOf("Shoulders")).toBeLessThan(order.indexOf("Triceps"));
  });
});

describe("balanceWeeklyVolume (D-LIFT-1 active)", () => {
  const hyper = volumeLandmark("hypertrophy"); // low 12, high 20

  it("grows an under-dosed muscle's accessory toward the landmark (capped)", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          // main back row — untouched
          ex({
            exerciseId: "custom-row",
            movementCategory: "horizontal_pull",
            sets: 4,
            isAccessory: false,
          }),
          // biceps accessory, badly under-dosed (2 sets vs low 12)
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 2,
            isAccessory: true,
          }),
        ]),
      ],
      hyper
    );
    const exs = out[0].exercises;
    expect(exs[0].sets).toBe(4); // main untouched
    expect(exs[1].sets).toBe(5); // accessory grown 2 → ACCESSORY_SET_CAP (5)
  });

  it("never touches main lifts", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 3,
            isAccessory: false, // a MAIN biceps lift
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(3); // unchanged despite under-dosed
  });

  it("leaves legacy exercises (no isAccessory flag) unchanged", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 2,
            // isAccessory undefined (legacy)
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(2);
  });

  it("does not grow a muscle already at/above the landmark low", () => {
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "custom-curl",
            movementCategory: "arms_biceps",
            sets: 13, // already ≥ low (12)
            isAccessory: true,
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(13); // add-only; nothing to do
  });

  it("declines an add whose cost lands on a muscle already at its ceiling", () => {
    // The balancers were add-only with no ceiling at all, so chasing one
    // under-dosed muscle up to MEV freely pushed the muscles that SHARE the
    // exercise past MRV — a 2026-07-28 audit measured generated weeks
    // violating both landmarks at once (Back = 39 against a high of 20 while
    // hamstrings sat at 11 against a low of 12).
    //
    // A hip thrust is Glutes-primary with Hamstrings secondary (0.5/set), so
    // topping up under-dosed glutes also spends hamstring volume — and here
    // the hamstrings are already at the ceiling.
    const atCeiling = () =>
      ex({
        exerciseId: "seated-leg-curl", // Hamstrings 1.0/set
        movementCategory: "hip_dominant",
        sets: 19, // with the hip thrust's 0.5/set this puts Hamstrings AT 20
        isAccessory: false, // a main, so the balancer can't grow it
      });
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "hip-thrust",
            movementCategory: "hip_dominant",
            sets: 2, // Glutes = 2, far under the low of 12
            isAccessory: true,
          }),
          atCeiling(),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBe(2); // add declined
  });

  it("still grows when the cost lands somewhere with room", () => {
    // The guard must not become a blanket freeze — the identical shape with
    // the hamstrings nowhere near their ceiling still gets the glute top-up.
    const out = balanceWeeklyVolume(
      [
        day([
          ex({
            exerciseId: "hip-thrust",
            movementCategory: "hip_dominant",
            sets: 2,
            isAccessory: true,
          }),
          ex({
            exerciseId: "seated-leg-curl",
            movementCategory: "hip_dominant",
            sets: 4,
            isAccessory: false,
          }),
        ]),
      ],
      hyper
    );
    expect(out[0].exercises[0].sets).toBeGreaterThan(2);
  });

  it("does not mutate the input workouts", () => {
    const input = [
      day([
        ex({
          exerciseId: "custom-curl",
          movementCategory: "arms_biceps",
          sets: 2,
          isAccessory: true,
        }),
      ]),
    ];
    balanceWeeklyVolume(input, hyper);
    expect(input[0].exercises[0].sets).toBe(2); // original untouched
  });
});

describe("balancePushPull (D-LIFT-3)", () => {
  it("grows pull accessories until pull ≥ push when push-dominant", () => {
    const out = balancePushPull([
      day([
        // push: bench main 5 + triceps accessory 3 = 8 push
        ex({
          movementCategory: "horizontal_push",
          sets: 5,
          isAccessory: false,
        }),
        ex({ movementCategory: "arms_triceps", sets: 3, isAccessory: true }),
        // pull: row main 4 = 4 pull (under push)
        ex({
          movementCategory: "horizontal_pull",
          sets: 4,
          isAccessory: false,
        }),
        // pull accessory to grow
        ex({ movementCategory: "arms_biceps", sets: 2, isAccessory: true }),
      ]),
    ]);
    const sets = (cat: string) =>
      out[0].exercises
        .filter((e) => e.movementCategory === cat)
        .reduce((s, e) => s + e.sets, 0);
    const push = sets("horizontal_push") + sets("arms_triceps");
    const pull = sets("horizontal_pull") + sets("arms_biceps");
    expect(pull).toBeGreaterThanOrEqual(push);
    // mains untouched
    expect(
      out[0].exercises.find(
        (e) => e.movementCategory === "horizontal_pull" && !e.isAccessory
      )?.sets
    ).toBe(4);
  });

  it("does nothing when pull already ≥ push", () => {
    const input = [
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 3,
          isAccessory: false,
        }),
        ex({ movementCategory: "horizontal_pull", sets: 4, isAccessory: true }),
      ]),
    ];
    const out = balancePushPull(input);
    expect(out[0].exercises[1].sets).toBe(4); // untouched
  });

  it("never touches main lifts (only pull accessories grow)", () => {
    const out = balancePushPull([
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 8,
          isAccessory: false,
        }),
        // only pull is a MAIN — cannot grow it
        ex({
          movementCategory: "horizontal_pull",
          sets: 3,
          isAccessory: false,
        }),
      ]),
    ]);
    expect(out[0].exercises[1].sets).toBe(3); // main pull unchanged despite imbalance
  });

  it("does not mutate the input", () => {
    const input = [
      day([
        ex({
          movementCategory: "horizontal_push",
          sets: 6,
          isAccessory: false,
        }),
        ex({ movementCategory: "arms_biceps", sets: 2, isAccessory: true }),
      ]),
    ];
    balancePushPull(input);
    expect(input[0].exercises[1].sets).toBe(2);
  });
});

describe("volumeLandmark + classifyVolume", () => {
  it("hypertrophy carries the highest target band", () => {
    expect(volumeLandmark("hypertrophy")).toEqual({ low: 12, high: 20 });
    expect(volumeLandmark("strength")).toEqual({ low: 8, high: 14 });
  });

  it("classifies under / optimal / high against the band", () => {
    const lm = volumeLandmark("hypertrophy"); // 12..20
    expect(classifyVolume(8, lm)).toBe("low");
    expect(classifyVolume(14, lm)).toBe("optimal");
    expect(classifyVolume(24, lm)).toBe("high");
    expect(classifyVolume(12, lm)).toBe("optimal"); // inclusive low
    expect(classifyVolume(20, lm)).toBe("optimal"); // inclusive high
  });
});
