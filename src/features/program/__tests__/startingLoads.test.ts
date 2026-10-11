import { describe, it, expect } from "vitest";
import {
  startingWeightForCategory,
  startingWeightForExercise,
  seedStartingLoads,
  weightAfterExerciseSwap,
  type StartingLoadContext,
} from "../startingLoads";
import { equipmentGridFor, loadGridFor } from "../loadSteps";
import { EXERCISES } from "@/lib/exercises";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
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
    // The category's primary, which the bank leaves unfactored, with profile
    // context (Replace, plan building) and without it (the week engine).
    expect(weightAfterExerciseSwap(from, "pull-ups", ctx()).weight).toBe(0);
    expect(weightAfterExerciseSwap(from, "pull-ups").weight).toBe(0);
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

  // The permanently-uncalibrated trap (2026-08-04). "Has history" was the
  // whole calibration test, so a slot that reached the user at 0 kg got
  // logged at 0 kg and then could never be repaired: history was non-empty,
  // so this pass skipped it forever. The operator's live plan showed the
  // endgame — a Barbell Curl and an Overhead Press prescribed at 0 kg, a
  // session totalling "0kg VOLUME", and a plateau modal reporting "you've
  // been at 0kg for 3 sessions". Zeroes in history are the sentinel repeated
  // back, not evidence of calibration.
  it("repairs a lift whose history is all zeroes — history alone isn't calibration", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 0,
            lastSuccessfulWeight: 0,
            lastAttemptedWeight: 0,
            performanceHistory: [
              {
                date: "2026-08-01",
                weight: 0,
                repsCompleted: 8,
                repsTarget: 8,
              },
              {
                date: "2026-08-02",
                weight: 0,
                repsCompleted: 8,
                repsTarget: 8,
              },
            ],
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(55);
  });

  it("never re-seeds a lift whose history carried real load", () => {
    // The counter-pin: the repair must not reach a calibrated lift, or it
    // would overwrite a user's actual working weight on every regenerate.
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 0,
            lastSuccessfulWeight: 0,
            lastAttemptedWeight: 0,
            performanceHistory: [
              {
                date: "2026-08-01",
                weight: 90,
                repsCompleted: 5,
                repsTarget: 5,
              },
            ],
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(0);
  });

  it("never re-seeds a lift that currently carries load", () => {
    const out = seedStartingLoads(
      [
        day([
          ex({
            movementCategory: "knee_dominant",
            weight: 100,
            performanceHistory: [
              {
                date: "2026-08-01",
                weight: 0,
                repsCompleted: 8,
                repsTarget: 8,
              },
            ],
          }),
        ]),
      ],
      ctx()
    );
    expect(out[0].exercises[0].weight).toBe(100);
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

/* Pgm8 L15: a barbell lift a plan is being built with, whose first weight
   would be under the 20 kg bar, is built as its dumbbell version where the
   bank has one, and starts at the bar where it hasn't. A lift the plan
   already has keeps its exercise and its weight (Lift4 (2), Pgm5). The
   simulator found the plans it fixes (F10): curls at 5–17.5 kg, skull
   crushers at 15–17.5 kg and a weak lifter's press at 12.5–15 kg. */
describe("a new lift under the bar (Pgm8 L15)", () => {
  // A 60 kg woman new to lifting: a 5 kg barbell curl (60 × 0.12 × 0.75 =
  // 5.4), a 12.5 kg press (60 × 0.3 × 0.75 = 13.5) and a 20 kg bench.
  const light = ctx({ bodyweightKg: 60, sex: "female" });
  const lift = (exerciseId: string, over: Partial<ProgramExercise> = {}) => {
    const catalogue = EXERCISES.find((e) => e.id === exerciseId);
    return ex({
      exerciseId,
      name: catalogue?.name ?? exerciseId,
      movementCategory: inferMovementCategory(
        catalogue?.name ?? exerciseId,
        exerciseId
      ),
      instanceId: `${exerciseId}-slot`,
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
      ...over,
    });
  };
  const curl = (over: Partial<ProgramExercise> = {}) =>
    lift("barbell-curl", { isAccessory: true, ...over });
  const build = (workouts: WorkoutDay[], building = {}) =>
    seedStartingLoads(workouts, light, 8, { building });

  it("builds a barbell curl under the bar as a dumbbell curl, on the rack", () => {
    const [built] = build([day([curl()])])[0].exercises;
    // The bank's dumbbell curl loads 0.4 of the category's barbell curl: 2 kg
    // a hand, a weight the rack has.
    expect(built).toMatchObject({
      exerciseId: "db-curl",
      name: "Dumbbell Curl",
      movementCategory: "arms_biceps",
      weight: 2,
      lastSuccessfulWeight: 2,
      lastAttemptedWeight: 2,
    });
  });

  it("builds a compound under the bar as its dumbbell version too", () => {
    const [press] = build([day([lift("overhead-press")])])[0].exercises;
    expect(press).toMatchObject({
      exerciseId: "db-shoulder-press",
      name: "Dumbbell Shoulder Press",
      movementCategory: "vertical_push",
      weight: 5,
    });
  });

  it("keeps the slot it fills: its place, numbers and role, with no way back", () => {
    const [built] = build([
      day([
        curl({
          sets: 2,
          reps: 10,
          baseReps: 10,
          repRangeMax: 15,
          progressionType: "double",
          performanceHistory: [
            {
              date: "2026-10-01",
              weight: 0,
              repsCompleted: 10,
              repsTarget: 10,
            },
          ],
        }),
      ]),
    ])[0].exercises;
    expect(built).toMatchObject({
      exerciseId: "db-curl",
      instanceId: "barbell-curl-slot",
      sets: 2,
      reps: 10,
      baseReps: 10,
      repRangeMax: 15,
      progressionType: "double",
      isAccessory: true,
      performanceHistory: [],
      lastPerformance: null,
    });
    // Not an equipment or injury swap: lifting a limitation never brings the
    // barbell back (`restoreSwappedLifts`).
    expect(built.swappedFrom).toBeUndefined();
  });

  it("leaves a lift at the bar or over it as it is", () => {
    const [bench] = build([day([lift("bench-press")])])[0].exercises;
    expect(bench).toMatchObject({ exerciseId: "bench-press", weight: 20 });
  });

  it("takes the next dumbbell version when the day holds the first", () => {
    const [built] = build([day([curl(), lift("db-curl")])])[0].exercises;
    expect(built.exerciseId).toBe("hammer-curl");
  });

  it("takes no dumbbell version past twice a week (`capRepeatedLifts`)", () => {
    const [built] = build([
      day([curl()]),
      day([lift("db-curl", { instanceId: "a" })]),
      day([lift("db-curl", { instanceId: "b" })]),
    ])[0].exercises;
    expect(built.exerciseId).toBe("hammer-curl");
  });

  it("takes no dumbbell version the person's injuries rule out", () => {
    const [built] = build([day([curl()])], { injuries: ["elbow"] })[0]
      .exercises;
    expect(built.exerciseId).toBe("hammer-curl");
  });

  it("starts the lift at the bar when the day holds every dumbbell version", () => {
    const [built] = build([
      day([
        curl(),
        lift("db-curl"),
        lift("hammer-curl"),
        lift("cross-body-hammer-curl"),
      ]),
    ])[0].exercises;
    expect(built).toMatchObject({
      exerciseId: "barbell-curl",
      weight: 20,
      lastSuccessfulWeight: 20,
      lastAttemptedWeight: 20,
    });
  });

  it("starts a barbell lift the bank has no dumbbell version of at the bar", () => {
    // The EZ-bar curl is a barbell lift outside the bank.
    const [built] = build([
      day([lift("ez-bar-curl", { isAccessory: true })]),
    ])[0].exercises;
    expect(built).toMatchObject({ exerciseId: "ez-bar-curl", weight: 20 });
  });

  it("keeps a lift the plan already has, under the bar", () => {
    const press = lift("overhead-press", { weight: 15 });
    const [kept] = build([day([press])], { kept: [day([press])] })[0].exercises;
    // Seeded as an untrained lift always is, and neither floored nor swapped.
    expect(kept).toMatchObject({ exerciseId: "overhead-press", weight: 12.5 });
  });

  it("swaps and floors nothing for a plan the person has (no `building`)", () => {
    const out = seedStartingLoads(
      [day([curl(), lift("overhead-press")])],
      light,
      8
    );
    expect(
      out[0].exercises.map((e) => `${e.exerciseId} ${String(e.weight)}`)
    ).toEqual(["barbell-curl 5", "overhead-press 12.5"]);
  });

  it("builds nothing once the week is fitted: a lift under the bar starts at the bar", () => {
    // `buildPlan` seeds the fitted week again, where a dumbbell version
    // would be a lift the time fit never priced.
    const [built] = build([day([curl()])], { fitted: true })[0].exercises;
    expect(built).toMatchObject({ exerciseId: "barbell-curl", weight: 20 });
  });

  it("changes nothing seeded a second time, as a plan build seeds twice", () => {
    const week = [
      day([curl(), lift("overhead-press"), lift("bench-press")]),
      day([
        lift("barbell-curl", { instanceId: "curl-2", isAccessory: true }),
        lift("db-curl"),
        lift("hammer-curl"),
        lift("cross-body-hammer-curl"),
      ]),
    ];
    const once = build(week);
    // As `buildPlan` seeds the fitted week, and as a rebuild would.
    expect(build(once, { fitted: true })).toEqual(once);
    expect(build(once)).toEqual(once);
  });
});

/* A start on the equipment's own weights. Plates and stacks move in 2.5 kg,
   but a rack of dumbbells goes 1–10 kg in 1 kg steps (`loadSteps.ts`), so a
   2.5 or 7.5 kg dumbbell start is a weight nobody can pick up. */
describe("a start on the equipment's own weights", () => {
  const racked = EXERCISES.filter(
    (e) => e.equipment === "Dumbbells" || e.equipment === "Kettlebell"
  );

  it("starts every dumbbell and kettlebell lift on its rack", () => {
    expect(racked.length).toBeGreaterThan(10);
    const off: string[] = [];
    for (const e of racked)
      for (const bodyweightKg of [50, 62, 80, 110])
        for (const experience of [
          "beginner",
          "intermediate",
          "advanced",
        ] as const)
          for (const sex of ["male", "female"])
            for (const reps of [6, 10, 15]) {
              const w = startingWeightForExercise(
                e.id,
                inferMovementCategory(e.name, e.id),
                { bodyweightKg, experience, sex },
                true,
                reps
              );
              const grid = equipmentGridFor(e.id, false)!;
              if (w > 0 && Math.abs(grid.nearest(w) - w) > 1e-9)
                off.push(`${e.id} ${String(w)} kg`);
            }
    expect(off).toEqual([]);
  });

  it("keeps every other start in 2.5 kg steps", () => {
    const loaded = EXERCISES.filter(
      (e) =>
        e.equipment !== "Dumbbells" &&
        e.equipment !== "Kettlebell" &&
        e.equipment !== "Bodyweight"
    );
    expect(loaded.length).toBeGreaterThan(10);
    const off: string[] = [];
    for (const e of loaded)
      for (const bodyweightKg of [50, 80, 110])
        for (const reps of [5, 10, 15]) {
          const w = startingWeightForExercise(
            e.id,
            inferMovementCategory(e.name, e.id),
            ctx({ bodyweightKg }),
            true,
            reps
          );
          if (w % 2.5 !== 0) off.push(`${e.id} ${String(w)} kg`);
        }
    expect(off).toEqual([]);
  });

  it("starts every loaded lift of a new plan on its equipment's grid", () => {
    const off = new Set<string>();
    for (const primaryGoal of ["hypertrophy", "strength", "general"] as const)
      for (const experience of [
        "beginner",
        "intermediate",
        "advanced",
      ] as const)
        for (const gender of ["male", "female"] as const)
          for (const equipment of ["full_gym", "home_gym"] as const)
            for (const weightKg of [55, 80, 110]) {
              const plan = buildOnboardingPlan(
                {
                  primaryGoal,
                  daysPerWeek: 4,
                  equipment,
                  gender,
                  experience,
                  weightKg,
                  runFrequency: "none",
                  runMode: "freeform",
                  weeklyRunDays: 0,
                  raceDistance: "10k",
                  raceTargetDate: "",
                  injuries: ["none"],
                },
                "recomp",
                "2026-09-07"
              );
              for (const d of plan.programState.workouts)
                for (const e of d.exercises) {
                  if (e.weight <= 0) continue;
                  const grid = loadGridFor(e.exerciseId, false);
                  if (Math.abs(grid.nearest(e.weight) - e.weight) > 1e-9)
                    off.add(`${e.exerciseId} ${String(e.weight)} kg`);
                }
            }
    expect([...off]).toEqual([]);
  });
});
