import { describe, it, expect } from "vitest";
import {
  applyProgression,
  applyDeload,
  advanceWeek,
  computeFatigueScore,
  generateProgram,
  generateWeekPrescription,
  expectedDayCount,
  calculateE1RM,
  getProgressionDirection,
  getProgressionLabel,
  goalProfileFor,
  applyFatigue,
  dedupeDayExercises,
} from "../programEngine";
import type {
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
    // Hit ceiling (14+2=16) → weight increase
    const result = applyProgression(ex, 16, 30, "recomp", false);
    expect(result.weight).toBe(32.5);
    expect(result.reps).toBe(12); // baseReps anchor
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

// ── calculateE1RM (Epley) ────────────────────
describe("calculateE1RM", () => {
  it("returns the lifted weight at 1 rep", () => {
    expect(calculateE1RM(100, 1)).toBeCloseTo(103.33, 2);
  });

  it("returns the bare weight at 0 reps (degenerate)", () => {
    expect(calculateE1RM(100, 0)).toBe(100);
  });

  it("scales with reps per the Epley 1 + reps/30 factor", () => {
    expect(calculateE1RM(100, 10)).toBeCloseTo(133.33, 2);
    expect(calculateE1RM(60, 5)).toBeCloseTo(70, 5);
  });
});

// ── getProgressionDirection / Label ──────────
describe("getProgressionDirection", () => {
  it("is stable when there's no prior attempt", () => {
    expect(
      getProgressionDirection(makeTestExercise({ lastAttemptedWeight: 0 }))
    ).toBe("stable");
  });

  it("reads up / down / stable off the weight delta", () => {
    expect(
      getProgressionDirection(
        makeTestExercise({ weight: 65, lastAttemptedWeight: 60 })
      )
    ).toBe("up");
    expect(
      getProgressionDirection(
        makeTestExercise({ weight: 55, lastAttemptedWeight: 60 })
      )
    ).toBe("down");
    expect(
      getProgressionDirection(
        makeTestExercise({ weight: 60, lastAttemptedWeight: 60 })
      )
    ).toBe("stable");
  });
});

describe("getProgressionLabel", () => {
  it("shows an up arrow for a weight increase", () => {
    expect(
      getProgressionLabel(
        makeTestExercise({ weight: 65, lastAttemptedWeight: 60 })
      )
    ).toBe("65kg ↑");
  });

  it("shows a down arrow for a regression", () => {
    expect(
      getProgressionLabel(
        makeTestExercise({ weight: 55, lastAttemptedWeight: 60 })
      )
    ).toBe("55kg ↓");
  });

  it("renders BW (no kg) for bodyweight exercises", () => {
    expect(
      getProgressionLabel(
        makeBodyweightExercise({ weight: 0, lastAttemptedWeight: 0 })
      )
    ).toBe("BW");
  });

  it("renders the plain weight when stable", () => {
    expect(
      getProgressionLabel(
        makeTestExercise({ weight: 60, lastAttemptedWeight: 60 })
      )
    ).toBe("60kg");
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
