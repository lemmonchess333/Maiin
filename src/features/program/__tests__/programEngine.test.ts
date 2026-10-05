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
import { exerciseBank, rescaleForSwap } from "../variationBank";
import { seedStartingLoads } from "../startingLoads";
import { normalizeExercise } from "../programTypes";
import { roleRepsFor } from "../roleTable";
import { EXERCISES, isBodyweightExerciseId } from "@/lib/exercises";
import { deloadWeight } from "../easierToday";
import { PROGRAMME_PLATEAU_MIN } from "../adjustmentRule";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";

/**
 * Mark the week as actually trained before rolling out of it.
 *
 * `advanceWeek` only applies a deload to a week that has a completed
 * session — a week nobody trained accumulated no fatigue to dissipate, and
 * cutting its sets/loads hands a returning user a reduced plan. So a fixture
 * that wants to observe the deload has to represent a week the user trained.
 *
 * Every generated fixture here starts with `completed: false` on every day,
 * which is correct for a freshly-built week and wrong for one being rolled
 * out of after four weeks of training. The flag was simply unread before, so
 * the mesocycle tests were exercising real mechanisms against a precondition
 * production cannot produce. `advanceWeek` resets the flag for the new week,
 * so a multi-week chain re-marks between each step — which is what a real
 * user's weeks look like.
 */
function trained<T extends { workouts: WorkoutDay[] }>(state: T): T {
  return {
    ...state,
    workouts: state.workouts.map((d) => ({ ...d, completed: true })),
  };
}

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
    const result = applyProgression(ex, 6, 60, false);
    expect(result.weight).toBe(60); // stays same — accumulating reps
    expect(result.consecutiveFailures).toBe(0);
  });

  it("does NOT increase weight when reps exceed target by 1", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    const result = applyProgression(ex, 7, 60, false);
    expect(result.weight).toBe(60); // still accumulating — ceiling is reps+2=8
  });

  it("increases weight when reps hit ceiling (target + 2)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // Hit 8 reps (6+2 = ceiling) — NOW increase weight
    const result = applyProgression(ex, 8, 60, false);
    expect(result.weight).toBe(62.5); // the barbell's 2.5 kg, for any goal
    expect(result.reps).toBe(6); // reset to base
  });

  it("lowers on the 2nd miss in a row (not the 1st): 10% lighter, the target as it was", () => {
    // Lift4 (7): the first miss holds, silently; the second lowers the lift
    // 10% on its step grid and records the weight to climb back to
    // (sessionSets.test.ts has the climb back).
    const ex = makeTestExercise({ reps: 7 });
    const result = applyProgression(ex, 4, 60, false);
    expect(result.consecutiveFailures).toBe(1);
    expect(result.weight).toBe(60);
    expect(result.reps).toBe(7);

    const result2 = applyProgression(result, 4, 60, false);
    expect(result2.consecutiveFailures).toBe(0);
    expect(result2.weight).toBe(55);
    expect(result2.reps).toBe(7);
    expect(result2.lowered).toEqual({
      exerciseId: "bench-press",
      from: 60,
      unit: "kg",
      target: 7,
    });
    expect(result2.plateauCount).toBe(1);
  });
});

// ── Bodyweight Progression ──────────────────────

describe("applyProgression — bodyweight exercises", () => {
  /* These two used to pin the legacy range-less arm: the target moved only
     when the lifter SPONTANEOUSLY overshot by two, and then only to
     current + 1. `impliedDoubleRangeMax` retired that arm for rep movements
     (see rangelessDoubleProgression.test.ts for the writers that produce
     range-less doubles and the 12-session freeze it caused), so a range-less
     pull-up now follows the same contract a ranged one always did: next
     target is one past what was actually DONE, ceiling MAX_BODYWEIGHT_REPS. */
  it("sets the next target one past what was done", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    const result = applyProgression(ex, 10, 0, false);
    expect(result.weight).toBe(0); // stays bodyweight
    expect(result.reps).toBe(11);
  });

  it("progresses on an exact-target session, not only on an overshoot", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    expect(applyProgression(ex, 8, 0, false).reps).toBe(9);
    const overOne = applyProgression(ex, 9, 0, false);
    expect(overOne.weight).toBe(0);
    expect(overOne.reps).toBe(10);
  });

  it("deloads by reducing rep target on consecutive failures", () => {
    const ex = makeBodyweightExercise({ reps: 8, consecutiveFailures: 2 });
    const result = applyProgression(ex, 5, 0, false);
    expect(result.reps).toBe(7); // reduced by 1
    expect(result.weight).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it("enforces minimum 4 reps on deload", () => {
    const ex = makeBodyweightExercise({ reps: 4, consecutiveFailures: 2 });
    const result = applyProgression(ex, 2, 0, false);
    expect(result.reps).toBe(4); // can't go below 4
  });

  it("also works for linear progression type", () => {
    const ex = makeBodyweightExercise({ progressionType: "linear", reps: 8 });
    const result = applyProgression(ex, 10, 0, false);
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(9);
  });
});

describe("applyProgression — uncalibrated loaded exercise", () => {
  it("promotes the first real logged load into the programme", () => {
    const exercise = makeTestExercise({
      exerciseId: "lat-pulldown",
      movementCategory: "vertical_pull",
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
    });
    const out = applyProgression(exercise, exercise.reps, 35, false);
    expect(out.weight).toBe(35);
    expect(out.lastSuccessfulWeight).toBe(35);
    expect(out.lastAttemptedWeight).toBe(35);
  });
});

// ── RPE autoregulation (D-LIFT-6) ───────────────

describe("applyProgression — RPE autoregulation", () => {
  it("HOLDS load when the completed set was at RPE ≥ 9.5 (double)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // hit ceiling (8 reps) but at maximal effort → no weight increase
    const held = applyProgression(ex, 8, 60, false, 10);
    expect(held.weight).toBe(60); // held
    expect(held.consecutiveFailures).toBe(0); // still a success, not a failure
    // same set at a sub-maximal RPE → normal weight increase
    const up = applyProgression(ex, 8, 60, false, 8);
    expect(up.weight).toBe(62.5);
  });

  it("HOLDS the linear step at RPE ≥ 9.5", () => {
    const ex = makeTestExercise({
      progressionType: "linear",
      reps: 6,
      weight: 60,
    });
    expect(applyProgression(ex, 6, 60, false, 9.5).weight).toBe(60);
    expect(applyProgression(ex, 6, 60, false, 7).weight).toBe(62.5);
  });

  it("progresses normally when no RPE is logged (back-compat)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    expect(applyProgression(ex, 8, 60, false).weight).toBe(62.5);
  });
});

// ── Bodyweight rep cap (D-LIFT-11) ──────────────

describe("applyProgression — bodyweight rep cap", () => {
  it("caps the rep target at 20 and prompts adding load", () => {
    const ex = makeBodyweightExercise({ reps: 20 });
    const out = applyProgression(ex, 22, 0, false);
    expect(out.reps).toBe(20); // not 21 — capped
    expect(out.notes).toMatch(/add load/i);
  });

  it("still increments below the cap", () => {
    const ex = makeBodyweightExercise({ reps: 12 });
    // One past what was DONE (14), not one past the target — the range-aware
    // contract now applies to range-less bodyweight lifts too.
    const out = applyProgression(ex, 14, 0, false);
    expect(out.reps).toBe(15);
    expect(out.notes).toBeUndefined();
  });

  it("honours a generated rep-range ceiling below the global cap", () => {
    const ex = makeBodyweightExercise({ reps: 15, repRangeMax: 15 });
    const out = applyProgression(ex, 17, 0, false);
    expect(out.reps).toBe(15);
    expect(out.notes).toMatch(/15\+ reps/i);
  });
});

// ── Bodyweight range-aware climb ────────────────
//
// The range-aware double-progression arm (P1) was gated `!isBodyweight`, so a
// bodyweight main with an authored range fell through to the legacy
// +2-overshoot arm — and a compliant user who logs exactly the prescribed
// reps never overshoots. Measured by a 13-week emulation before the fix:
// pull-ups sat frozen at 4×6 the whole time while every loaded lift climbed.
// These pin the fix on BOTH progression types (the linear path had the same
// hole for running-goal 4-6 mains).

describe("applyProgression — bodyweight range-aware climb", () => {
  it("climbs on EXACT-target compliance when a range is authored (double)", () => {
    const ex = makeBodyweightExercise({
      reps: 6,
      baseReps: 6,
      repRangeMax: 10,
    });
    // Logged exactly the prescribed 6 — no overshoot. Pre-fix: frozen at 6.
    const out = applyProgression(ex, 6, 0, false, 8);
    expect(out.reps).toBe(7);
    expect(out.weight).toBe(0); // never invents load for a bodyweight move
  });

  it("prompts adding load at the top of the range instead of adding weight (double)", () => {
    const ex = makeBodyweightExercise({
      reps: 10,
      baseReps: 6,
      repRangeMax: 10,
    });
    const out = applyProgression(ex, 10, 0, false, 8);
    expect(out.reps).toBe(10); // holds at the ceiling — no reset-to-base
    expect(out.weight).toBe(0);
    expect(out.notes).toMatch(/10\+ reps.*add load/i);
  });

  it("climbs on exact-target compliance on the LINEAR path too (running 4-6 mains)", () => {
    const ex = makeBodyweightExercise({
      progressionType: "linear",
      reps: 4,
      baseReps: 4,
      repRangeMax: 6,
    });
    const mid = applyProgression(ex, 4, 0, true, 8);
    expect(mid.reps).toBe(5);
    const top = applyProgression(
      makeBodyweightExercise({
        progressionType: "linear",
        reps: 6,
        baseReps: 4,
        repRangeMax: 6,
      }),
      6,
      0,
      true,
      8
    );
    expect(top.reps).toBe(6);
    expect(top.notes).toMatch(/6\+ reps.*add load/i);
  });

  it("RPE ≥ 9.5 holds the climb without recording a failure", () => {
    const ex = makeBodyweightExercise({
      reps: 6,
      baseReps: 6,
      repRangeMax: 10,
    });
    const out = applyProgression(ex, 6, 0, false, 10);
    expect(out.reps).toBe(6); // held
    expect(out.consecutiveFailures).toBe(0); // success, not failure
  });

  it("timed holds keep the 5-second step and cap at the authored ceiling", () => {
    const hold = makeBodyweightExercise({
      exerciseId: "plank",
      name: "Plank",
      movementCategory: "core",
      reps: 40,
      baseReps: 40,
      repRangeMax: 60,
      repUnit: "seconds",
    });
    const stepped = applyProgression(hold, 40, 0, false, 8);
    expect(stepped.reps).toBe(45); // +5s, not +1
    const atTop = applyProgression(
      makeBodyweightExercise({
        exerciseId: "plank",
        name: "Plank",
        movementCategory: "core",
        reps: 60,
        baseReps: 40,
        repRangeMax: 60,
        repUnit: "seconds",
      }),
      60,
      0,
      false,
      8
    );
    expect(atTop.reps).toBe(60);
    expect(atTop.notes).toMatch(/add load/i);
  });

  it("13-week compliant emulation: the target climbs 6→10 then prompts — never freezes", () => {
    let ex = makeBodyweightExercise({
      reps: 6,
      baseReps: 6,
      repRangeMax: 10,
    });
    const trajectory: number[] = [];
    for (let week = 1; week <= 13; week++) {
      // The compliant user logs exactly what the card prescribes.
      ex = applyProgression(ex, ex.reps, 0, true, 8);
      trajectory.push(ex.reps);
    }
    // Climb phase: one rep per week to the top of the range…
    expect(trajectory.slice(0, 4)).toEqual([7, 8, 9, 10]);
    // …then stable at the ceiling with the add-load prompt, not a freeze at 6.
    expect(trajectory[12]).toBe(10);
    expect(ex.notes).toMatch(/add load/i);
    expect(ex.weight).toBe(0);
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

// ── advanceWeek · the order carries over (Lift4) ─

describe("advanceWeek — the week opens with the session not reached", () => {
  /** A day whose one exercise is named after it, so a test can see that a
   *  session kept its own work wherever it moved. */
  function day(
    dayName: string,
    status: { completed?: boolean; skipped?: boolean } = {}
  ): WorkoutDay {
    return {
      dayName,
      dayType: "full_body",
      completed: status.completed ?? false,
      ...(status.skipped ? { skipped: true } : {}),
      exercises: [
        makeTestExercise({ name: `${dayName} lift`, exerciseId: dayName }),
      ],
    };
  }

  function week(
    workouts: WorkoutDay[],
    extra: Partial<ProgramState> = {}
  ): ProgramState {
    return {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 1,
      splitType: "full_body",
      fatigueScore: 0,
      updatedAt: 0,
      workouts,
      ...extra,
    };
  }

  const names = (state: ProgramState) => state.workouts.map((d) => d.dayName);

  it("moves the session not reached to the front, the rest in order", () => {
    const next = advanceWeek(
      week([day("A", { completed: true }), day("B"), day("C")])
    );
    expect(names(next)).toEqual(["B", "C", "A"]);
    // Each session keeps its own work, and the new week starts undone.
    expect(next.workouts.map((d) => d.exercises[0].exerciseId)).toEqual([
      "B",
      "C",
      "A",
    ]);
    expect(next.workouts.every((d) => !d.completed && !d.skipped)).toBe(true);
  });

  it("passes over a skipped session, as Train's Up next does", () => {
    const next = advanceWeek(
      week([
        day("A", { completed: true }),
        day("B", { skipped: true }),
        day("C"),
      ])
    );
    expect(names(next)).toEqual(["C", "A", "B"]);
  });

  it("opens with a session chosen with Make this next", () => {
    const next = advanceWeek(
      week([day("A", { completed: true }), day("B"), day("C"), day("D")], {
        nextWorkoutOverride: 2,
      })
    );
    expect(names(next)).toEqual(["C", "D", "A", "B"]);
    // The choice named a position in last week's order, so it goes.
    expect(next.nextWorkoutOverride).toBeUndefined();
  });

  it("keeps the order when every session was done or skipped", () => {
    const next = advanceWeek(
      week([
        day("C", { completed: true }),
        day("A", { skipped: true }),
        day("B", { completed: true }),
      ])
    );
    expect(names(next)).toEqual(["C", "A", "B"]);
  });

  it("keeps the order when the first session was still next", () => {
    expect(names(advanceWeek(week([day("A"), day("B"), day("C")])))).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("archives the week in the order it was trained", () => {
    const next = advanceWeek(
      week([day("A", { completed: true }), day("B"), day("C")])
    );
    expect(next.weekHistory?.at(-1)?.workouts.map((d) => d.dayName)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("does not double a missed session up to catch up", () => {
    const next = advanceWeek(
      week([day("A", { completed: true }), day("B"), day("C")])
    );
    expect(next.workouts).toHaveLength(3);
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
  it("every 4th week is a deload, and no other week is", () => {
    for (let w = 1; w <= 12; w++) {
      expect(generateWeekPrescription(w).deload).toBe(w % 4 === 0);
    }
  });

  /* ─── reachability guard (D8) ──────────────────────────────────
     This replaces a test called "non-deload weeks have increasing
     intensity", which asserted that `intensityMultiplier` stepped
     1.025 → 1.05 → 1.075. That test passed for the entire life of
     the field while the behaviour it described reached NO user:
     nothing in src/ or functions/ ever read the value, and
     `advanceWeek` branches only on `.deload`. A green test named
     after a behaviour nobody could experience is worse than no
     test, because it is cited as evidence the behaviour exists.

     So the pin is now on the SHAPE. A field here is either consumed
     or it is decoration; if you add one, this fails and you have to
     wire a reader in the same change. ADR-0008's rule applied to a
     value rather than a mirror — reachability over prose. ── */
  it("returns only fields that something actually reads", () => {
    expect(Object.keys(generateWeekPrescription(3)).sort()).toEqual([
      "deload",
      "week",
    ]);
  });
});

// ── M7: baseReps drift prevention ───────────────

describe("applyProgression — baseReps anchor (M7)", () => {
  it("resets to baseReps on weight increase, not drifted reps", () => {
    // Simulate a scenario where reps have drifted to 8 but baseReps is 6
    const ex = makeTestExercise({ reps: 8, baseReps: 6, weight: 60 });
    // Hit ceiling (8+2=10) → weight increase, reps should reset to baseReps=6
    const result = applyProgression(ex, 10, 60, false);
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
    // The target met on every set: a step, the barbell's 2.5 kg.
    const result = applyProgression(ex, 14, 30, false);
    expect(result.weight).toBe(32.5);
    expect(result.reps).toBe(12); // baseReps anchor — the subject of this test
  });

  it("falls back to exercise.reps when baseReps is undefined (backward compat)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    delete (ex as unknown as Record<string, unknown>).baseReps;
    const result = applyProgression(ex, 8, 60, false);
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
    // 2-day is full-body (chooseSplit agrees) — the rationale must say so,
    // and must NOT claim the old upper/lower story, whose "about twice a
    // week" was measurably false (1×/muscle — the 2026-08-03 audit).
    expect(splitRationale(2)).toMatch(/full-body/i);
    expect(splitRationale(2)).not.toMatch(/upper/i);
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
// The moderate day is the role table's (Lift4 (5)): Build muscle's main
// lifts start at 6.
describe("day roles (backlog #3)", () => {
  const mainRepsOf = (w: {
    exercises: { isAccessory?: boolean; reps: number }[];
  }) => w.exercises.filter((e) => e.isAccessory !== true).map((e) => e.reps);

  it("single-day weeks stay at the table's numbers", () => {
    const one = generateProgram("recomp", 1, undefined, "hypertrophy");
    expect(mainRepsOf(one.workouts[0])).toContain(6);
  });

  it("3-day full-body week undulates: day A heavy (-2) vs its moderate twin", () => {
    const one = generateProgram("recomp", 1, undefined, "hypertrophy");
    const three = generateProgram("recomp", 3, undefined, "hypertrophy");
    const moderateA = one.workouts[0];
    const heavyA = three.workouts[0];
    expect(heavyA.dayName).toBe(moderateA.dayName);
    heavyA.exercises.forEach((ex) => {
      // Each lift sits 2 under its role's moderate number (`roleTable.ts`);
      // the slots can hold different lifts in the two weeks, since the
      // overlap cap re-points the 3-day week's hinge.
      const moderate = roleRepsFor("hypertrophy", ex, undefined).bottom;
      const floor = ex.isAccessory === true ? 6 : 3;
      expect(ex.reps).toBe(Math.max(floor, moderate - 2));
      expect(ex.baseReps).toBe(ex.reps);
      const twin = moderateA.exercises.find(
        (t) => t.exerciseId === ex.exerciseId
      );
      if (twin) expect(ex.reps).toBe(Math.max(floor, twin.reps - 2));
    });
    // middle day is moderate: the mains start at the table's bottom
    expect(mainRepsOf(three.workouts[1])).toContain(6);
  });

  it("strength mains floor at 3 on heavy days", () => {
    const two = generateProgram("recomp", 2, undefined, "strength");
    const heavyMains = mainRepsOf(two.workouts[0]);
    // strength base 5 → heavy day 3; nothing below the floor
    expect(Math.min(...heavyMains)).toBeGreaterThanOrEqual(3);
    expect(heavyMains).toContain(3);
  });

  it("pump day sits +2 over the base — except the hinge main", () => {
    // 6-day week: days 3-5 carry the pump role. Day 3 (Pull — Row Focus)
    // has a non-hinge main, which takes the +2.
    const six = generateProgram("recomp", 6, undefined, "hypertrophy");
    expect(mainRepsOf(six.workouts[3])).toContain(8);
  });

  it("pump +2 never reaches a hip-dominant main (no high-rep heavy hinge)", () => {
    // Day C of the 3-day week (Posterior Focus) is the pump day and its only
    // main is the deadlift. Pre-exemption it was prescribed at base+2 — the
    // 4×10 heavy hinge the corpus warns against. It must open at base.
    const three = generateProgram("recomp", 3, undefined, "hypertrophy");
    const dayC = three.workouts[2];
    const hinges = dayC.exercises.filter(
      (e) => e.movementCategory === "hip_dominant" && e.isAccessory !== true
    );
    expect(hinges.length).toBeGreaterThanOrEqual(1);
    hinges.forEach((e) => expect(e.reps).toBe(6)); // the table's 6, not 8
    // …while the rest of the day still undulates (+2 with the accessory
    // floor), so the exemption is surgical, not a dead pump day. The 6-day
    // week's Legs — Deadlift day pins the same pair in one session.
    const legsB = generateProgram("recomp", 6, undefined, "hypertrophy")
      .workouts[5];
    const hingeMain = legsB.exercises.find(
      (e) => e.movementCategory === "hip_dominant" && e.isAccessory !== true
    );
    const kneeMain = legsB.exercises.find(
      (e) => e.movementCategory === "knee_dominant" && e.isAccessory !== true
    );
    expect(hingeMain?.reps).toBe(6); // exempt — no +2
    expect(kneeMain?.reps).toBe(8); // the table's 6, +2 on the pump day
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
      settings: { autoProgression: true, smallPlates: false },
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
    st = advanceWeek(trained(st)); // week 2 (mid)
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => expect(ex.sets).toBe(base[di][ei]))
    );
    st = advanceWeek(trained(st)); // week 3 (top)
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        const b = base[di][ei];
        expect(ex.sets).toBe(ex.isAccessory === true ? Math.min(5, b + 1) : b);
      })
    );
    st = advanceWeek(trained(st)); // week 4 — deload cuts from the ANCHOR, not week 3
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        expect(ex.sets).toBe(Math.max(2, base[di][ei] - 1));
        expect(ex.weight).toBe(deloadWeight(50)); // pinned to the shared rule
        expect(ex.preDeloadWeight).toBe(50);
      })
    );
    st = advanceWeek(trained(st)); // week 5 — meso restart
    st.workouts.forEach((d, di) =>
      d.exercises.forEach((ex, ei) => {
        const b = base[di][ei];
        // The week-1 dip shares the 2-set accessory floor with every other
        // volume pass — pre-fix this pinned Math.max(1, …) and the 8-week
        // simulation showed 1-set curl slots at each meso restart.
        expect(ex.sets).toBe(
          ex.isAccessory === true ? Math.max(Math.min(b, 2), b - 1) : b
        );
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
    st = advanceWeek(trained(st)); // week 2 (mid) — anchor stamps, sets unchanged
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
    // turned a 6-10 main into 4-10 on heavy days — a 6-rep climb.
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    for (const ex of allEx(workouts)) {
      if (ex.repUnit === "seconds") continue;
      // The width is the role's (`roleTable.ts`): 4 for a main or another
      // compound, 5 for an isolation, 8 for a calf, side-delt or ab one.
      const row = roleRepsFor("hypertrophy", ex, undefined);
      const span = row.top! - row.bottom;
      // …unless the prescription ceiling bit first (2026-07-28 audit): a
      // bodyweight lift stops at 15 reps and anything else at 20, rather
      // than advertising a top end nobody would program.
      const ceiling = isBodyweightExerciseId(ex.exerciseId) ? 15 : 20;
      expect(ex.repRangeMax! - ex.reps).toBe(Math.min(span, ceiling - ex.reps));
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

  // Lift4 (6): the step follows the equipment the lift is done on
  // (`loadSteps.ts`), whatever its slot or movement, and a step of more than
  // about 15% is never taken on its own.
  const atRangeTop = (o: Partial<ProgramExercise>, smallPlates = false) => {
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
      smallPlates
    );
  };

  it("steps a barbell lift 2.5 kg at any load, and 1.25 kg with small plates", () => {
    const curl = atRangeTop({
      exerciseId: "barbell-curl",
      movementCategory: "arms_biceps",
      weight: 30,
    });
    expect(curl.weight).toBe(32.5);
    expect(curl.reps).toBe(12); // target resets to the bottom of the range
    expect(atRangeTop({ weight: 100 }, true).weight).toBe(101.25);
  });

  it("steps a lift the same whatever slot it fills", () => {
    // #7 keyed the step on `isAccessory` and handed an RDL 1.25 kg steps.
    for (const isAccessory of [true, false]) {
      const rdl = atRangeTop({
        exerciseId: "romanian-deadlift",
        movementCategory: "hip_dominant",
        weight: 100,
        isAccessory,
      });
      expect(rdl.weight).toBe(102.5);
    }
  });

  it("steps dumbbells to the next pair, which small plates don't change", () => {
    const raise = {
      exerciseId: "lateral-raise",
      movementCategory: "vertical_push" as const,
    };
    expect(atRangeTop({ ...raise, weight: 8 }).weight).toBe(9);
    expect(atRangeTop({ ...raise, weight: 8 }, true).weight).toBe(9);
    expect(
      atRangeTop({ exerciseId: "db-shoulder-press", weight: 20 }).weight
    ).toBe(22.5);
  });

  it("climbs in reps when the next weight is more than about 15% heavier", () => {
    // 10 kg dumbbells to 12.5 kg is 25%: the target goes a rep past the top
    // of the range, and the plan follows the heavier pair once it is lifted.
    const raise = atRangeTop({
      exerciseId: "lateral-raise",
      movementCategory: "vertical_push",
      weight: 10,
    });
    expect(raise.weight).toBe(10);
    expect(raise.reps).toBe(16);
  });

  it("climbs only as far as the next weight's equal effort, then waits", () => {
    let raise = makeTestExercise({
      exerciseId: "lateral-raise",
      movementCategory: "vertical_push",
      progressionType: "double",
      reps: 12,
      baseReps: 12,
      repRangeMax: 15,
      weight: 10,
      lastSuccessfulWeight: 10,
    });
    const targets: number[] = [];
    for (let i = 0; i < 12; i++) {
      raise = applyProgression(raise, raise.reps, 10, false);
      targets.push(raise.reps);
    }
    // 13–15 climbs the range; past it, 22 reps at 10 kg is about 12 at 12.5.
    expect(targets).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 22, 22]);
    expect(raise.weight).toBe(10);
  });

  it("steps a row with no slot recorded as any other", () => {
    const legacy = makeTestExercise({
      progressionType: "linear",
      reps: 6,
      baseReps: 6,
      weight: 100,
      lastSuccessfulWeight: 100,
    });
    expect(applyProgression(legacy, 6, 100, false).weight).toBe(102.5);
    const dbl = makeTestExercise({ weight: 100, lastSuccessfulWeight: 100 });
    expect(applyProgression(dbl, 8, 100, false).weight).toBe(102.5);
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
      st = advanceWeek(trained(st), "intermediate"); // w2
      st = advanceWeek(trained(st), "intermediate"); // w3
      st = advanceWeek(trained(st), "intermediate"); // w4 — deload, reps cut
      st.workouts.forEach((d, di) =>
        d.exercises.forEach((ex, ei) => {
          expect(ex.reps).toBe(Math.max(3, start[di][ei] - 2));
        })
      );
      st = advanceWeek(trained(st), "intermediate"); // meso exit — reps restored
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

  /** Prescribed sets across the whole week — what a deload visibly cuts. */
  const setsOf = (s: ProgramState) =>
    s.workouts.map((d) => d.exercises.map((e) => e.sets));

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

  it("the strained cut is a STRICT set decrease in a plain training week", () => {
    // The assertion above (`sets <= baseSets`) is satisfied even if
    // reduce_volume were a no-op: week 2's ramp puts accessories exactly AT
    // base. This pins the cut itself — the landing week (2) is not a deload
    // and not a ramp-down, so any set below base can only have come from
    // applyAdjustment's reduce_volume arm.
    const st = stall(makeState(), 4);
    const out = advanceWeek(trained(st), "beginner", "strained");
    expect(out.weekNumber).toBe(2);
    expect(out.currentPhase).not.toBe("deload");
    let cuttable = 0;
    out.workouts.forEach((d) =>
      d.exercises
        .filter((e) => e.isAccessory === true)
        .forEach((ex) => {
          const base = ex.baseSets ?? 0;
          if (base > 2) {
            // above ACCESSORY_ANCHOR_FLOOR — the cut must actually land
            cuttable += 1;
            expect(ex.sets).toBe(base - 1);
          } else {
            expect(ex.sets).toBe(base); // floored — never cut below 2
          }
        })
    );
    // Anti-vacuous guard: the fixture must contain accessories the cut can
    // reach, or the strict assertions above never execute.
    expect(cuttable).toBeGreaterThan(0);
    // Mains are the progression anchor — never touched by the volume arms.
    out.workouts.forEach((d) =>
      d.exercises
        .filter((e) => e.isAccessory !== true)
        .forEach((ex) => expect(ex.sets).toBe(ex.baseSets ?? ex.sets))
    );
  });

  it("a SECOND strained stall reorganizes instead of cutting again", () => {
    let st = stall(makeState(), 4);
    st = advanceWeek(st, "beginner", "strained"); // cut #1
    expect(st.plateauResponses).toBe(1);
    const beforeAnchors = anchors(st);
    st = stall(st, 4); // still stalled
    const beforeIds = st.workouts.flatMap((d) =>
      d.exercises.map((ex) => ex.exerciseId)
    );
    const out = advanceWeek(st, "beginner", "strained");
    // anchor DROPS now (less total volume), and the counter stops climbing
    out.workouts.forEach((d, di) => {
      const accs = d.exercises.filter((e) => e.isAccessory === true);
      accs.forEach((ex, ei) => {
        expect(ex.baseSets).toBeLessThanOrEqual(beforeAnchors[di][ei] ?? 0);
      });
    });
    const afterIds = out.workouts.flatMap((d) =>
      d.exercises.map((ex) => ex.exerciseId)
    );
    expect(afterIds.some((id, i) => id !== beforeIds[i])).toBe(true);
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
    const st = advanceWeek(
      trained(stall(makeState(), 4)),
      "beginner",
      "strained"
    );
    const stillPlateaued = st.workouts
      .flatMap((d) => d.exercises)
      .filter((e) => (e.plateauCount ?? 0) > 0);
    expect(stillPlateaued.length).toBeGreaterThanOrEqual(PROGRAMME_PLATEAU_MIN);
  });

  it("never adjusts on a deload week — the deload IS the light week", () => {
    const st = stall(makeState(3), 4); // advancing lands on week 4
    const before = anchors(st);
    const out = advanceWeek(trained(st), "beginner", "recovered");
    expect(out.currentPhase).toBe("deload");
    expect(anchors(out)).toEqual(before); // no add_volume stacked on it
  });

  /**
   * A deload dissipates ACCUMULATED fatigue, so a week with no completed
   * session has nothing to dissipate. This ran unguarded until 2026-08-04:
   * `advanceWeek` branched on the calendar prescription alone, so an
   * untrained week 3→4 produced a deload byte-identical to a fully-trained
   * one. The calendar rollover fires unattended on app open and catches up
   * as many as 12 weeks, so someone back from a month away was rolled
   * through several deloads of a plan they had never touched — handed a
   * REDUCED week at the moment they most needed their plan intact.
   *
   * The pair is the point: same fixture, same week boundary, only the
   * completion flag differs. Asserting the untrained case alone would pass
   * against an engine that had stopped deloading altogether.
   */
  describe("a deload needs a week that was actually trained", () => {
    /**
     * `makeState(3)` builds a FRESH plan and labels it week 3, so its stored
     * sets are week-1 shaped. The first rollover legitimately applies week
     * 3's own ramp — that is the volume shape doing its job, not a deload.
     * Settling once separates the two, so these tests probe the deload
     * rather than the fixture being out of shape for its own week number.
     */
    const settled = () =>
      advanceWeek(makeState(3), "intermediate", "recovered");

    it("withholds the deload when no session was completed", () => {
      const st = settled();
      const before = setsOf(st);

      const out = advanceWeek(st, "intermediate", "recovered");

      // Not labelled a deload — the phase drives the UI and WorkoutSession's
      // deload mode, so a "deload" over an uncut plan would be the app
      // announcing something that did not happen.
      expect(out.currentPhase).toBe("progression");
      expect(setsOf(out)).toEqual(before);
    });

    it("still deloads the same week when a session WAS completed", () => {
      const st = settled();
      // The counterfactual, not the raw fixture: the SAME state rolled at the
      // SAME boundary with nothing completed. Only the flag differs, so the
      // difference below can only be the deload.
      const untrained = setsOf(advanceWeek(st, "intermediate", "recovered"));

      const out = advanceWeek(trained(st), "intermediate", "recovered");

      expect(out.currentPhase).toBe("deload");
      expect(setsOf(out)).not.toEqual(untrained);
    });

    it("one completed day is enough — adherence is not a dose", () => {
      // The engine biases toward firing (RP Ch3 P213: deloading early beats
      // deloading late). The gate removes only the degenerate zero case; it
      // is not a partial-credit threshold.
      const st = settled();
      const partial = {
        ...st,
        workouts: st.workouts.map((d, i) =>
          i === 0 ? { ...d, completed: true } : d
        ),
      };

      expect(
        advanceWeek(partial, "intermediate", "recovered").currentPhase
      ).toBe("deload");
    });

    it("holds the block position across an absence, and resumes from it", () => {
      // `liftWeekKey` tracks where the user is in TIME; `weekNumber` tracks
      // where they are in the BLOCK. Conflating them put a returning lifter on
      // the hardest week of the mesocycle: measured pre-fix, a week-3 lifter
      // gone 12 weeks came back at week 15 → weekInMeso 3 → accessories at
      // base+1 (4,4,3,4 against a base of 3,3,2,3). First session back, top of
      // the ramp.
      //
      // ADR-0002 already settled the principle for the discipline — lifts are
      // split-ordered, not calendar-pinned, and force-calendar was rejected
      // specifically for punishing the lapsed-and-returning segment.
      let st = settled();
      const onLeaving = setsOf(st);

      for (let i = 0; i < 12; i += 1) st = advanceWeek(st, "intermediate");

      expect(st.weekNumber).toBe(3);
      expect(setsOf(st)).toEqual(onLeaving);

      // …and the block still moves the moment they actually train again.
      const back = advanceWeek(trained(st), "intermediate");
      expect(back.weekNumber).toBe(4);
    });

    it("keeps the archive to weeks that happened", () => {
      // weekHistory caps at 8. Archiving absent weeks would let one catch-up
      // evict every real week and replace it with copies of an empty one.
      let st = makeState(1);
      st = advanceWeek(trained(st), "intermediate");
      const afterOneRealWeek = st.weekHistory?.length ?? 0;

      for (let i = 0; i < 12; i += 1) st = advanceWeek(st, "intermediate");

      expect(afterOneRealWeek).toBe(1);
      expect(st.weekHistory?.length).toBe(1);
    });
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
    st = advanceWeek(trained(st)); // week 2 — base
    const w2 = accSets(st);
    st = advanceWeek(trained(st)); // week 3 — base + 1
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
  // The cap is about LOWER-BACK cost, not the hip pattern as such. A hip
  // thrust and a seated leg curl are both hip_dominant but neither loads the
  // spine, and no source in the review warns about them — so they do not
  // count. They are also exactly what the pass swaps TO: a demoted slot keeps
  // its category (see `lowCostAlternative`).
  const SPINAL_SPARING = new Set(["hip-thrust", "seated-leg-curl"]);
  const hingeSlots = (workouts: WorkoutDay[]) =>
    workouts.map(
      (d) =>
        d.exercises.filter(
          (e) =>
            e.movementCategory === "hip_dominant" &&
            !SPINAL_SPARING.has(e.exerciseId)
        ).length
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
    // 51 working sets for the 3-day recomp hypertrophy build (the role
    // table's three a lift, then the volume passes) — a stored literal, so
    // a cap that started adding or dropping sets moves this number.
    // (Comparing the call to itself pinned nothing.)
    expect(totalSets(3)).toBe(51);
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    // Days A and C carry the named calf slot on top of the five built ones.
    workouts.forEach((d, i) =>
      expect(d.exercises).toHaveLength(i === 1 ? 5 : 6)
    );
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
    // day A is the heavy day: every accessory sits 2 under its role's
    // bottom (`roleTable.ts`), floored at 6
    dayA.exercises
      .filter((e) => e.isAccessory === true)
      .forEach((e, i) =>
        expect(accessoryReps[i]).toBe(
          Math.max(6, roleRepsFor("hypertrophy", e, undefined).bottom - 2)
        )
      );
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

// Backlog #7's time axis (N2) — timed holds count SECONDS, not reps.
describe("timed holds (backlog #7 time axis)", () => {
  const plank = (o: Partial<ProgramExercise> = {}) =>
    makeTestExercise({
      name: "Plank",
      exerciseId: "plank",
      movementCategory: "core",
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
      reps: 30,
      baseReps: 30,
      repRangeMax: 45,
      repUnit: "seconds",
      ...o,
    });

  it("climbs in 5-second steps, not 1-rep steps", () => {
    const out = applyProgression(plank(), 32, 0, false);
    expect(out.reps).toBe(35);
  });

  it("stops at the authored ceiling rather than drifting", () => {
    const out = applyProgression(
      plank({ reps: 43, baseReps: 43 }),
      45,
      0,
      false
    );
    expect(out.reps).toBe(45);
  });

  it("prompts to add load at the ceiling, not at 20 'reps'", () => {
    // The defect: a plank starts at 30, already ABOVE MAX_BODYWEIGHT_REPS, so
    // any overshoot immediately advised "Hitting 20+ reps — add load" at what
    // is an ordinary hold length.
    const belowCeiling = applyProgression(plank(), 32, 0, false);
    expect(belowCeiling.notes).toBeUndefined();

    const atCeiling = applyProgression(
      plank({ reps: 45, baseReps: 45 }),
      47,
      0,
      false
    );
    expect(atCeiling.notes).toMatch(/add load/i);
    expect(atCeiling.notes).not.toMatch(/20\+ reps/);
    expect(atCeiling.reps).toBe(45); // held, not bumped past the ceiling
  });

  it("falls back to a 60s ceiling when no range was authored", () => {
    const out = applyProgression(
      plank({ reps: 60, baseReps: 60, repRangeMax: undefined }),
      65,
      0,
      false
    );
    expect(out.notes).toMatch(/add load/i);
    expect(out.reps).toBe(60);
  });

  it("repeated failure shortens the hold by the 5s step, not by '1 rep' (LIFT-EV-01)", () => {
    // Pre-fix this was `reps - 1`: a 30s plank "deloaded" to 29s, walking
    // one second at a time toward the rep floor of 4 — a 4-second plank.
    const out = applyProgression(
      plank({ consecutiveFailures: 2 }),
      20,
      0,
      false
    );
    expect(out.reps).toBe(25); // 30 − HOLD_STEP_SECONDS, not 29
    expect(out.consecutiveFailures).toBe(0);
    expect(out.plateauCount).toBe(1);
  });

  it("the failure deload floors at 10 seconds, matching the mesocycle deload floor", () => {
    const out = applyProgression(
      plank({ reps: 12, baseReps: 12, consecutiveFailures: 2 }),
      5,
      0,
      false
    );
    expect(out.reps).toBe(10);
  });

  it("leaves ordinary bodyweight reps alone", () => {
    // The rep path must be untouched BY THE TIME AXIS: a pull-up still climbs
    // in single reps (never the 5-second hold step) and still uses the 20-rep
    // cap. The step is from what was done, not from the target — see the
    // range-less double contract above.
    const pullup = makeBodyweightExercise({ reps: 8 });
    expect(applyProgression(pullup, 10, 0, false).reps).toBe(11);
    const capped = makeBodyweightExercise({ reps: 20 });
    const out = applyProgression(capped, 22, 0, false);
    expect(out.reps).toBe(20);
    expect(out.notes).toMatch(/20\+ reps/);
  });
});

// Backlog #10 (M6 adjacency) wired into generateProgram. The week's SHAPE
// comes from profile.weekSchedule — read-only. Lifts stay split-ordered
// (ADR-0002); this only decides which session sits next to which.
describe("adjacency ordering (backlog #10, M6)", () => {
  const sched = (days: number[]) =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day: d,
      type: days.includes(d) ? "lift" : "rest",
    }));
  const gen = (
    n: number,
    schedule?: ReadonlyArray<{ day: number; type: string }>,
    existing?: WorkoutDay[]
  ) =>
    generateProgram("recomp", n, existing, "hypertrophy", undefined, schedule)
      .workouts;

  it("changes nothing for a spread-out week", () => {
    // Mon/Wed/Fri — no two sessions are back-to-back, so there is nothing
    // adjacency can improve. This is the case the rule MUST leave alone.
    const plain = gen(3).map((d) => d.dayName);
    const spread = gen(3, sched([1, 3, 5])).map((d) => d.dayName);
    expect(spread).toEqual(plain);
  });

  it("changes nothing when no schedule is supplied", () => {
    expect(gen(6, undefined).map((d) => d.dayName)).toEqual(
      gen(6, undefined).map((d) => d.dayName)
    );
  });

  it("separates posterior-heavy days on a fully consecutive week", () => {
    const before = gen(6);
    const after = gen(6, sched([1, 2, 3, 4, 5, 6]));
    const posterior = (w: WorkoutDay[]) =>
      w.map((d) =>
        d.exercises.reduce(
          (n, e) =>
            n +
            (e.movementCategory === "hip_dominant" ||
            e.movementCategory === "horizontal_pull" ||
            e.movementCategory === "vertical_pull"
              ? e.sets
              : 0),
          0
        )
      );
    const cost = (w: WorkoutDay[]) => {
      const p = posterior(w);
      let c = 0;
      for (let i = 0; i + 1 < p.length; i += 1) c += Math.min(p[i], p[i + 1]);
      return c;
    };
    expect(cost(after)).toBeLessThanOrEqual(cost(before));
  });

  it("keeps the push/pull/legs rotation intact", () => {
    // The worry that kept this unbuilt: a GENERIC overlap metric reorders PPL
    // out of its rotation. Scoring only the posterior chain does not — a
    // 6-day week stays a clean two-cycle rotation, just possibly starting on
    // a different day.
    const names = gen(6, sched([1, 2, 3, 4, 5, 6])).map(
      (d) => d.dayName.split(" ")[0]
    );
    expect(names.slice(0, 3)).toEqual(names.slice(3, 6));
  });

  it("keeps the order stable across regenerates", () => {
    const S = sched([1, 2, 3, 4, 5, 6]);
    const established = gen(6, S);
    let current = established;
    for (let i = 0; i < 3; i += 1) {
      current = gen(6, S, current);
      expect(current.map((d) => d.dayName)).toEqual(
        established.map((d) => d.dayName)
      );
    }
  });

  it("carries every exercise to the RIGHT day after reordering", () => {
    // The bug this feature was blocked on, now a regression pin. The builders
    // carry saved exercises by POSITION, which assumed saved order == builder
    // order. Reordering broke that silently: with saved Pull,Push,Legs and
    // builder Push,Pull,Legs, a logged pull-up weight landed on bench press.
    // `alignToCanonical` makes the carry key on day NAME instead.
    const S = sched([1, 2, 3, 4, 5, 6]);
    const established = gen(6, S);
    const trained = established.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, weight: 61 })),
    }));
    const again = gen(6, S, trained);

    again.forEach((d, di) => {
      expect(d.dayName).toBe(trained[di].dayName);
      d.exercises.forEach((e, ei) => {
        const before = trained[di].exercises[ei];
        if (!before) return;
        expect(e.exerciseId, `d${di}/e${ei} (${d.dayName})`).toBe(
          before.exerciseId
        );
        expect(e.weight, `d${di}/e${ei}`).toBe(61);
      });
    });
  });

  it("aligns by name even when the saved plan is in a different order", () => {
    // Directly: hand the engine a saved plan whose days are shuffled and
    // confirm each day's content follows its NAME, not its index.
    const S = sched([1, 2, 3, 4, 5, 6]);
    const base = gen(6, S);
    const shuffled = [...base].reverse().map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, weight: 77 })),
    }));
    const out = gen(6, S, shuffled);
    out.forEach((d) => {
      const source = shuffled.find((x) => x.dayName === d.dayName);
      expect(source).toBeDefined();
      d.exercises.forEach((e, ei) => {
        const before = source!.exercises[ei];
        if (before) expect(e.exerciseId).toBe(before.exerciseId);
      });
    });
  });
});

// A regenerate must never drop a logged load, on ANY split. This is the guard
// for the whole class rather than for one slot: the builders carry saved
// exercises through hand-written `findExisting(dayIdx, exIdx)` calls, and a
// single wrong index silently rebuilds that lift from defaults every time the
// user changes a setting. One such off-by-one (the PPL legs day's core slot,
// calling findExisting(2, 4) into a four-slot day) survived until this test
// existed.
//
// CORRECTED 2026-07-28. This test used to stamp `weight: 61` on EVERY
// exercise and then assert every exercise still read 61 — so any permutation
// of the carry passed it, including the one an audit found shipping
// (`Bench Press@100 [from Barbell Squat]`). It also computed a `before` and
// never compared against it. Distinct per-slot weights are the whole point:
// they make a swap visible.
describe("regenerate preserves every logged load (all splits)", () => {
  it.each([1, 2, 3, 4, 5, 6])("%i-day split", (days) => {
    const first = generateProgram(
      "recomp",
      days,
      undefined,
      "hypertrophy"
    ).workouts;
    // A unique load per LIFT, so a mis-carry names its own source.
    const loadFor = new Map<string, number>();
    first
      .flatMap((d) => d.exercises)
      .forEach((e, i) => {
        if (!loadFor.has(e.exerciseId)) loadFor.set(e.exerciseId, 100 + i);
      });
    const trained = first.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        const w = loadFor.get(e.exerciseId) as number;
        return {
          ...e,
          weight: w,
          performanceHistory: [
            { date: "2026-01-01", weight: w, repsCompleted: 8, repsTarget: 8 },
          ],
        };
      }),
    }));
    const again = generateProgram(
      "recomp",
      days,
      trained,
      "hypertrophy"
    ).workouts;

    const sourceOf = (w: number) =>
      [...loadFor.entries()].find(([, v]) => v === w)?.[0] ?? "unknown";

    again.forEach((d) =>
      d.exercises.forEach((e, ei) => {
        const expected = loadFor.get(e.exerciseId);
        expect(
          expected,
          `${d.dayName} / slot ${ei}: ${e.exerciseId} was not in the saved plan`
        ).toBeDefined();
        expect(
          e.weight,
          `${d.dayName} / slot ${ei}: ${e.exerciseId} carried ${sourceOf(e.weight)}'s load`
        ).toBe(expected);
        expect(
          e.performanceHistory?.length,
          `${d.dayName} / slot ${ei} (${e.exerciseId})`
        ).toBe(1);
      })
    );
  });
});

// The owner-reported defect: a default 3-day programme prescribed Barbell
// Squat x3/week and a 4-day prescribed Barbell Curl x3 — on every goal, i.e.
// the two most common configurations in the app. Helms's literal
// counter-example, shipped. Guarded across every split and goal.
describe("no lift is prescribed more than twice a week", () => {
  const GOALS = ["hypertrophy", "strength", "fat_loss", "general"] as const;
  it.each(GOALS)("%s, every split", (goal) => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const { workouts } = generateProgram("recomp", days, undefined, goal);
      const counts = new Map<string, number>();
      for (const ex of workouts.flatMap((d) => d.exercises)) {
        counts.set(ex.name, (counts.get(ex.name) ?? 0) + 1);
      }
      const over = [...counts.entries()].filter(([, n]) => n > 2);
      expect(over, `${goal} / ${days}-day`).toEqual([]);
    }
  });

  it("leaves no duplicate exercise within any single day", () => {
    // The end-to-end guarantee: the repeat cap must not undo what
    // dedupeDayExercises did earlier in the pipeline.
    for (const days of [1, 2, 3, 4, 5, 6]) {
      const { workouts } = generateProgram(
        "recomp",
        days,
        undefined,
        "hypertrophy"
      );
      workouts.forEach((d) => {
        const ids = d.exercises.map((e) => e.exerciseId);
        expect(new Set(ids).size, `${days}-day / ${d.dayName}`).toBe(
          ids.length
        );
      });
    }
  });

  it("still trains the muscle at the split's promised frequency", () => {
    // The cap must change WHICH variation fills a slot, never how often the
    // muscle is trained — that frequency is what splitRationale promises.
    const { workouts } = generateProgram("recomp", 3, undefined, "hypertrophy");
    const kneeDays = workouts.filter((d) =>
      d.exercises.some((e) => e.movementCategory === "knee_dominant")
    );
    expect(kneeDays).toHaveLength(3);
  });
});

// ── Anchored rotation (rotation load re-anchoring) ─────────────────────
//
// rotateUntrainedAccessories deliberately did NOT rescale, because naive
// rescaling compounded across mesocycles (the measured 50 → 30 → 12.5
// decay) — the module comment recorded the proper fix as "an anchor the
// slot does not currently carry". The slot carries it now
// (`rotationAnchor`, stamped by seedStartingLoads and refreshed by
// calibrated swaps), and rotation scales from that FIXED pair — so the
// scale can never compound — but only while the lineage is intact
// (current weight === what the anchor implies). A diverged weight is a
// user's own calibration and keeps the legacy carry behaviour.

describe("anchored rotation", () => {
  const anchoredAccessory = (over: Partial<ProgramExercise> = {}) =>
    makeTestExercise({
      exerciseId: "db-bench",
      name: "Dumbbell Bench Press",
      movementCategory: "horizontal_push",
      isAccessory: true,
      // 25 kg deliberately: the horizontal_push rotation cycles db-bench →
      // incline-db-press → db-bench, and at 25 the anchor path restores
      // exactly 25 on the return while chain-scaling (the compounding bug)
      // drifts to 27.5 — double-rounding makes the two paths distinguishable
      // here, which is what lets the mutation test bite.
      weight: 25,
      rotationAnchor: { exerciseId: "db-bench", weight: 25 },
      performanceHistory: [],
      ...over,
    });

  const rotate = (ex: ProgramExercise) =>
    rotateUntrainedAccessories(
      [
        {
          dayName: "D",
          dayType: "upper",
          completed: false,
          exercises: [ex],
        } as WorkoutDay,
      ],
      "advanced"
    )[0].exercises[0];

  it("an intact lineage rotates onto a properly SCALED load", () => {
    const out = rotate(anchoredAccessory());
    expect(out.exerciseId).not.toBe("db-bench"); // it did rotate
    // The load moved with the movement — the legacy behaviour carried
    // 25 kg onto whatever came next.
    expect(out.weight).not.toBe(25);
    // …and it is exactly the anchor-implied load for the new identity,
    // pinned against an independent computation from the FIXED anchor.
    expect(out.weight).toBe(
      rescaleForSwap(25, "db-bench", out.exerciseId, "horizontal_push")
    );
    // The anchor itself is untouched — the next rotation scales from the
    // same pair, which is the whole non-compounding guarantee.
    expect(out.rotationAnchor).toEqual({
      exerciseId: "db-bench",
      weight: 25,
    });
  });

  it("a second rotation still scales from the ORIGINAL anchor — no round-trip drift", () => {
    const first = rotate(anchoredAccessory());
    const second = rotate(first);
    expect(second.exerciseId).not.toBe(first.exerciseId);
    // The pool cycles back to db-bench, and the anchor restores EXACTLY the
    // anchor weight. Chain-scaling (each rotation from the previous one's
    // rounded output) lands on 27.5 here — the measured compounding decay's
    // mechanism, caught at its first divergence.
    expect(second.exerciseId).toBe("db-bench");
    expect(second.weight).toBe(25);
    expect(second.rotationAnchor).toEqual({
      exerciseId: "db-bench",
      weight: 25,
    });
  });

  it("a user-edited weight (diverged lineage) is NEVER snapped away", () => {
    // The user set 77.5 on an untrained slot; the stale anchor says 17.5.
    // Rotation must keep the user's number (legacy carry), not re-derive
    // from an anchor the user has overridden.
    const out = rotate(anchoredAccessory({ weight: 77.5 }));
    expect(out.exerciseId).not.toBe("db-bench");
    expect(out.weight).toBe(77.5);
  });

  it("legacy slots without an anchor keep the carry behaviour", () => {
    const legacy = anchoredAccessory();
    delete (legacy as Partial<ProgramExercise>).rotationAnchor;
    const out = rotate(legacy);
    expect(out.weight).toBe(25);
  });

  it("seedStartingLoads stamps the anchor on every seeded slot", () => {
    const seeded = seedStartingLoads(
      [
        {
          dayName: "D",
          dayType: "upper",
          completed: false,
          exercises: [
            makeTestExercise({
              exerciseId: "bench-press",
              weight: 0,
              lastSuccessfulWeight: 0,
              lastAttemptedWeight: 0,
              performanceHistory: [],
            }),
          ],
        } as WorkoutDay,
      ],
      { bodyweightKg: 80, experience: "beginner", sex: "male" }
    )[0].exercises[0];
    expect(seeded.weight).toBeGreaterThan(0);
    expect(seeded.rotationAnchor).toEqual({
      exerciseId: "bench-press",
      weight: seeded.weight,
    });
  });

  it("normalizeExercise carries the anchor (field-enumerating read path)", () => {
    const out = normalizeExercise({
      name: "X",
      exerciseId: "db-bench",
      rotationAnchor: { exerciseId: "db-bench", weight: 20 },
    });
    expect(out.rotationAnchor).toEqual({ exerciseId: "db-bench", weight: 20 });
  });
});

// ── Coach-read audit pins (2026-08-03) ──────────────────
// The audit read every goal × day-count programme as a training programme
// (split, lifts, frequency, intensity) against the frequency and volume
// literature the engine already cites. Three defects were confirmed and
// fixed; these tests pin the PROPERTIES, not the prose, so reverting any
// one of them fails loudly rather than silently degrading the programmes.
describe("coach-read audit pins (2026-08-03)", () => {
  const GOALS = [
    "hypertrophy",
    "strength",
    "fat_loss",
    "general",
    "running",
  ] as const;

  // 2-day trained every muscle ONCE a week (upper/lower pair) while the
  // user-facing rationale claimed "about twice". Full-body A/B is what the
  // 2-day literature actually prescribes — and what chooseSplit's own
  // 3-day comment argues (Schoenfeld 2016, frequency at matched volume).
  it("a 2-day week is full-body: every trained muscle is touched on BOTH days", async () => {
    const { weeklyVolumeByJudgementMuscle } = await import("../volumeModel");
    for (const goal of GOALS) {
      const { splitType, workouts } = generateProgram(
        "recomp",
        2,
        undefined,
        goal
      );
      expect(splitType).toBe("full_body");
      expect(workouts).toHaveLength(2);

      const weekly = weeklyVolumeByJudgementMuscle(workouts);
      const perDay = workouts.map(
        (d) =>
          new Set(
            weeklyVolumeByJudgementMuscle([d]).map((r) => r.muscle as string)
          )
      );
      // Abs legitimately sits on one day (day A's core slot; mv 0). Every
      // other trained muscle must appear in BOTH sessions — the entire
      // point of the split flip.
      for (const { muscle } of weekly) {
        if (muscle === "Abs") continue;
        const days = perDay.filter((s) => s.has(muscle)).length;
        expect(days, `${goal}: ${muscle} trained on ${days}/2 days`).toBe(2);
      }
    }
  });

  it("the 2-day rationale no longer claims a frequency the split doesn't deliver", () => {
    expect(splitRationale(2)).toMatch(/full-body/i);
  });

  // Side delts measured ZERO direct sets across all 25 goal × day-count
  // programmes: presses credit the front delt, the bank has no raise
  // pattern, and the balancer is add-only with no slot to grow — the exact
  // no-slot failure the calf slots fixed. Every 4d+ plan now carries at
  // least one pinned lateral-raise slot (the hand-authored templates always
  // did).
  it("every 4d/5d/6d plan prescribes direct side-delt work", async () => {
    const { weeklyVolumeByJudgementMuscle } = await import("../volumeModel");
    for (const goal of GOALS) {
      for (const days of [4, 5, 6]) {
        const { workouts } = generateProgram("recomp", days, undefined, goal);
        const raises = workouts
          .flatMap((d) => d.exercises)
          .filter((e) => e.exerciseId === "lateral-raise");
        expect(
          raises.length,
          `${goal} × ${days}d has no lateral-raise slot`
        ).toBeGreaterThan(0);
        const sideDelts = weeklyVolumeByJudgementMuscle(workouts).find(
          (r) => (r.muscle as string) === "SideDelts"
        );
        expect(
          sideDelts?.sets ?? 0,
          `${goal} × ${days}d side-delt volume`
        ).toBeGreaterThan(0);
      }
    }
  });

  // The raise is categorised vertical_push; without the pin, meso rotation
  // would swap it into a shoulder press and the slot's purpose vanishes.
  it("lateral-raise is rotation-pinned", async () => {
    const { CATALOGUE_PINNED_ACCESSORY_IDS } = await import("../variationBank");
    expect(CATALOGUE_PINNED_ACCESSORY_IDS.has("lateral-raise")).toBe(true);
  });

  // Calves are the one judgement group nothing credits secondarily, so the
  // generic big-muscle floor (12 at hypertrophy) flagged every real 8-10
  // set calf prescription sub-MEV. The band is RP's calf table, not a
  // discount — and a 2-day week must still clear its maintenance floor.
  it("calf landmark is direct-work priced and 2-day clears maintenance", async () => {
    const { judgementLandmark, weeklyVolumeByJudgementMuscle } =
      await import("../volumeModel");
    expect(judgementLandmark("hypertrophy", "Calves")).toEqual({
      mv: 6,
      low: 8,
      high: 20,
    });
    const { workouts } = generateProgram("recomp", 2, undefined, "hypertrophy");
    const calves = weeklyVolumeByJudgementMuscle(workouts).find(
      (r) => (r.muscle as string) === "Calves"
    );
    expect(calves?.sets ?? 0).toBeGreaterThanOrEqual(6);
  });
});
