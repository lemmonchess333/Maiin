import { describe, it, expect } from "vitest";
import {
  startingWeightForCategory,
  seedStartingLoads,
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "../startingLoads";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

const ctx = (over: Partial<StartingLoadContext> = {}): StartingLoadContext => ({
  bodyweightKg: 80,
  experience: "beginner",
  ...over,
});

function ex(over: Partial<ProgramExercise>): ProgramExercise {
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
    isAccessory: false,
    ...over,
  };
}

const day = (exercises: ProgramExercise[]): WorkoutDay => ({
  dayName: "D",
  dayType: "full_body",
  completed: false,
  exercises,
});

describe("startingWeightForCategory", () => {
  it("scales with bodyweight × experience, rounded to 2.5kg", () => {
    // 80kg beginner bench: 80 × 0.45 = 36 → 35
    expect(startingWeightForCategory("horizontal_push", ctx())).toBe(35);
    // intermediate: 80 × 0.7 = 56 → 55
    expect(
      startingWeightForCategory(
        "horizontal_push",
        ctx({ experience: "intermediate" })
      )
    ).toBe(55);
    // beginner squat: 80 × 0.7 = 56 → 55
    expect(startingWeightForCategory("knee_dominant", ctx())).toBe(55);
  });

  // vertical_pull and core used to be pinned at 0 here, which is what let the
  // 0 kg lat-pulldown ship: the category seed is the ONLY input
  // `startingWeightForExercise` has, and a 0 short-circuits it before any
  // per-exercise loadFactor applies. Zeroing is the per-EXERCISE guards' job,
  // pinned in the sibling describe below.
  it("seeds the loaded members of pull/core patterns", () => {
    // 80 × 0.75 = 60 — the notional full-range vertical pull.
    expect(startingWeightForCategory("vertical_pull", ctx())).toBe(60);
    // 80 × 0.35 = 28 → 27.5 — anchored on cable crunch.
    expect(startingWeightForCategory("core", ctx())).toBe(27.5);
  });

  it("applies a lower factor for female lifters", () => {
    // 80 × 0.45 × 0.75 = 27 → 27.5
    expect(
      startingWeightForCategory("horizontal_push", ctx({ sex: "female" }))
    ).toBe(27.5);
  });

  it("returns 0 when bodyweight is missing/invalid", () => {
    expect(
      startingWeightForCategory("knee_dominant", ctx({ bodyweightKg: 0 }))
    ).toBe(0);
    expect(
      startingWeightForCategory("knee_dominant", ctx({ bodyweightKg: NaN }))
    ).toBe(0);
  });
});

describe("weightAfterExerciseSwap", () => {
  it("seeds a loaded target when the source was bodyweight", () => {
    const swapped = weightAfterExerciseSwap(
      ex({
        exerciseId: "push-ups",
        movementCategory: "horizontal_push",
        weight: 0,
      }),
      "db-bench",
      ctx()
    );
    expect(swapped.weight).toBeGreaterThan(0);
    expect(swapped.movementCategory).toBe("horizontal_push");
  });

  it("uses the target category for a cross-category injury substitution", () => {
    const swapped = weightAfterExerciseSwap(
      ex({
        exerciseId: "deadlift",
        movementCategory: "hip_dominant",
        weight: 120,
      }),
      "incline-db-press",
      ctx()
    );
    expect(swapped.movementCategory).toBe("horizontal_push");
    expect(swapped.weight).toBeGreaterThan(0);
    expect(swapped.weight).toBeLessThan(120);
  });

  it("infers the target category for catalog exercises outside the variation bank", () => {
    const swapped = weightAfterExerciseSwap(
      ex({
        exerciseId: "bench-press",
        movementCategory: "horizontal_push",
        weight: 100,
      }),
      "leg-extension",
      ctx()
    );
    expect(swapped.movementCategory).toBe("knee_dominant");
    expect(swapped.weight).toBeGreaterThan(0);
  });

  it("drops kilograms when the target is bodyweight", () => {
    const swapped = weightAfterExerciseSwap(
      ex({
        exerciseId: "deadlift",
        movementCategory: "hip_dominant",
        weight: 120,
      }),
      "glute-bridge",
      ctx()
    );
    expect(swapped.weight).toBe(0);
  });

  // The shipped defect: this is the exact swap the shoulder-injury filter
  // performs, and it landed at 0 kg — "Lat Pulldown 4×8 @ 0 kg" — because
  // rescaleForSwap(0, …) is 0 and the vertical_pull category seed was 0 too,
  // so there was nothing left to fall back to.
  it("seeds a loaded lat pulldown swapped in for pull-ups", () => {
    const swapped = weightAfterExerciseSwap(
      ex({
        exerciseId: "pull-ups",
        movementCategory: "vertical_pull",
        weight: 0,
      }),
      "lat-pulldown",
      ctx()
    );
    expect(swapped.movementCategory).toBe("vertical_pull");
    // 80 × 0.75 = 60 base, × 0.6 lat-pulldown loadFactor = 36 → 35.
    expect(swapped.weight).toBe(35);
  });

  // The other half of the same fix: opening the category seed must not start
  // handing kilograms to the members that really are bodyweight. Each is
  // guarded differently, so each is pinned.
  it("keeps the bodyweight members of an opened category at 0 kg", () => {
    const from = ex({
      exerciseId: "lat-pulldown",
      movementCategory: "vertical_pull",
      weight: 40,
    });
    // catalog equipment "Bodyweight" → BODYWEIGHT_IDS
    expect(weightAfterExerciseSwap(from, "chin-ups", ctx()).weight).toBe(0);
    // core: catalog bodyweight
    const core = ex({
      exerciseId: "cable-crunch",
      movementCategory: "core",
      weight: 30,
    });
    expect(weightAfterExerciseSwap(core, "leg-raise", ctx()).weight).toBe(0);
    // core: not catalog-bodyweight ("Ab Wheel"), zeroed by loadFactor: 0
    expect(weightAfterExerciseSwap(core, "ab-wheel", ctx()).weight).toBe(0);
  });
});

describe("seedStartingLoads", () => {
  it("calibrates an untrained loaded template row that starts at 0 kg", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            exerciseId: "bench-press",
            movementCategory: "horizontal_push",
            weight: 0,
            lastSuccessfulWeight: 0,
            lastAttemptedWeight: 0,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(35);
  });

  it("reweights untrained MAIN lifts to the bodyweight-relative seed", () => {
    const out = seedStartingLoads(
      [day([ex({ movementCategory: "knee_dominant", weight: 80 })])],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(55); // 80 × 0.7 → 55
    expect(out[0].exercises[0].lastSuccessfulWeight).toBe(55);
  });

  // CORRECTED 2026-07-28. This used to assert "never touches accessories".
  // That skip is what silently disabled cold-start seeding for the whole
  // full-body segment the moment backlog #15 marked its slots 2-4 as
  // accessories: the same 80 kg beginner was prescribed Bench Press at 35 kg
  // as a main and 60 kg as an accessory, in the same week.
  it("seeds accessories too — the flag is a volume role, not a load claim", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            exerciseId: "squat",
            movementCategory: "knee_dominant",
            weight: 80,
            isAccessory: true,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(55); // same seed a main would get
  });

  it("scales the seed to the VARIATION, not just the category", () => {
    // The reason seeding accessories is safe. A leg curl and a deadlift are
    // both hip_dominant; without the per-exercise factor the leg curl would
    // be seeded at the deadlift's 68 kg.
    const out = seedStartingLoads(
      [
        day([
          ex({
            exerciseId: "deadlift",
            movementCategory: "hip_dominant",
            weight: 80,
          }),
          ex({
            exerciseId: "seated-leg-curl",
            movementCategory: "hip_dominant",
            weight: 80,
            isAccessory: true,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(67.5); // 80 × 0.85
    expect(out[0].exercises[1].weight).toBe(17.5); // × 0.25 → 17.5
  });

  it("leaves a catalog bodyweight lift as bodyweight even in a loaded category", () => {
    // Chin-ups are vertical_pull like a lat pulldown; the catalog's
    // `equipment: "Bodyweight"` is what decides, not the category.
    const out = seedStartingLoads(
      [
        day([
          ex({
            exerciseId: "chin-ups",
            movementCategory: "knee_dominant", // deliberately a loaded category
            weight: 40,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(40); // untouched
  });

  it("never touches a lift with logged history (keeps progressed weight)", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 100,
            performanceHistory: [
              {
                date: "2026-01-01",
                weight: 100,
                repsCompleted: 5,
                repsTarget: 5,
              },
            ],
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(100); // history → untouched
  });

  // This used to pass with a placeholder `exerciseId: "x"`, which made it a
  // test of the vertical_pull CATEGORY seed being 0 rather than of the lift
  // being bodyweight — the exact conflation that shipped the 0 kg lat
  // pulldown. Pinned on a real bodyweight id, it tests what it claims: the
  // loaded members of the same category are seeded in the case below.
  it("leaves bodyweight lifts (weight 0) as bodyweight", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            exerciseId: "pull-ups",
            movementCategory: "vertical_pull",
            weight: 0,
          }),
          ex({
            exerciseId: "lat-pulldown",
            movementCategory: "vertical_pull",
            weight: 0,
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(0);
    expect(out[0].exercises[1].weight).toBe(35);
  });

  it("does not mutate the input", () => {
    const input = [
      day([ex({ movementCategory: "knee_dominant", weight: 80 })]),
    ];
    seedStartingLoads(input, ctx());
    expect(input[0].exercises[0].weight).toBe(80);
  });
});
