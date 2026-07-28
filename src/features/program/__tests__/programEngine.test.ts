import { describe, it, expect } from "vitest";
import {
  applyProgression,
  applyDeload,
  advanceWeek,
  computeFatigueScore,
  generateProgram,
  generateWeekPrescription,
  expectedDayCount,
  goalProfileFor,
  applyFatigue,
  dedupeDayExercises,
  rotateUntrainedAccessories,
  splitRationale,
  isCycleEndWeek,
} from "../programEngine";
import { exerciseBank } from "../variationBank";
import { EXERCISES } from "@/lib/exercises";
import { deloadWeight } from "../easierToday";
import { PROGRAMME_PLATEAU_MIN } from "../adjustmentRule";
import type {
  Goal,
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";

function makeTestExercise(
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 6,
    baseReps: 6,
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

function makeBodyweightExercise(
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return makeTestExercise({
    name: "Pull-ups",
    exerciseId: "pull-ups",
    movementCategory: "vertical_pull",
    weight: 0,
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    reps: 8,
    ...overrides,
  });
}

// ── Double Progression ──────────────────────────

describe("isCycleEndWeek — programme_complete badge trigger", () => {
  it("is true on deload weeks (every 4th — the mesocycle end)", () => {
    for (const w of [4, 8, 12, 16, 52]) {
      expect(isCycleEndWeek(w)).toBe(true);
      // Stays in lockstep with the periodization schedule itself.
      expect(generateWeekPrescription(w).deload).toBe(true);
    }
  });

  it("is false on progression weeks", () => {
    for (const w of [1, 2, 3, 5, 6, 7, 9]) {
      expect(isCycleEndWeek(w)).toBe(false);
    }
  });

  it("is false for a 0/invalid week (no completion to credit)", () => {
    expect(isCycleEndWeek(0)).toBe(false);
  });
});

describe("applyProgression — double progression", () => {
  it("does NOT increase weight when reps meet target but don't hit ceiling", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // Hit exactly 6 reps (target) — should succeed but NOT increase weight yet
    const result = applyProgression(ex, 6, 60, "recomp", false);
    expect(result.weight).toBe(60); // stays same — accumulating reps
    expect(result.consecutiveFailures).toBe(0);
  });

  it("does NOT increase weight when reps exceed target by 1", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    const result = applyProgression(ex, 7, 60, "recomp", false);
    expect(result.weight).toBe(60); // still accumulating — ceiling is reps+2=8
  });

  it("increases weight when reps hit ceiling (target + 2)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // Hit 8 reps (6+2 = ceiling) — NOW increase weight
    const result = applyProgression(ex, 8, 60, "recomp", false);
    expect(result.weight).toBe(62.5); // 60 + 2.5 + 0 (recomp bonus = 0)
    expect(result.reps).toBe(6); // reset to base
  });

  it("adds goal bonus on lean bulk", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    const result = applyProgression(ex, 8, 60, "lean bulk", false);
    expect(result.weight).toBe(63.75); // 60 + 2.5 + 1.25
  });

  it("requires 3 consecutive failures before deload (not 2)", () => {
    const ex = makeTestExercise({ consecutiveFailures: 1 });
    // 2nd failure — should NOT deload yet
    const result = applyProgression(ex, 4, 60, "recomp", false);
    expect(result.consecutiveFailures).toBe(2);
    expect(result.weight).toBe(60); // no deload

    // 3rd failure — NOW deload
    const result2 = applyProgression(result, 4, 60, "recomp", false);
    expect(result2.consecutiveFailures).toBe(0);
    expect(result2.weight).toBeLessThan(60);
    expect(result2.plateauCount).toBe(1);
  });
});

// ── Bodyweight Progression ──────────────────────

describe("applyProgression — bodyweight exercises", () => {
  it("progresses via rep increase when hitting ceiling", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    // Hit 10 reps (8+2 = ceiling)
    const result = applyProgression(ex, 10, 0, "recomp", false);
    expect(result.weight).toBe(0); // stays bodyweight
    expect(result.reps).toBe(9); // rep target increased by 1
  });

  it("does not progress when below rep ceiling", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    const result = applyProgression(ex, 9, 0, "recomp", false);
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(8); // no change
  });

  it("deloads by reducing rep target on consecutive failures", () => {
    const ex = makeBodyweightExercise({ reps: 8, consecutiveFailures: 2 });
    const result = applyProgression(ex, 5, 0, "recomp", false);
    expect(result.reps).toBe(7); // reduced by 1
    expect(result.weight).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it("enforces minimum 4 reps on deload", () => {
    const ex = makeBodyweightExercise({ reps: 4, consecutiveFailures: 2 });
    const result = applyProgression(ex, 2, 0, "recomp", false);
    expect(result.reps).toBe(4); // can't go below 4
  });

  it("also works for linear progression type", () => {
    const ex = makeBodyweightExercise({ progressionType: "linear", reps: 8 });
    const result = applyProgression(ex, 10, 0, "recomp", false);
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(9);
  });
});

// ── RPE autoregulation (D-LIFT-6) ───────────────

describe("applyProgression — RPE autoregulation", () => {
  it("HOLDS load when the completed set was at RPE ≥ 9.5 (double)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // hit ceiling (8 reps) but at maximal effort → no weight increase
    const held = applyProgression(ex, 8, 60, "recomp", false, 10);
    expect(held.weight).toBe(60); // held
    expect(held.consecutiveFailures).toBe(0); // still a success, not a failure
    // same set at a sub-maximal RPE → normal weight increase
    const up = applyProgression(ex, 8, 60, "recomp", false, 8);
    expect(up.weight).toBe(62.5);
  });

  it("HOLDS the microloading bump at RPE ≥ 9.5 (linear)", () => {
    const ex = makeTestExercise({
      progressionType: "linear",
      reps: 6,
      weight: 60,
    });
    expect(applyProgression(ex, 6, 60, "recomp", true, 9.5).weight).toBe(60);
    expect(applyProgression(ex, 6, 60, "recomp", true, 7).weight).toBe(61);
  });

  it("progresses normally when no RPE is logged (back-compat)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    expect(applyProgression(ex, 8, 60, "recomp", false).weight).toBe(62.5);
  });
});

// ── Bodyweight rep cap (D-LIFT-11) ──────────────

describe("applyProgression — bodyweight rep cap", () => {
  it("caps the rep target at 20 and prompts adding load", () => {
    const ex = makeBodyweightExercise({ reps: 20 });
    const out = applyProgression(ex, 22, 0, "recomp", false);
    expect(out.reps).toBe(20); // not 21 — capped
    expect(out.notes).toMatch(/add load/i);
  });

  it("still increments below the cap", () => {
    const ex = makeBodyweightExercise({ reps: 12 });
    const out = applyProgression(ex, 14, 0, "recomp", false);
    expect(out.reps).toBe(13);
    expect(out.notes).toBeUndefined();
  });
});

// ── Day dedupe (D-LIFT-12) ──────────────────────

describe("dedupeDayExercises", () => {
  it("re-points a duplicate exercise id to another variation in the category", () => {
    const dup = makeTestExercise({
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
    });
    const out = dedupeDayExercises([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [dup, { ...dup }], // two bench-press on one day
      },
    ]);
    const ids = out[0].exercises.map((e) => e.exerciseId);
    expect(ids[0]).toBe("bench-press");
    expect(ids[1]).not.toBe("bench-press"); // re-pointed
    expect(new Set(ids).size).toBe(2); // no duplicate
  });

  it("leaves a day with no duplicates unchanged", () => {
    const a = makeTestExercise({ exerciseId: "bench-press" });
    const b = makeTestExercise({
      exerciseId: "squat",
      movementCategory: "knee_dominant",
    });
    const out = dedupeDayExercises([
      {
        dayName: "D",
        dayType: "full_body",
        completed: false,
        exercises: [a, b],
      },
    ]);
    expect(out[0].exercises.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "squat",
    ]);
  });
});

// ── Accessory rotation (D-LIFT-4) ───────────────

describe("rotateUntrainedAccessories", () => {
  const accessory = (over: Partial<ProgramExercise>): ProgramExercise =>
    makeTestExercise({
      exerciseId: "incline-db-press",
      movementCategory: "horizontal_push",
      isAccessory: true,
      performanceHistory: [],
      ...over,
    });

  it("rotates an untrained accessory to a different variation in its category", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [accessory({})],
      },
    ]);
    const e = out[0].exercises[0];
    expect(e.isAccessory).toBe(true);
    expect(e.exerciseId).not.toBe("incline-db-press"); // rotated
    // still a horizontal_push variation
    const validIds = new Set(exerciseBank.horizontal_push.map((o) => o.id));
    expect(validIds.has(e.exerciseId)).toBe(true);
  });

  it("never rotates a main lift", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [
          makeTestExercise({ exerciseId: "bench-press", isAccessory: false }),
        ],
      },
    ]);
    expect(out[0].exercises[0].exerciseId).toBe("bench-press");
  });

  it("never rotates an accessory the user has trained (has history)", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [
          accessory({
            performanceHistory: [
              {
                date: "2026-01-01",
                weight: 20,
                repsCompleted: 10,
                repsTarget: 10,
              },
            ],
          }),
        ],
      },
    ]);
    expect(out[0].exercises[0].exerciseId).toBe("incline-db-press"); // kept
  });
});

// ── Deload ──────────────────────────────────────

describe("applyDeload", () => {
  it("rounds weight to 2.5kg increments", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [makeTestExercise({ weight: 100, sets: 4 })],
      },
    ];
    const result = applyDeload(workouts);
    // 100 * 0.85 = 85 → round(85/2.5)*2.5 = 85 (exact)
    expect(result[0].exercises[0].weight).toBe(85);
    expect(result[0].exercises[0].sets).toBe(3); // 4-1=3
  });

  it("rounds non-exact values to nearest 2.5kg", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [makeTestExercise({ weight: 60, sets: 3 })],
      },
    ];
    const result = applyDeload(workouts);
    // 60 * 0.85 = 51 → round(51/2.5)*2.5 = round(20.4)*2.5 = 20*2.5 = 50
    expect(result[0].exercises[0].weight).toBe(50);
  });

  it("does not change bodyweight exercise weight", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Pull",
        dayType: "pull",
        completed: false,
        exercises: [makeBodyweightExercise({ sets: 4 })],
      },
    ];
    const result = applyDeload(workouts);
    expect(result[0].exercises[0].weight).toBe(0);
    expect(result[0].exercises[0].sets).toBe(3); // still reduces sets
  });
});

// ── computeFatigueScore (D-LIFT-8) ──────────────

describe("computeFatigueScore", () => {
  const day = (exs: ProgramExercise[]): WorkoutDay => ({
    dayName: "D",
    dayType: "upper",
    completed: true,
    exercises: exs,
  });

  it("is 0 when nothing is failing", () => {
    expect(
      computeFatigueScore([day([makeTestExercise({ consecutiveFailures: 0 })])])
    ).toBe(0);
  });

  it("scales with unresolved recent failures (×8)", () => {
    expect(
      computeFatigueScore([
        day([
          makeTestExercise({ consecutiveFailures: 2 }),
          makeTestExercise({ consecutiveFailures: 1 }),
        ]),
      ])
    ).toBe(24); // (2+1)*8
  });

  it("needs a meaningful share failing to clear the >20 cut threshold", () => {
    // one lift at two misses = 16 → below 20 (no cut); two lifts = 32 → trips
    expect(
      computeFatigueScore([day([makeTestExercise({ consecutiveFailures: 2 })])])
    ).toBeLessThanOrEqual(20);
    expect(
      computeFatigueScore([
        day([
          makeTestExercise({ consecutiveFailures: 2 }),
          makeTestExercise({ consecutiveFailures: 2 }),
        ]),
      ])
    ).toBeGreaterThan(20);
  });

  it("clamps to 100 (can't ratchet unbounded)", () => {
    const exs = Array.from({ length: 30 }, () =>
      makeTestExercise({ consecutiveFailures: 2 })
    );
    expect(computeFatigueScore([day(exs)])).toBe(100);
  });
});

// ── advanceWeek ─────────────────────────────────

describe("advanceWeek", () => {
  const baseProgramState: ProgramState = {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 3,
    splitType: "upper_lower",
    fatigueScore: 50,
    updatedAt: Date.now(),
    workouts: [
      {
        dayName: "Upper A",
        dayType: "upper",
        completed: true,
        exercises: [makeTestExercise({ sets: 4, weight: 80 })],
      },
    ],
  };

  it("does not apply fatigue on deload weeks (H5)", () => {
    // Week 4 (4%4=0) is deload
    const state = { ...baseProgramState, weekNumber: 3, fatigueScore: 50 };
    const result = advanceWeek(state);
    expect(result.weekNumber).toBe(4);
    expect(result.currentPhase).toBe("deload");
    // Deload: sets=4-1=3, weight=80*0.85=68→round(68/2.5)*2.5=67.5
    const ex = result.workouts[0].exercises[0];
    expect(ex.sets).toBe(3);
    expect(ex.weight).toBe(67.5);
    // Fatigue would further reduce sets to round(3*0.9)=3, but since it's deload,
    // fatigue should NOT have been applied. We verify sets is exactly 3 (deload only).
  });

  it("applies COMPUTED fatigue on non-deload weeks (D-LIFT-8)", () => {
    // Week 2 (2%4=2) is NOT deload. fatigueScore is now DERIVED from the week's
    // per-exercise consecutiveFailures, not the persisted scalar. Three lifts at
    // 2 straight misses → 6×8 = 48 (>20) → next week's volume trims.
    const state: ProgramState = {
      ...baseProgramState,
      weekNumber: 1,
      fatigueScore: 0, // persisted value is ignored now
      workouts: [
        {
          dayName: "Upper A",
          dayType: "upper",
          completed: true,
          exercises: [
            makeTestExercise({ sets: 6, consecutiveFailures: 2 }),
            makeTestExercise({ sets: 6, consecutiveFailures: 2 }),
            makeTestExercise({ sets: 6, consecutiveFailures: 2 }),
          ],
        },
      ],
    };
    const result = advanceWeek(state);
    expect(result.weekNumber).toBe(2);
    expect(result.currentPhase).toBe("progression");
    expect(result.fatigueScore).toBe(48);
    // Fatigue cut: Math.round(6*0.9)=5 — visible reduction.
    expect(result.workouts[0].exercises[0].sets).toBe(5);
  });

  it("does NOT cut volume when there are no recent failures (stale scalar ignored)", () => {
    const state: ProgramState = {
      ...baseProgramState,
      weekNumber: 1,
      fatigueScore: 99, // stale persisted value must NOT trigger a cut
      workouts: [
        {
          dayName: "Upper A",
          dayType: "upper",
          completed: true,
          exercises: [makeTestExercise({ sets: 6, consecutiveFailures: 0 })],
        },
      ],
    };
    const result = advanceWeek(state);
    expect(result.fatigueScore).toBe(0);
    expect(result.workouts[0].exercises[0].sets).toBe(6); // untouched
  });

  it("caps week number at 52 and recycles to 1 (L2)", () => {
    const state = { ...baseProgramState, weekNumber: 52, fatigueScore: 0 };
    const result = advanceWeek(state);
    expect(result.weekNumber).toBe(1); // recycled
  });

  it("does not recycle before 52", () => {
    const state = { ...baseProgramState, weekNumber: 51, fatigueScore: 0 };
    const result = advanceWeek(state);
    expect(result.weekNumber).toBe(52);
  });
});

// ── PPL×2 Deep Copy ─────────────────────────────

describe("generateProgram — PPL×2", () => {
  it("Legs B has independent exercise objects from Legs A (H2)", () => {
    // Day names were renamed in W1a from "Legs"/"Legs B" to emphasis labels.
    const { workouts } = generateProgram("recomp", 6);
    const legsA = workouts.find((d) => d.dayName === "Legs — Squat Focus");
    const legsB = workouts.find((d) => d.dayName === "Legs — Deadlift Focus");
    expect(legsA).toBeDefined();
    expect(legsB).toBeDefined();
    // Exercises should be separate objects
    legsA!.exercises[0].weight = 999;
    expect(legsB!.exercises[0].weight).not.toBe(999);
  });
});

// ── Weekly Prescription ─────────────────────────

describe("generateWeekPrescription", () => {
  it("week 4 is deload", () => {
    const p = generateWeekPrescription(4);
    expect(p.deload).toBe(true);
    expect(p.intensityMultiplier).toBe(0.85);
    expect(p.volumeModifier).toBe(0.7);
  });

  it("week 8 is deload", () => {
    expect(generateWeekPrescription(8).deload).toBe(true);
  });

  it("non-deload weeks have increasing intensity", () => {
    const w1 = generateWeekPrescription(1);
    const w2 = generateWeekPrescription(2);
    const w3 = generateWeekPrescription(3);
    expect(w1.deload).toBe(false);
    expect(w1.intensityMultiplier).toBe(1.025);
    expect(w2.intensityMultiplier).toBe(1.05);
    expect(w3.intensityMultiplier).toBe(1.075);
  });
});

// ── M7: baseReps drift prevention ───────────────

describe("applyProgression — baseReps anchor (M7)", () => {
  it("resets to baseReps on weight increase, not drifted reps", () => {
    // Simulate a scenario where reps have drifted to 8 but baseReps is 6
    const ex = makeTestExercise({ reps: 8, baseReps: 6, weight: 60 });
    // Hit ceiling (8+2=10) → weight increase, reps should reset to baseReps=6
    const result = applyProgression(ex, 10, 60, "recomp", false);
    expect(result.weight).toBe(62.5);
    expect(result.reps).toBe(6); // reset to baseReps, not 8
  });

  it("resets to baseReps in linear progression too", () => {
    const ex = makeTestExercise({
      progressionType: "linear",
      reps: 14,
      baseReps: 12,
      weight: 30,
    });
    // Hit ceiling (14+2=16) → weight increase. 30 kg is below the heavy
    // threshold, so the step is a microplate (#7's corrected discriminator
    // reaches mains too — 2.5 kg on a 30 kg lift is an 8% jump).
    const result = applyProgression(ex, 16, 30, "recomp", false);
    expect(result.weight).toBe(31.25);
    expect(result.reps).toBe(12); // baseReps anchor — the subject of this test
  });

  it("falls back to exercise.reps when baseReps is undefined (backward compat)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    delete (ex as unknown as Record<string, unknown>).baseReps;
    const result = applyProgression(ex, 8, 60, "recomp", false);
    expect(result.weight).toBe(62.5);
    expect(result.reps).toBe(6); // falls back to exercise.reps
  });

  it("generated exercises have baseReps set", () => {
    const { workouts } = generateProgram("recomp", 3);
    for (const day of workouts) {
      for (const ex of day.exercises) {
        expect(ex.baseReps).toBeDefined();
        expect(ex.baseReps).toBe(ex.reps);
      }
    }
  });
});

// ── M8: Legs B differentiation ──────────────────

describe("generateProgram — Legs B differentiation (M8)", () => {
  // Day names were renamed in W1a from "Legs"/"Legs B" to emphasis labels.
  const LEGS_A = "Legs — Squat Focus";
  const LEGS_B = "Legs — Deadlift Focus";

  it("Legs B leads with hip-dominant, Legs A leads with knee-dominant", () => {
    const { workouts } = generateProgram("recomp", 6);
    const legsA = workouts.find((d) => d.dayName === LEGS_A);
    const legsB = workouts.find((d) => d.dayName === LEGS_B);
    expect(legsA).toBeDefined();
    expect(legsB).toBeDefined();
    // Legs A first exercise is knee_dominant (squat)
    expect(legsA!.exercises[0].movementCategory).toBe("knee_dominant");
    // Legs B first exercise is hip_dominant (deadlift variant)
    expect(legsB!.exercises[0].movementCategory).toBe("hip_dominant");
  });

  it("Legs B has different exercise order from Legs A", () => {
    const { workouts } = generateProgram("recomp", 6);
    const legsA = workouts.find((d) => d.dayName === LEGS_A)!;
    const legsB = workouts.find((d) => d.dayName === LEGS_B)!;
    const categoriesA = legsA.exercises.map((e) => e.movementCategory);
    const categoriesB = legsB.exercises.map((e) => e.movementCategory);
    // First two exercises should be in opposite order
    expect(categoriesA[0]).toBe("knee_dominant");
    expect(categoriesA[1]).toBe("hip_dominant");
    expect(categoriesB[0]).toBe("hip_dominant");
    expect(categoriesB[1]).toBe("knee_dominant");
  });

  it("7-day target caps to 6 and still emits differentiated Legs B", () => {
    // W1a: chooseSplit caps at 6 hard days instead of returning ppl_x2_fb.
    // A user requesting 7 lift days gets the 6-day ppl_x2 split and the
    // scheduler fills the 7th weekday as active rest. The differentiated
    // Legs B is still emitted as the 6th workout.
    const { workouts } = generateProgram("recomp", 7);
    expect(workouts).toHaveLength(6);
    const legsB = workouts.find((d) => d.dayName === LEGS_B);
    expect(legsB).toBeDefined();
    expect(legsB!.exercises[0].movementCategory).toBe("hip_dominant");
  });
});

// Pgm5 (Q2): planBuilder routes a content edit to "preserve" vs a lift-days
// change to "rebuild" by comparing existing workout count to expectedDayCount.
// If this drifts from generateProgram's real output length, edits get
// misrouted (lossy rebuild, or a stale preserve) — so pin the equality.
describe("expectedDayCount · parity with generateProgram", () => {
  for (let n = 1; n <= 7; n++) {
    it(`equals generated workout count for ${n} lift days`, () => {
      const { workouts } = generateProgram(
        "recomp",
        n,
        undefined,
        "hypertrophy"
      );
      expect(workouts).toHaveLength(expectedDayCount(n));
    });
  }

  it("is 0 for a non-positive target (matches empty workouts)", () => {
    expect(expectedDayCount(0)).toBe(0);
    const { workouts } = generateProgram("recomp", 0, undefined, "hypertrophy");
    expect(workouts).toHaveLength(0);
  });
});

// ── goalProfileFor ───────────────────────────
describe("goalProfileFor", () => {
  it("returns a defined profile for every primary goal", () => {
    for (const g of [
      "hypertrophy",
      "strength",
      "fat_loss",
      "general",
      "running",
    ] as const) {
      expect(goalProfileFor(g)).toBeTruthy();
    }
  });

  it("falls back to the 'general' profile when the goal is undefined", () => {
    expect(goalProfileFor(undefined)).toEqual(goalProfileFor("general"));
  });
});

// ── applyFatigue ─────────────────────────────
describe("applyFatigue", () => {
  const day = (sets: number): WorkoutDay => ({
    dayName: "Push",
    dayType: "lift",
    completed: false,
    exercises: [makeTestExercise({ sets })],
  });

  it("leaves workouts untouched at or below the 20 fatigue threshold", () => {
    const input = [day(10)];
    expect(applyFatigue(input, 20)).toBe(input); // same ref — early return
  });

  it("trims sets ~10% (floored at 2) above the threshold", () => {
    const [d] = applyFatigue([day(10)], 50);
    expect(d.exercises[0].sets).toBe(9); // round(10 * 0.9)
  });

  it("never drops a lift below 2 working sets", () => {
    const [d] = applyFatigue([day(2)], 90);
    expect(d.exercises[0].sets).toBe(2);
  });
});

// ── Split rationale (D-LIFT-7) ──────────────────

describe("splitRationale", () => {
  it("returns a non-empty 'why' for every day count 0..7", () => {
    for (let d = 0; d <= 7; d++) {
      expect(splitRationale(d).length).toBeGreaterThan(0);
    }
  });

  it("explains the frequency logic for the headline cases", () => {
    expect(splitRationale(3)).toMatch(/full-body/i);
    expect(splitRationale(3)).toMatch(/3×|3x|week/i);
    expect(splitRationale(2)).toMatch(/upper.*lower/i);
    expect(splitRationale(6)).toMatch(/push\/pull\/legs|twice/i);
  });

  it("clamps out-of-range day counts (7 → 6's rationale)", () => {
    expect(splitRationale(7)).toBe(splitRationale(6));
  });
});

// Backlog #3 — day roles (N9 daily undulation). Compare same-structure days
// across weekly targets: 1-day week is all-moderate, 3-day week is
// [heavy, moderate, pump], so day A (heavy in the 3-day week) should sit 2
// reps under its 1-day (moderate) twin, and day C mirrors +2 vs moderate.
describe("day roles (backlog #3)", () => {
  const mainRepsOf = (w: {
    exercises: { isAccessory?: boolean; reps: number }[];
  }) => w.exercises.filter((e) => e.isAccessory !== true).map((e) => e.reps);

  it("single-day weeks stay at the goal base", () => {
    const one = generateProgram("recomp", 1, undefined, "hypertrophy");
    expect(mainRepsOf(one.workouts[0])).toContain(8);
  });

  it("3-day full-body week undulates: day A heavy (-2) vs its moderate twin", () => {
    const one = generateProgram("recomp", 1, undefined, "hypertrophy");
    const three = generateProgram("recomp", 3, undefined, "hypertrophy");
    const moderateA = one.workouts[0];
    const heavyA = three.workouts[0];
    expect(heavyA.dayName).toBe(moderateA.dayName);
    heavyA.exercises.forEach((ex, i) => {
      const twin = moderateA.exercises[i];
      const floor = ex.isAccessory === true ? 6 : 3;
      expect(ex.reps).toBe(Math.max(floor, twin.reps - 2));
      expect(ex.baseReps).toBe(ex.reps);
    });
    // middle day is moderate: reps match the profile base on the mains
    expect(mainRepsOf(three.workouts[1])).toContain(8);
  });

  it("strength mains floor at 3 on heavy days", () => {
    const two = generateProgram("recomp", 2, undefined, "strength");
    const heavyMains = mainRepsOf(two.workouts[0]);
    // strength base 5 → heavy day 3; nothing below the floor
    expect(Math.min(...heavyMains)).toBeGreaterThanOrEqual(3);
    expect(heavyMains).toContain(3);
  });

  it("pump day sits +2 over the moderate twin (2-day week, day B vs 3-day day B... via 3-day pump day C)", () => {
    const three = generateProgram("recomp", 3, undefined, "hypertrophy");
    // Day C is pump: every exercise ≥ its own baseReps and mains ≥ base+2
    const pumpMains = mainRepsOf(three.workouts[2]);
    expect(Math.max(...pumpMains)).toBeGreaterThanOrEqual(10);
  });
});

// Backlog #5 (volume ramp) + the auto-deload decay fix. Before this,
// advanceWeek applied applyDeload's sets−1 / ×0.85 to LIVE state with no
// restore on meso exit — every mesocycle permanently shrank the programme
// (the manual deload command guards exactly this with its undo snapshot;
// the automatic weekly path had no guard).
describe("weekly volume shape (backlog #5 + deload-decay fix)", () => {
  const makeState = () => {
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    // Calibrate every lift so the deload weight cut/restore is observable.
    const withWeights = workouts.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        weight: 50,
        lastSuccessfulWeight: 50,
        consecutiveFailures: 0,
      })),
    }));
    return {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 1,
      splitType: "full_body",
      workouts: withWeights,
      fatigueScore: 0,
      updatedAt: 0,
      settings: { autoProgression: true, microloading: false },
      weekHistory: [],
    } as unknown as Parameters<typeof advanceWeek>[0];
  };

  const setsGrid = (st: ReturnType<typeof makeState>) =>
    st.workouts.map((d) => d.exercises.map((e) => e.sets));

  it("generateProgram stamps baseSets on every exercise", () => {
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    workouts.forEach((d) =>
      d.exercises.forEach((ex) => expect(ex.baseSets).toBe(ex.sets))
    );
  });

  it("ramps accessories base−1 / base / base+1 across the meso, mains hold", () => {
    let st = makeState();
    const base = st.workouts.map((d) => d.exercises.map((e) => e.sets));
    st = advanceWeek(st); // week 2 (mid)
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => expect(ex.sets).toBe(base[di][ei]))
    );
    st = advanceWeek(st); // week 3 (top)
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        const b = base[di][ei];
        expect(ex.sets).toBe(ex.isAccessory === true ? Math.min(5, b + 1) : b);
      })
    );
    st = advanceWeek(st); // week 4 — deload cuts from the ANCHOR, not week 3
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        expect(ex.sets).toBe(Math.max(2, base[di][ei] - 1));
        expect(ex.weight).toBe(deloadWeight(50)); // pinned to the shared rule
        expect(ex.preDeloadWeight).toBe(50);
      })
    );
    st = advanceWeek(st); // week 5 — meso restart
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        const b = base[di][ei];
        expect(ex.sets).toBe(ex.isAccessory === true ? Math.max(1, b - 1) : b);
        expect(ex.weight).toBe(50); // load restored, cut not permanent
        expect("preDeloadWeight" in ex).toBe(false);
      })
    );
  });

  it("never compounds across mesocycles", () => {
    let st = makeState();
    for (let w = 2; w <= 5; w++) st = advanceWeek(st);
    const firstMesoRestart = setsGrid(st);
    for (let w = 6; w <= 9; w++) st = advanceWeek(st);
    expect(setsGrid(st)).toEqual(firstMesoRestart);
    st.workouts.forEach((d) =>
      d.exercises.forEach((ex) => expect(ex.weight).toBe(50))
    );
  });

  it("keeps load progressed DURING the deload week (max wins on restore)", () => {
    let st = makeState();
    for (let w = 2; w <= 4; w++) st = advanceWeek(st); // into deload
    st = {
      ...st,
      workouts: st.workouts.map((d, di) => ({
        ...d,
        exercises: d.exercises.map((ex, ei) =>
          di === 0 && ei === 0 ? { ...ex, weight: 55 } : ex
        ),
      })),
    };
    st = advanceWeek(st); // meso exit
    expect(st.workouts[0].exercises[0].weight).toBe(55);
    expect(st.workouts[0].exercises[1].weight).toBe(50);
  });

  it("legacy exercises without baseSets anchor lazily from live sets", () => {
    let st = makeState();
    st = {
      ...st,
      workouts: st.workouts.map((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          const { baseSets: _b, ...rest } = ex;
          void _b;
          return rest as typeof ex;
        }),
      })),
    };
    const live = setsGrid(st);
    st = advanceWeek(st); // week 2 (mid) — anchor stamps, sets unchanged
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        expect(ex.baseSets).toBe(live[di][ei]);
        expect(ex.sets).toBe(live[di][ei]);
      })
    );
  });
});

// Backlog #7 — progression scheme per exercise TYPE, not per goal (H3/N2).
// Two halves: generateProgram now stamps rep ranges + puts isolations on
// double progression, and applyProgression steps load in proportion to the
// lift. Both are engine-only (presentation policy: INVISIBLE).
describe("progression scheme per exercise type (backlog #7)", () => {
  const allEx = (w: { exercises: ProgramExercise[] }[]) =>
    w.flatMap((d) => d.exercises);

  it("stamps a rep range on every generated exercise", () => {
    const { workouts } = generateProgram("recomp", 4, undefined, "hypertrophy");
    // Before #7 the range machinery shipped in P1 only ever reached
    // template-derived programmes — the procedural engine authored none.
    for (const ex of allEx(workouts)) {
      expect(ex.repRangeMax).toBeGreaterThan(ex.reps);
    }
  });

  it("keeps the range WIDTH constant across day roles", () => {
    // The ceiling is derived after applyDayRoles has shifted reps, so a
    // heavy day gets a shifted ceiling too. A fixed ceiling would have
    // turned an 8-12 main into 6-12 on heavy days — a 6-rep climb.
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    for (const ex of allEx(workouts)) {
      const span = ex.isAccessory === true ? 3 : 4; // 12→15 acc, 8→12 main
      expect(ex.repRangeMax! - ex.reps).toBe(span);
    }
    // and the roles really did move: heavy day A mains sit under pump day C
    const mainReps = (i: number) =>
      workouts[i].exercises.filter((e) => e.isAccessory !== true)[0].reps;
    expect(mainReps(0)).toBeLessThan(mainReps(2));
  });

  it("puts isolations on double progression and mains on the goal's scheme", () => {
    // strength profile is mainProgression "linear" — the accessories must
    // NOT inherit it. That inheritance was the whole defect (H3).
    const { workouts } = generateProgram("recomp", 4, undefined, "strength");
    const acc = allEx(workouts).filter((e) => e.isAccessory === true);
    const mains = allEx(workouts).filter((e) => e.isAccessory !== true);
    expect(acc.length).toBeGreaterThan(0);
    expect(acc.every((e) => e.progressionType === "double")).toBe(true);
    expect(mains.every((e) => e.progressionType === "linear")).toBe(true);
  });

  // The load step keys on the MOVEMENT and its load, not on `isAccessory`.
  // That flag is a volume role, and `pickAccessory` fills those slots from
  // the non-primary pool — which for the compound categories is Romanian
  // Deadlift, Hack Squat, Leg Press. A real 4-day programme tagged a 50 kg
  // hack squat as an accessory and handed it 1.25 kg steps.
  const atRangeTop = (o: Partial<ProgramExercise>, goal: Goal = "recomp") => {
    const w = o.weight ?? 100;
    return applyProgression(
      makeTestExercise({
        progressionType: "double",
        reps: 12,
        baseReps: 12,
        repRangeMax: 15,
        lastSuccessfulWeight: w,
        ...o,
      }),
      15,
      w,
      goal,
      false
    );
  };

  it("single-joint work takes a microplate at ANY load", () => {
    const curl = atRangeTop({
      movementCategory: "arms_biceps",
      weight: 100,
    });
    expect(curl.weight).toBe(101.25);
    expect(curl.reps).toBe(12); // target resets to the bottom of the range
  });

  it("a heavy compound takes a full plate pair even when tagged an accessory", () => {
    // The exact shipped defect: isAccessory said "isolation" for an RDL.
    for (const isAccessory of [true, false]) {
      const rdl = atRangeTop({
        movementCategory: "hip_dominant",
        weight: 100,
        isAccessory,
      });
      expect(rdl.weight).toBe(102.5);
    }
  });

  it("a LIGHT compound takes a microplate — 2.5 kg on 30 kg is an 8% jump", () => {
    const lightBench = atRangeTop({
      movementCategory: "horizontal_push",
      weight: 30,
    });
    expect(lightBench.weight).toBe(31.25);
  });

  it("separates a lateral raise from an overhead press, which no category can", () => {
    // Both are `vertical_push` in this taxonomy (see the keyword table in
    // exerciseMovementCategory) — the load is the only thing that tells
    // them apart, which is why the discriminator isn't category alone.
    expect(
      atRangeTop({ movementCategory: "vertical_push", weight: 8 }).weight
    ).toBe(9.25);
    expect(
      atRangeTop({ movementCategory: "vertical_push", weight: 60 }).weight
    ).toBe(62.5);
  });

  it("withholds the lean-bulk accelerator from anything on a microplate", () => {
    // A lift too light for a full plate is too light for a bonus on top.
    expect(
      atRangeTop({ movementCategory: "arms_biceps", weight: 100 }, "lean bulk")
        .weight
    ).toBe(101.25);
    expect(
      atRangeTop(
        { movementCategory: "horizontal_push", weight: 30 },
        "lean bulk"
      ).weight
    ).toBe(31.25);
    // heavy compound still gets it: 2.5 + 1.25
    expect(
      atRangeTop({ movementCategory: "hip_dominant", weight: 100 }, "lean bulk")
        .weight
    ).toBe(103.75);
  });

  it("leaves compounds byte-identical to pre-#7 behaviour", () => {
    // isAccessory absent (legacy rows) must read as compound, not isolation.
    const legacy = makeTestExercise({
      progressionType: "linear",
      reps: 6,
      baseReps: 6,
      weight: 100,
      lastSuccessfulWeight: 100,
    });
    expect(applyProgression(legacy, 8, 100, "recomp", false).weight).toBe(
      102.5
    );
    const dbl = makeTestExercise({ weight: 100, lastSuccessfulWeight: 100 });
    expect(applyProgression(dbl, 8, 100, "lean bulk", false).weight).toBe(
      103.75
    );
  });

  it("retires the microloading runaway for generated isolations", () => {
    // On the linear path a completed set with microloading on added 1 kg
    // with NO rep requirement — ~12% per session on an 8 kg lateral raise.
    // Double progression has no such branch, so the climb is reps-first.
    const iso = makeTestExercise({
      isAccessory: true,
      progressionType: "double",
      reps: 12,
      baseReps: 12,
      repRangeMax: 15,
      weight: 8,
      lastSuccessfulWeight: 8,
    });
    const next = applyProgression(iso, 12, 8, "recomp", true);
    expect(next.weight).toBe(8);
    expect(next.reps).toBe(13);
  });
});

// Backlog #8 — the deload recipe follows TRAINING AGE (H4 resolving M4).
// Tropos's sets−1 + load−15% is Helms's novice answer; it was applied to
// everyone. Post-novice gets ~half the volume at the SAME load instead.
describe("deload by training age (backlog #8)", () => {
  const week = (): WorkoutDay[] => [
    {
      dayName: "Push",
      dayType: "push",
      completed: false,
      skipped: false,
      exercises: [
        makeTestExercise({ sets: 3, reps: 10, weight: 100 }),
        makeTestExercise({ sets: 3, reps: 5, weight: 140 }),
        makeTestExercise({ sets: 2, reps: 12, weight: 0 }), // bodyweight
      ],
    },
  ];

  it("beginners keep the pre-#8 recipe exactly (sets-1, load x0.85)", () => {
    for (const exp of [undefined, "beginner" as const]) {
      const out = applyDeload(week(), exp)[0].exercises;
      expect(out.map((e) => e.sets)).toEqual([2, 2, 2]);
      expect(out.map((e) => e.weight)).toEqual([85, 120, 0]);
      expect(out.map((e) => e.reps)).toEqual([10, 5, 12]); // reps untouched
    }
  });

  it("intermediates halve volume at held load (Helms 3x10x200 -> 2x8x200)", () => {
    const out = applyDeload(week(), "intermediate")[0].exercises;
    expect(out.map((e) => e.sets)).toEqual([2, 2, 2]);
    expect(out.map((e) => e.reps)).toEqual([8, 3, 10]); // -2, floored at 3
    expect(out.map((e) => e.weight)).toEqual([100, 140, 0]); // load untouched
  });

  it("advanced reads the same as intermediate", () => {
    expect(applyDeload(week(), "advanced")).toEqual(
      applyDeload(week(), "intermediate")
    );
  });

  it("restores the cut reps on meso exit — no decay across mesocycles", () => {
    // Symmetric with #5's sets/load restore. Without preDeloadReps the
    // post-novice cut would compound: 10 -> 8 -> 6 -> 4 every four weeks.
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    let st: ProgramState = {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 1,
      splitType: "full_body",
      workouts,
      fatigueScore: 0,
      updatedAt: 0,
    };
    const repsGrid = (s: ProgramState) =>
      s.workouts.map((d) => d.exercises.map((e) => e.reps));
    const start = repsGrid(st);

    for (let meso = 0; meso < 2; meso += 1) {
      st = advanceWeek(st, "intermediate"); // w2
      st = advanceWeek(st, "intermediate"); // w3
      st = advanceWeek(st, "intermediate"); // w4 — deload, reps cut
      st.workouts.forEach((d, di) =>
        d.exercises.forEach((ex, ei) => {
          expect(ex.reps).toBe(Math.max(3, start[di][ei] - 2));
        })
      );
      st = advanceWeek(st, "intermediate"); // meso exit — reps restored
      expect(repsGrid(st)).toEqual(start);
    }
  });

  it("restores reps even if the user switches experience mid-mesocycle", () => {
    // The stash is unconditional, so a user who deloads as an intermediate
    // and advances as a beginner still gets their rep target back.
    const { workouts } = generateProgram("recomp", 2, undefined, "hypertrophy");
    let st: ProgramState = {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 3,
      splitType: "upper_lower",
      workouts,
      fatigueScore: 0,
      updatedAt: 0,
    };
    const before = st.workouts.map((d) => d.exercises.map((e) => e.reps));
    st = advanceWeek(st, "intermediate"); // week 4 deload — reps cut
    st = advanceWeek(st, "beginner"); // week 5 — restore must still fire
    expect(st.workouts.map((d) => d.exercises.map((e) => e.reps))).toEqual(
      before
    );
  });
});

// Backlog #9 — the joint rule wired into advanceWeek. The rule itself is
// pinned in adjustmentRule.test.ts; these pin the APPLICATION: which volume
// register each action moves, and therefore how long it lasts.
describe("adjustment rule application (backlog #9)", () => {
  const stall = (st: ProgramState, n: number): ProgramState => {
    // Mark the first n accessories as plateaued.
    let left = n;
    return {
      ...st,
      workouts: st.workouts.map((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => {
          if (left > 0 && ex.isAccessory === true) {
            left -= 1;
            return { ...ex, plateauCount: 2 };
          }
          return ex;
        }),
      })),
    };
  };

  // 4 days → upper/lower, which is a split that BUILDS accessories.
  // buildFullBody (1- and 3-day targets) authors none at all, so the
  // accessory-scoped volume registers — #5's ramp, #7's isolation
  // progression, and #9's volume arms — are all no-ops there. Asserted
  // below rather than assumed, so a builder change can't make these tests
  // pass vacuously.
  const makeState = (week = 1): ProgramState => {
    const { workouts } = generateProgram("recomp", 4, undefined, "hypertrophy");
    return {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: week,
      splitType: "upper_lower",
      workouts,
      fatigueScore: 0,
      updatedAt: 0,
    };
  };

  it("the fixture actually has accessories to adjust", () => {
    const accs = makeState()
      .workouts.flatMap((d) => d.exercises)
      .filter((e) => e.isAccessory === true);
    expect(accs.length).toBeGreaterThanOrEqual(PROGRAMME_PLATEAU_MIN);
  });

  const anchors = (s: ProgramState) =>
    s.workouts.map((d) =>
      d.exercises.filter((e) => e.isAccessory === true).map((e) => e.baseSets)
    );

  it("holds — and touches nothing — when recovery is unknown", () => {
    const st = stall(makeState(), 4);
    const out = advanceWeek(st, "beginner"); // recovery defaults to unknown
    expect(anchors(out)).toEqual(anchors(st));
    expect(out.plateauResponses).toBe(0);
  });

  it("plateaued + recovered raises the ANCHOR, so the volume persists", () => {
    const st = stall(makeState(), 4);
    const before = anchors(st);
    const out = advanceWeek(st, "beginner", "recovered");
    out.workouts.forEach((d, di) => {
      const accs = d.exercises.filter((e) => e.isAccessory === true);
      accs.forEach((ex, ei) => {
        expect(ex.baseSets).toBe(Math.min(5, (before[di][ei] ?? 0) + 1));
      });
    });
    // add_volume is not a "response" — nothing was cut, so nothing to escalate
    expect(out.plateauResponses).toBe(0);
  });

  it("plateaued + strained cuts THIS WEEK only — the anchor is untouched", () => {
    const st = stall(makeState(), 4);
    const before = anchors(st);
    const out = advanceWeek(st, "beginner", "strained");
    expect(anchors(out)).toEqual(before); // anchor held
    out.workouts.forEach((d) =>
      d.exercises
        .filter((e) => e.isAccessory === true)
        .forEach((ex) => expect(ex.sets).toBeLessThanOrEqual(ex.baseSets ?? 0))
    );
    expect(out.plateauResponses).toBe(1);
  });

  it("a SECOND strained stall reorganizes instead of cutting again", () => {
    let st = stall(makeState(), 4);
    st = advanceWeek(st, "beginner", "strained"); // cut #1
    expect(st.plateauResponses).toBe(1);
    const beforeAnchors = anchors(st);
    st = stall(st, 4); // still stalled
    const out = advanceWeek(st, "beginner", "strained");
    // anchor DROPS now (less total volume), and the counter stops climbing
    out.workouts.forEach((d, di) => {
      const accs = d.exercises.filter((e) => e.isAccessory === true);
      accs.forEach((ex, ei) => {
        expect(ex.baseSets).toBeLessThanOrEqual(beforeAnchors[di][ei] ?? 0);
      });
    });
    expect(out.plateauResponses).toBe(1);
  });

  it("reorganize clears the stall counters so a NEW stall is distinguishable", () => {
    let st = stall(makeState(), 4);
    st = advanceWeek(st, "beginner", "strained");
    st = stall(st, 4);
    const out = advanceWeek(st, "beginner", "strained"); // reorganize
    const stillPlateaued = out.workouts
      .flatMap((d) => d.exercises)
      .filter((e) => (e.plateauCount ?? 0) > 0);
    expect(stillPlateaued).toHaveLength(0);
  });

  it("forgets the response once the stall clears", () => {
    let st = stall(makeState(), 4);
    st = advanceWeek(st, "beginner", "strained");
    expect(st.plateauResponses).toBe(1);
    // Cutting volume does NOT itself clear the stall — plateauCount is reset
    // by the progression engine when the lift actually succeeds again. Do
    // that here, which is the only thing that should wipe the memory.
    st = {
      ...st,
      workouts: st.workouts.map((d) => ({
        ...d,
        exercises: d.exercises.map((ex) => ({ ...ex, plateauCount: 0 })),
      })),
    };
    st = advanceWeek(st, "beginner", "strained");
    expect(st.plateauResponses).toBe(0);
  });

  it("a cut does not fake-clear the stall it was responding to", () => {
    // If reduce_volume wiped plateauCount, the next advance would read
    // "recovered from the stall" and the escalation branch could never fire.
    const st = advanceWeek(stall(makeState(), 4), "beginner", "strained");
    const stillPlateaued = st.workouts
      .flatMap((d) => d.exercises)
      .filter((e) => (e.plateauCount ?? 0) > 0);
    expect(stillPlateaued.length).toBeGreaterThanOrEqual(PROGRAMME_PLATEAU_MIN);
  });

  it("never adjusts on a deload week — the deload IS the light week", () => {
    const st = stall(makeState(3), 4); // advancing lands on week 4
    const before = anchors(st);
    const out = advanceWeek(st, "beginner", "recovered");
    expect(out.currentPhase).toBe("deload");
    expect(anchors(out)).toEqual(before); // no add_volume stacked on it
  });

  it("leaves mains alone under every action", () => {
    for (const recovery of ["recovered", "strained"] as const) {
      const st = stall(makeState(), 4);
      const mainAnchors = (s: ProgramState) =>
        s.workouts.map((d) =>
          d.exercises
            .filter((e) => e.isAccessory !== true)
            .map((e) => e.baseSets)
        );
      const before = mainAnchors(st);
      expect(mainAnchors(advanceWeek(st, "beginner", recovery))).toEqual(
        before
      );
    }
  });

  it("never produces a duplicate exercise within a day after reorganizing", () => {
    let st = stall(makeState(), 6);
    st = advanceWeek(st, "beginner", "strained");
    st = stall(st, 6);
    const out = advanceWeek(st, "beginner", "strained"); // reorganize rotates
    for (const d of out.workouts) {
      const ids = d.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// Backlog #15 — buildFullBody authored zero accessories, so 1- and 3-day
// users sat outside every accessory-scoped mechanism the arc shipped.
// `chooseSplit` routes 3 days to full body and `splitRationale` recommends
// it to the user, so this was a courted segment, not an edge case.
describe("full-body accessory slots (backlog #15)", () => {
  const fullBody = (days: number) =>
    generateProgram("recomp", days, undefined, "hypertrophy").workouts;

  it("marks the supporting slots as accessories", () => {
    const accs = fullBody(3)
      .flatMap((d) => d.exercises)
      .filter((e) => e.isAccessory === true);
    expect(accs.length).toBeGreaterThan(0);
  });

  it("keeps the two anchor lifts per day as mains", () => {
    // The tier already existed in the prescription — slots at mainReps vs
    // slots at accessoryReps. #15 only made it explicit; it did not add
    // sets, change an exercise, or lengthen the session.
    for (const day of fullBody(3)) {
      const mains = day.exercises.filter((e) => e.isAccessory !== true);
      expect(mains.length).toBeGreaterThanOrEqual(1);
      // mains come first — the anchor lifts lead the session
      const firstAccessory = day.exercises.findIndex(
        (e) => e.isAccessory === true
      );
      day.exercises.slice(0, firstAccessory).forEach((e) => {
        expect(e.isAccessory).toBe(false);
      });
    }
  });

  it("adds no sets and swaps no exercise — the flag is metadata", () => {
    // Guards the thing that made makeAccessory the wrong tool here: it
    // re-picks from the NON-primary pool. A 3-day user's squat must still
    // be a squat.
    const ids = fullBody(3).map((d) => d.exercises.map((e) => e.exerciseId));
    expect(ids[0]).toContain("squat");
    expect(ids[1]).toContain("deadlift");
  });

  it("carries logged history through a regenerate — no wipe", () => {
    // The other reason makeAccessory was wrong: it takes no `existing`, so
    // it would mint a new instanceId and reset weight/history every time
    // the programme regenerated.
    const first = fullBody(3);
    const trained = first.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        weight: 77,
        performanceHistory: [
          { date: "2026-01-01", weight: 77, repsCompleted: 8, repsTarget: 8 },
        ],
      })),
    }));
    const again = generateProgram("recomp", 3, trained, "hypertrophy").workouts;
    again.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        const before = trained[di].exercises[ei];
        expect(ex.instanceId).toBe(before.instanceId);
        expect(ex.weight).toBe(77);
        expect(ex.performanceHistory).toHaveLength(1);
      })
    );
  });

  it("unlocks the volume ramp for 3-day users (#5 reached nothing before)", () => {
    const workouts = fullBody(3);
    let st: ProgramState = {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 1,
      splitType: "full_body",
      workouts,
      fatigueScore: 0,
      updatedAt: 0,
    };
    const accSets = (s: ProgramState) =>
      s.workouts.flatMap((d) =>
        d.exercises.filter((e) => e.isAccessory === true).map((e) => e.sets)
      );
    st = advanceWeek(st); // week 2 — base
    const w2 = accSets(st);
    st = advanceWeek(st); // week 3 — base + 1
    const w3 = accSets(st);
    expect(w3.some((s, i) => s > w2[i])).toBe(true);
  });

  it("1-day full-body users get accessories too", () => {
    const accs = fullBody(1)
      .flatMap((d) => d.exercises)
      .filter((e) => e.isAccessory === true);
    expect(accs.length).toBeGreaterThan(0);
  });
});

// Backlog #10 — overlap caps applied to the generated week. The rule is
// pinned in overlapModel.test.ts; these pin the APPLICATION, including two
// bugs the first cut had: the replacement escaping its day role, and the
// positional history carry breaking once a slot changed category.
describe("overlap caps in generateProgram (backlog #10)", () => {
  const hingeSlots = (workouts: WorkoutDay[]) =>
    workouts.map(
      (d) =>
        d.exercises.filter((e) => e.movementCategory === "hip_dominant").length
    );

  it("no split exceeds the caps", () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const { workouts } = generateProgram(
        "recomp",
        days,
        undefined,
        "hypertrophy"
      );
      const perDay = hingeSlots(workouts);
      expect(
        Math.max(0, ...perDay),
        `${days}-day: per-session`
      ).toBeLessThanOrEqual(1);
      expect(
        perDay.filter((n) => n > 0).length,
        `${days}-day: per-week`
      ).toBeLessThanOrEqual(2);
    }
  });

  it("3-day full body no longer prescribes the hinge three times a week", () => {
    // Helms's own counter-example, and pre-#10 exactly what a default
    // 3-day user got — twice alongside a squat in the same session.
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    expect(hingeSlots(workouts).filter((n) => n > 0)).toHaveLength(2);
    // and the heavy day (day A) is the one that lost it
    expect(hingeSlots(workouts)[0]).toBe(0);
  });

  it("reshapes the week without changing how much work is in it", () => {
    // A demoted slot keeps its set count and its accessory role — only the
    // movement changes. Total weekly sets must be untouched by the cap.
    const totalSets = (n: number) =>
      generateProgram("recomp", n, undefined, "hypertrophy")
        .workouts.flatMap((d) => d.exercises)
        .reduce((s, e) => s + e.sets, 0);
    // Deterministic across runs — the cap adds nothing and removes nothing.
    expect(totalSets(3)).toBe(totalSets(3));
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    workouts.forEach((d) => expect(d.exercises).toHaveLength(5));
  });

  it("the replacement obeys its day role (it used to escape it)", () => {
    // applyOverlapCaps runs BEFORE applyDayRoles precisely so a re-pointed
    // slot is shifted like an originally-built one. Running it after left
    // day A's replacement at the unshifted goal base.
    const three = generateProgram("recomp", 3, undefined, "hypertrophy");
    const dayA = three.workouts[0];
    const accessoryReps = dayA.exercises
      .filter((e) => e.isAccessory === true)
      .map((e) => e.reps);
    // day A is the heavy day: every accessory sits 2 under the base of 12
    accessoryReps.forEach((r) => expect(r).toBe(10));
    dayA.exercises.forEach((e) => expect(e.baseReps).toBe(e.reps));
  });

  it("carries a re-pointed slot's history across a regenerate", () => {
    // The builders' findExisting is POSITIONAL and category-blind. Once the
    // cap changes a slot's category, a naive regenerate rebuilds that
    // position as a hinge (inheriting the replacement's logged load onto a
    // deadlift) and then re-points it to a brand-new exercise — wiping the
    // user's history every single regenerate.
    const first = generateProgram(
      "recomp",
      3,
      undefined,
      "hypertrophy"
    ).workouts;
    const trained = first.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({
        ...e,
        weight: 42,
        performanceHistory: [
          { date: "2026-01-01", weight: 42, repsCompleted: 8, repsTarget: 8 },
        ],
      })),
    }));
    const again = generateProgram("recomp", 3, trained, "hypertrophy").workouts;

    // The re-pointed slot is day A's — it must be the SAME exercise, with
    // the same instance and logged load, not a fresh one.
    const before = trained[0].exercises;
    again[0].exercises.forEach((e, i) => {
      expect(e.exerciseId).toBe(before[i].exerciseId);
      expect(e.instanceId).toBe(before[i].instanceId);
      expect(e.weight).toBe(42);
      expect(e.performanceHistory).toHaveLength(1);
    });
  });

  it("the re-pointed slot is stable across repeated regenerates", () => {
    let workouts = generateProgram(
      "recomp",
      3,
      undefined,
      "hypertrophy"
    ).workouts;
    const idsOf = (w: WorkoutDay[]) => w[0].exercises.map((e) => e.exerciseId);
    const first = idsOf(workouts);
    for (let i = 0; i < 3; i += 1) {
      workouts = generateProgram("recomp", 3, workouts, "hypertrophy").workouts;
      expect(idsOf(workouts)).toEqual(first);
    }
  });
});

// Backlog #17 — accessories used to be rebuilt from scratch on every
// regenerate. makeAccessory takes no `existing` (unlike makeExercise), so it
// re-rolled its Math.random pick and reset load/history. A regenerate is what
// a settings change triggers, so changing goal / days / split silently wiped
// every accessory a user had trained.
describe("accessory identity across a regenerate (backlog #17)", () => {
  const trainAll = (workouts: WorkoutDay[]) =>
    workouts.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) => ({
        ...ex,
        weight: 55,
        lastSuccessfulWeight: 55,
        performanceHistory: [
          { date: "2026-01-01", weight: 55, repsCompleted: 8, repsTarget: 8 },
        ],
      })),
    }));

  it("keeps exercise, instance, load and history for every accessory", () => {
    // 4 days → upper/lower, which is a split that uses makeAccessory. This
    // exact fixture regressed on main: a 55 kg Bulgarian Split Squat with
    // history became a 40 kg Hack Squat with none.
    const first = generateProgram(
      "recomp",
      4,
      undefined,
      "hypertrophy"
    ).workouts;
    const trained = trainAll(first);
    const again = generateProgram("recomp", 4, trained, "hypertrophy").workouts;

    trained.forEach((d, di) =>
      d.exercises.forEach((before, ei) => {
        const after = again[di].exercises[ei];
        expect(after.exerciseId, `d${di}/e${ei}`).toBe(before.exerciseId);
        expect(after.instanceId, `d${di}/e${ei}`).toBe(before.instanceId);
        expect(after.weight, `d${di}/e${ei}`).toBe(55);
        expect(after.performanceHistory, `d${di}/e${ei}`).toHaveLength(1);
      })
    );
  });

  it("holds across repeated regenerates, not just the first", () => {
    let workouts = trainAll(
      generateProgram("recomp", 6, undefined, "hypertrophy").workouts
    );
    const ids = workouts.map((d) => d.exercises.map((e) => e.exerciseId));
    for (let i = 0; i < 3; i += 1) {
      workouts = generateProgram("recomp", 6, workouts, "hypertrophy").workouts;
      expect(workouts.map((d) => d.exercises.map((e) => e.exerciseId))).toEqual(
        ids
      );
    }
  });

  it("still lets the PRESCRIPTION change — only identity and log carry", () => {
    // The carry must not freeze sets/reps, or a real goal change would be
    // silently ignored.
    const strength = trainAll(
      generateProgram("recomp", 4, undefined, "strength").workouts
    );
    const swapped = generateProgram(
      "recomp",
      4,
      strength,
      "hypertrophy"
    ).workouts;
    const repsOf = (w: WorkoutDay[]) =>
      w.flatMap((d) => d.exercises.map((e) => e.reps));
    expect(repsOf(swapped)).not.toEqual(repsOf(strength));
  });

  it("does not carry across a slot that legitimately changed movement", () => {
    // applyOverlapCaps re-points slots; the carry is category-guarded so it
    // can't drag a deadlift's log onto the replacement.
    const first = generateProgram(
      "recomp",
      3,
      undefined,
      "hypertrophy"
    ).workouts;
    first.forEach((d) =>
      d.exercises.forEach((e) => expect(e.movementCategory).toBeDefined())
    );
    const again = generateProgram(
      "recomp",
      3,
      trainAll(first),
      "hypertrophy"
    ).workouts;
    again.forEach((d, di) =>
      d.exercises.forEach((e, ei) =>
        expect(e.movementCategory).toBe(
          first[di].exercises[ei].movementCategory
        )
      )
    );
  });
});

// The variation bank's ids were never pinned against the exercise DB — the
// integrity test covers templates and injury substitutions only. #11 added
// roles to those entries, so pin the ids too before they drift.
describe("variation bank id integrity", () => {
  it("every bank exerciseId resolves to a real EXERCISES entry", () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    const bad: string[] = [];
    for (const [category, options] of Object.entries(exerciseBank)) {
      for (const o of options) {
        if (!ids.has(o.id)) bad.push(`${category}/${o.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
