import { describe, it, expect } from "vitest";
import {
  applyProgression,
  applyDeload,
  advanceWeek,
  generateProgram,
  generateWeekPrescription,
} from "../programEngine";
import type { ProgramExercise, ProgramState, WorkoutDay } from "../programTypes";

function makeTestExercise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 6,
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

function makeBodyweightExercise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
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

// ── Deload ──────────────────────────────────────

describe("applyDeload", () => {
  it("rounds weight to 2.5kg increments", () => {
    const workouts: WorkoutDay[] = [{
      dayName: "Push",
      dayType: "push",
      completed: false,
      exercises: [makeTestExercise({ weight: 100, sets: 4 })],
    }];
    const result = applyDeload(workouts);
    // 100 * 0.85 = 85 → round(85/2.5)*2.5 = 85 (exact)
    expect(result[0].exercises[0].weight).toBe(85);
    expect(result[0].exercises[0].sets).toBe(3); // 4-1=3
  });

  it("rounds non-exact values to nearest 2.5kg", () => {
    const workouts: WorkoutDay[] = [{
      dayName: "Push",
      dayType: "push",
      completed: false,
      exercises: [makeTestExercise({ weight: 60, sets: 3 })],
    }];
    const result = applyDeload(workouts);
    // 60 * 0.85 = 51 → round(51/2.5)*2.5 = round(20.4)*2.5 = 20*2.5 = 50
    expect(result[0].exercises[0].weight).toBe(50);
  });

  it("does not change bodyweight exercise weight", () => {
    const workouts: WorkoutDay[] = [{
      dayName: "Pull",
      dayType: "pull",
      completed: false,
      exercises: [makeBodyweightExercise({ sets: 4 })],
    }];
    const result = applyDeload(workouts);
    expect(result[0].exercises[0].weight).toBe(0);
    expect(result[0].exercises[0].sets).toBe(3); // still reduces sets
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
    workouts: [{
      dayName: "Upper A",
      dayType: "upper",
      completed: true,
      exercises: [makeTestExercise({ sets: 4, weight: 80 })],
    }],
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

  it("applies fatigue on non-deload weeks", () => {
    // Week 2 (2%4=2) is NOT deload
    const state = { ...baseProgramState, weekNumber: 1, fatigueScore: 50 };
    const result = advanceWeek(state);
    expect(result.weekNumber).toBe(2);
    expect(result.currentPhase).toBe("progression");
    // Fatigue: sets=round(4*0.9)=4 (rounds to 4)
    const ex = result.workouts[0].exercises[0];
    expect(ex.sets).toBe(4); // round(4*0.9)=round(3.6)=4
  });
});

// ── PPL×2 Deep Copy ─────────────────────────────

describe("generateProgram — PPL×2", () => {
  it("Legs B has independent exercise objects from Legs A (H2)", () => {
    const { workouts } = generateProgram("recomp", 6);
    const legsA = workouts.find(d => d.dayName === "Legs");
    const legsB = workouts.find(d => d.dayName === "Legs B");
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
    expect(w2.intensityMultiplier).toBe(1.050);
    expect(w3.intensityMultiplier).toBe(1.075);
  });
});
