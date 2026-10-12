/**
 * Pgm5 equipment follow-up — applyEquipmentFilterToWorkouts.
 *
 * In-place equipment-aware re-pick. Pins: full_gym no-op; a Barbell exercise
 * is swapped to a same-category Dumbbells/Bodyweight option at home_gym
 * (carrying weight/history); an already-available exercise is kept; unknown
 * ids are left untouched; structure (day + exercise counts) preserved.
 *
 * Fixtures use real bank ids: "bench-press" (Barbell, horizontal_push) has a
 * "db-bench" (Dumbbells) category-mate; "db-row" (Dumbbells) is already fine.
 */
import { describe, it, expect } from "vitest";
import { rescaleForSwap } from "@/features/program/variationBank";
import { applyEquipmentFilterToWorkouts } from "../matchTemplate";
import { getExerciseById } from "@/lib/exercises";
import type {
  WorkoutDay,
  ProgramExercise,
  MovementCategory,
} from "../programTypes";

function ex(
  exerciseId: string,
  name: string,
  movementCategory: MovementCategory,
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name,
    exerciseId,
    movementCategory,
    sets: 4,
    reps: 8,
    baseReps: 8,
    weight: 100,
    progressionType: "linear",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}
const day = (exercises: ProgramExercise[]): WorkoutDay => ({
  dayName: "Push",
  dayType: "push",
  completed: false,
  exercises,
});

const HOME_OK = new Set(["Dumbbells", "Bodyweight", "Kettlebell"]);

describe("applyEquipmentFilterToWorkouts", () => {
  it("full_gym is a no-op (barbell exercise kept)", () => {
    const w = [day([ex("bench-press", "Bench Press", "horizontal_push")])];
    const out = applyEquipmentFilterToWorkouts(w, "full_gym");
    expect(out[0].exercises[0].exerciseId).toBe("bench-press");
  });

  it("swaps a Barbell exercise to an available category-mate at home_gym, RESCALING the load", () => {
    const w = [
      day([
        ex("bench-press", "Bench Press", "horizontal_push", { weight: 80 }),
      ]),
    ];
    const out = applyEquipmentFilterToWorkouts(w, "home_gym");
    const swapped = out[0].exercises[0];
    expect(swapped.exerciseId).not.toBe("bench-press"); // barbell removed
    expect(HOME_OK.has(getExerciseById(swapped.exerciseId)!.equipment)).toBe(
      true
    );
    // CORRECTED 2026-07-28: this asserted `toBe(80)` — "load carried". A
    // swap changes the MOVEMENT, and 80 kg of barbell bench is not 80 kg of
    // per-hand dumbbell press. Measured on a real plan, carrying it verbatim
    // handed an 80 kg beginner a 35 kg dumbbell press and a 55 kg Bulgarian
    // split squat. The load is now rescaled by the two variations' load
    // factors, so it must be LOWER here and derived, not equal.
    expect(swapped.weight).toBe(
      rescaleForSwap(80, "bench-press", swapped.exerciseId, "horizontal_push")
    );
    expect(swapped.weight).toBeLessThan(80);
    expect(swapped.notes).toMatch(/not available with your equipment/i);
  });

  it("carries no load onto a bodyweight lift it swaps in at home_gym", () => {
    // A home gym has no cable stack, so the lat pulldown becomes a pull-up.
    // Scaled as a full-weight lift, 45 kg arrived as 75 kg of added load.
    const w = [
      day([
        ex("lat-pulldown", "Lat Pulldown", "vertical_pull", { weight: 45 }),
      ]),
    ];
    const swapped = applyEquipmentFilterToWorkouts(w, "home_gym")[0]
      .exercises[0];
    expect(getExerciseById(swapped.exerciseId)!.equipment).toBe("Bodyweight");
    expect(swapped.weight).toBe(0);
  });

  it("keeps an already-available exercise (Dumbbells at home_gym)", () => {
    const w = [day([ex("db-row", "Dumbbell Row", "horizontal_pull")])];
    const out = applyEquipmentFilterToWorkouts(w, "home_gym");
    expect(out[0].exercises[0].exerciseId).toBe("db-row");
  });

  it("leaves an unknown/custom exercise id untouched", () => {
    const w = [day([ex("user-custom-thing", "Custom", "horizontal_push")])];
    const out = applyEquipmentFilterToWorkouts(w, "minimal");
    expect(out[0].exercises[0].exerciseId).toBe("user-custom-thing");
  });

  it("preserves day + exercise counts (structure)", () => {
    const w = [
      day([
        ex("bench-press", "Bench Press", "horizontal_push"),
        ex("db-row", "Dumbbell Row", "horizontal_pull"),
      ]),
    ];
    const out = applyEquipmentFilterToWorkouts(w, "minimal");
    expect(out).toHaveLength(1);
    expect(out[0].exercises).toHaveLength(2);
  });
});

describe("applyEquipmentFilterToWorkouts — no lift a third day in the week", () => {
  /** A week of one-lift days. */
  const week = (...lifts: ProgramExercise[]): WorkoutDay[] =>
    lifts.map((lift, i) => ({ ...day([lift]), dayName: `Day ${i + 1}` }));
  const liftsOf = (workouts: WorkoutDay[]) =>
    workouts.flatMap((d) => d.exercises.map((e) => e.exerciseId));
  const squat = (isAccessory = false) =>
    ex("squat", "Barbell Squat", "knee_dominant", { isAccessory });
  const deadlift = () => ex("deadlift", "Deadlift", "hip_dominant");
  const legCurl = () =>
    ex("seated-leg-curl", "Seated Leg Curl", "hip_dominant", {
      isAccessory: true,
    });

  it("two swaps don't land on a lift the week can take once more", () => {
    // Both squats become goblet squats, so the leg press takes the next
    // squat a beginner can do at home.
    const out = applyEquipmentFilterToWorkouts(
      week(
        squat(),
        squat(true),
        ex("leg-press", "Leg Press", "knee_dominant", { isAccessory: true })
      ),
      "home_gym",
      [],
      "beginner"
    );
    expect(liftsOf(out)).toEqual([
      "goblet-squat",
      "goblet-squat",
      "bodyweight-squat",
    ]);
  });

  it("gives the main lifts the first choice, wherever the supporting slot sits", () => {
    // The leg curl comes first in the week, and still gives way.
    const out = applyEquipmentFilterToWorkouts(
      week(legCurl(), deadlift(), deadlift()),
      "home_gym",
      [],
      "beginner"
    );
    expect(liftsOf(out)).toEqual(["glute-bridge", "db-rdl", "db-rdl"]);
  });

  it("counts the lifts the week keeps", () => {
    // With a barbell at home the deadlift stays on its two days, so the
    // leg curl doesn't become a third.
    const out = applyEquipmentFilterToWorkouts(
      week(legCurl(), deadlift(), deadlift()),
      "home_gym",
      [],
      "beginner",
      undefined,
      true
    );
    expect(liftsOf(out)).toEqual(["hip-thrust", "deadlift", "deadlift"]);
  });

  it("ranks the level gate above the cap", () => {
    // Five leg curls with minimal kit: the dumbbell RDL twice, the glute
    // bridge twice, and then a beginner gets the RDL a third time rather
    // than the Nordic curl, which is above their level. An intermediate
    // gets the Nordic curl.
    const curls = week(legCurl(), legCurl(), legCurl(), legCurl(), legCurl());
    expect(
      liftsOf(applyEquipmentFilterToWorkouts(curls, "minimal", [], "beginner"))
    ).toEqual(["db-rdl", "db-rdl", "glute-bridge", "glute-bridge", "db-rdl"]);
    expect(
      liftsOf(
        applyEquipmentFilterToWorkouts(curls, "minimal", [], "intermediate")
      )
    ).toEqual([
      "db-rdl",
      "db-rdl",
      "glute-bridge",
      "glute-bridge",
      "nordic-hamstring-curl",
    ]);
  });
});
