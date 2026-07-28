import { describe, it, expect } from "vitest";

import { generateProgram } from "../programEngine";
import { weeklyVolumeByMuscle, type CanonicalMuscle } from "../volumeModel";
import { isBodyweightExerciseId } from "@/lib/exercises";
import type { WorkoutDay } from "../programTypes";

/**
 * Regression pins from the 2026-07-28 generator audit.
 *
 * Every assertion here corresponds to a defect that was MEASURED on shipped
 * code, not to a rule someone thought would be nice. The audit's finding was
 * that the training-book arc had been reasoned about carefully and verified
 * loosely — the caps were tested against the rule they implemented rather
 * than against the programme a user would open. These test the programme.
 */

const CTX = { bodyweightKg: 80, experience: "beginner" as const };
const GOALS = ["hypertrophy", "strength", "general", "fat_loss"] as const;
const DAYS = [1, 2, 3, 4, 5, 6];

const week = (days: number, goal: (typeof GOALS)[number]) =>
  generateProgram("recomp", days, undefined, goal, CTX).workouts;

const allEx = (w: WorkoutDay[]) => w.flatMap((d) => d.exercises);

function tex(
  exerciseId: string,
  name: string,
  movementCategory: WorkoutDay["exercises"][number]["movementCategory"],
  weight: number
): WorkoutDay["exercises"][number] {
  return {
    name,
    exerciseId,
    movementCategory,
    sets: 3,
    reps: 8,
    weight,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [
      { date: "2026-01-01", weight, repsCompleted: 8, repsTarget: 8 },
    ],
    lastPerformance: null,
  };
}

describe("generator audit — cross-week lift repetition", () => {
  it("never prescribes the same lift more than twice in a week", () => {
    // The owner-reported defect, and Helms's literal counter-example:
    // "training squats three times a week and deadlifts three times a week
    // wouldn't be ideal for 90% of people because of the overlap." A 3-day
    // user was getting Barbell Squat ×3 and a 4-day user Barbell Curl ×3, on
    // every goal.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        const counts = new Map<string, number>();
        for (const ex of allEx(week(days, goal))) {
          counts.set(ex.exerciseId, (counts.get(ex.exerciseId) ?? 0) + 1);
        }
        for (const [id, n] of counts) {
          expect(n, `${goal}/${days}d: ${id}`).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe("generator audit — the overlap cap must not delete training", () => {
  it("keeps a demoted hinge inside hip_dominant", () => {
    // The cap re-pointed the surplus hinge to "whatever the week trains
    // least", which could never be another hinge — so it deleted the only
    // direct hamstring work in the 4- and 6-day builds and replaced it with
    // a bicep curl on a leg day. Hamstring volume halved.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        const w = week(days, goal);
        const hinges = allEx(w).filter(
          (e) => e.movementCategory === "hip_dominant"
        );
        expect(hinges.length, `${goal}/${days}d`).toBeGreaterThan(0);
      }
    }
  });

  it("puts no arms or pressing on a lower/legs day", () => {
    const LOWER_OK = new Set(["knee_dominant", "hip_dominant", "core"]);
    for (const goal of GOALS) {
      for (const days of DAYS) {
        for (const day of week(days, goal)) {
          if (day.dayType !== "lower" && day.dayType !== "legs") continue;
          for (const ex of day.exercises) {
            expect(
              LOWER_OK.has(ex.movementCategory),
              `${goal}/${days}d ${day.dayName}: ${ex.name}`
            ).toBe(true);
          }
        }
      }
    }
  });

  it("hamstrings are trained at least as well as before the caps existed", () => {
    // Measured pre-arc on a 4-day hypertrophy week: Hamstrings = 12 sets.
    // Post-cap, pre-fix: 6. The cap is allowed to change WHICH hinge; it is
    // not allowed to halve the muscle's volume.
    const vol = (m: CanonicalMuscle, w: WorkoutDay[]) =>
      weeklyVolumeByMuscle(w).find((v) => v.muscle === m)?.sets ?? 0;
    expect(vol("Hamstrings", week(4, "hypertrophy"))).toBeGreaterThanOrEqual(
      10
    );
    expect(vol("Hamstrings", week(6, "hypertrophy"))).toBeGreaterThanOrEqual(
      10
    );
  });
});

describe("generator audit — every prescribed lift is calibrated", () => {
  it("never ships a 0 kg prescription on a loaded movement", () => {
    // A re-pointed slot was minted with `weight: 0` and a comment saying the
    // seeding pass would fill it in; the seeding pass skipped accessories, so
    // nothing ever did. Users were shown "5 × 14-17 @ 0 kg".
    for (const goal of GOALS) {
      for (const days of DAYS) {
        for (const ex of allEx(week(days, goal))) {
          if (isBodyweightExerciseId(ex.exerciseId)) continue;
          expect(ex.weight, `${goal}/${days}d ${ex.name}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("prescribes ONE load per lift across the week", () => {
    // Seeding skipped accessories, so #15's accessory-marking of the
    // full-body slots produced Bench Press @35 kg as a main and @60 kg as an
    // accessory in the same week — the accessory copy heavier than the main.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        const byId = new Map<string, Set<number>>();
        for (const ex of allEx(week(days, goal))) {
          const seen = byId.get(ex.exerciseId) ?? new Set<number>();
          seen.add(ex.weight);
          byId.set(ex.exerciseId, seen);
        }
        for (const [id, weights] of byId) {
          expect([...weights], `${goal}/${days}d: ${id}`).toHaveLength(1);
        }
      }
    }
  });

  it("scales the seed to the variation, not just the movement pattern", () => {
    // A leg curl is hip_dominant like a deadlift. Before the per-exercise
    // factor it was seeded at the deadlift's load.
    const ex = allEx(week(4, "hypertrophy"));
    const deadlift = ex.find((e) => e.exerciseId === "deadlift");
    const curl = ex.find((e) => e.exerciseId === "seated-leg-curl");
    expect(deadlift).toBeDefined();
    expect(curl).toBeDefined();
    expect(curl!.weight).toBeLessThan(deadlift!.weight / 2);
  });
});

describe("generator audit — prescriptions stay physically plausible", () => {
  it("never prescribes above the rep ceiling, tighter for bodyweight lifts", () => {
    // Measured before the clamp: Pull-Ups 3×17-22, Barbell Squat 4×17-20 as
    // a MAIN, Deadlift 3×15-20. The pump-day +2 had a floor and no ceiling,
    // then the range stamp added the goal's span on top.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        for (const ex of allEx(week(days, goal))) {
          const ceiling = isBodyweightExerciseId(ex.exerciseId) ? 15 : 20;
          const label = `${goal}/${days}d ${ex.name}`;
          expect(ex.reps, label).toBeLessThanOrEqual(ceiling);
          expect(ex.repRangeMax ?? 0, label).toBeLessThanOrEqual(ceiling);
        }
      }
    }
  });
});

describe("generator audit — sessions stay inside a length budget", () => {
  it("the balancers never grow a session past 18 working sets", () => {
    // Backlog #15 was deferred on exactly this ("needs a volume-budget
    // decision first — a full-body day is already long") and its STATUS then
    // dismissed the worry. Measured: marking the full-body slots as
    // accessories made them growable for the first time and took a 3-day
    // week from 42 to 54 sets, 14 → 20 in one session. The balancing is
    // right; it needed the bound it was deferred on.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        for (const day of week(days, goal)) {
          const sets = day.exercises.reduce((n, e) => n + e.sets, 0);
          expect(sets, `${goal}/${days}d ${day.dayName}`).toBeLessThanOrEqual(
            18
          );
        }
      }
    }
  });
});

describe("generator audit — the generator is deterministic", () => {
  // `instanceId` is a per-slot identity stamped from the clock — it is
  // SUPPOSED to differ. Everything that constitutes the prescription must not.
  const shape = (w: WorkoutDay[]) =>
    JSON.stringify(
      w.map((d) => ({
        n: d.dayName,
        e: d.exercises.map(
          ({ instanceId: _drop, ...rest }) => rest as Record<string, unknown>
        ),
      }))
    );

  it("returns an identical prescription for identical inputs", () => {
    // Twelve identical calls produced EIGHT different programmes, because
    // `pickAccessory` was `Math.random()`-backed. Every determinism claim in
    // the #10 / #11 / #17 arc was false while that stood, and every
    // measurement taken against generated output was a sample, not a fact.
    for (const goal of GOALS) {
      for (const days of DAYS) {
        const runs = new Set(
          Array.from({ length: 6 }, () => shape(week(days, goal)))
        );
        expect(runs.size, `${goal}/${days}d`).toBe(1);
      }
    }
  });
});

describe("generator audit — a template plan survives its first regenerate", () => {
  // Templates are the ONLY seed path at onboarding, and their day names
  // ("Full Body A", "Upper A") can never equal the generator's
  // ("Full Body — Squat Focus"). Measured 2026-07-28 on the shipped code, the
  // first time a template user changed any setting:
  //   Bench Press@100 [from Barbell Squat] · Pull-Ups@106 [from Deadlift]
  // — a deadlift's load on a bodyweight pull-up. There was no test at this
  // boundary at all; the one that looked like it stamped the same weight on
  // every slot, so no permutation could fail it.
  const templatePlan = (): WorkoutDay[] => [
    {
      dayName: "Full Body A",
      dayType: "full_body",
      completed: false,
      exercises: [
        tex("squat", "Barbell Squat", "knee_dominant", 100),
        tex("bench-press", "Bench Press", "horizontal_push", 101),
        tex("barbell-row", "Barbell Row", "horizontal_pull", 102),
        tex("overhead-press", "Overhead Press", "vertical_push", 103),
        tex("cable-crunch", "Cable Crunch", "core", 104),
      ],
    },
    {
      dayName: "Full Body B",
      dayType: "full_body",
      completed: false,
      exercises: [
        tex("deadlift", "Deadlift", "hip_dominant", 105),
        tex("db-bench", "Dumbbell Bench Press", "horizontal_push", 106),
        tex("lat-pulldown", "Lat Pulldown", "vertical_pull", 107),
        tex("barbell-curl", "Barbell Curl", "arms_biceps", 108),
        tex("cable-crunch", "Cable Crunch", "core", 109),
      ],
    },
    {
      dayName: "Full Body C",
      dayType: "full_body",
      completed: false,
      exercises: [
        tex("front-squat", "Front Squat", "knee_dominant", 110),
        tex("incline-bench", "Incline Bench Press", "horizontal_push", 111),
        tex("seated-row", "Seated Cable Row", "horizontal_pull", 112),
        tex(
          "rope-tricep-pushdown",
          "Rope Tricep Pushdown",
          "arms_triceps",
          113
        ),
        tex("cable-crunch", "Cable Crunch", "core", 114),
      ],
    },
  ];

  it("never carries one lift's logged load onto a different movement", () => {
    const saved = templatePlan();
    const byWeight = new Map(
      saved
        .flatMap((d) => d.exercises)
        .map((e) => [e.weight, e.movementCategory] as const)
    );
    const { workouts } = generateProgram(
      "recomp",
      3,
      saved,
      "general",
      undefined
    );
    for (const day of workouts) {
      for (const ex of day.exercises) {
        const from = byWeight.get(ex.weight);
        if (from === undefined) continue; // a default, not a carry — fine
        expect(
          from,
          `${day.dayName}: ${ex.name} (${ex.movementCategory}) carried a ${from} load`
        ).toBe(ex.movementCategory);
      }
    }
  });

  it("still keeps the loads it legitimately can", () => {
    // The guard must not be satisfied by dropping every load. Slot alignment
    // puts each saved lift at the index its own movement is built at.
    const saved = templatePlan();
    const { workouts } = generateProgram(
      "recomp",
      3,
      saved,
      "general",
      undefined
    );
    const carried = workouts
      .flatMap((d) => d.exercises)
      .filter((e) => e.weight >= 100 && e.weight <= 114);
    expect(carried.length).toBeGreaterThanOrEqual(8);
  });
});
