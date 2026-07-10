/**
 * Express Sessions (PROGRAM-FLEX-01) — pure engine pins.
 *
 * The policy under test, in order:
 *   1. compounds (isAccessory === false OR undefined) are never dropped
 *   2. whole accessories drop from the END first
 *   3. then accessory sets reduce (floor 2)
 *   4. then compound sets reduce from the end (floor 3), never the
 *      FIRST exercise (primary anchor keeps its full prescription)
 *   5. a plan that still doesn't fit runs honestly over budget
 * Plus: determinism, input immutability, choice gating, estimates.
 */
import { describe, it, expect } from "vitest";
import {
  buildExpressSession,
  estimateSessionMinutes,
  expressChoices,
  summarizeTrim,
  MINUTES_PER_SET,
  ACCESSORY_MIN_SETS,
  COMPOUND_MIN_SETS,
} from "../expressSession";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

let uid = 0;
function ex(
  name: string,
  sets: number,
  isAccessory: boolean | undefined
): ProgramExercise {
  return {
    name,
    exerciseId: `${name.toLowerCase().replace(/\s+/g, "-")}-${uid++}`,
    movementCategory: "horizontal_push",
    sets,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...(isAccessory === undefined ? {} : { isAccessory }),
  };
}

function day(exercises: ProgramExercise[]): WorkoutDay {
  return { dayName: "Push", dayType: "push", exercises, completed: false };
}

/** 2 compounds (4 sets) + 3 accessories (3 sets each) = 17 sets ≈ 43 min. */
function typicalPushDay(): WorkoutDay {
  return day([
    ex("Bench Press", 4, false),
    ex("Overhead Press", 4, false),
    ex("Incline DB Press", 3, true),
    ex("Lateral Raise", 3, true),
    ex("Tricep Pushdown", 3, true),
  ]);
}

describe("estimateSessionMinutes", () => {
  it("matches the SessionCommandCard basis (2.5 min/set, rounded)", () => {
    expect(MINUTES_PER_SET).toBe(2.5);
    expect(estimateSessionMinutes(typicalPushDay().exercises)).toBe(
      Math.round(17 * 2.5)
    );
  });
});

describe("buildExpressSession — full", () => {
  it("returns the day untrimmed with an empty trim record", () => {
    const d = typicalPushDay();
    const plan = buildExpressSession(d, "full");
    expect(plan.exercises).toHaveLength(5);
    expect(plan.exercises.map((e) => e.sets)).toEqual([4, 4, 3, 3, 3]);
    expect(plan.trim.droppedExercises).toEqual([]);
    expect(plan.trim.reducedSets).toEqual([]);
    expect(plan.estimatedMinutes).toBe(43);
  });
});

describe("buildExpressSession — trimming policy", () => {
  it("drops whole accessories from the END first (30 min budget)", () => {
    // 17 sets → budget 30 min = 12 sets. Dropping Tricep Pushdown (3)
    // then Lateral Raise (3) → 11 sets ≈ 28 min. Fits; Incline stays.
    const plan = buildExpressSession(typicalPushDay(), "express30");
    expect(plan.trim.droppedExercises).toEqual([
      "Lateral Raise",
      "Tricep Pushdown",
    ]);
    expect(plan.exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Overhead Press",
      "Incline DB Press",
    ]);
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(30);
    expect(plan.trim.reducedSets).toEqual([]);
  });

  it("45 min budget trims less than 30", () => {
    // 43 min > 45? No — 43 ≤ 45, so express45 shouldn't even be
    // offered; if built anyway it must trim nothing.
    const plan = buildExpressSession(typicalPushDay(), "express45");
    expect(plan.trim.droppedExercises).toEqual([]);
    expect(plan.exercises).toHaveLength(5);
  });

  it("never drops a compound, even when compounds alone exceed budget", () => {
    // 4 compounds × 5 sets = 20 sets = 50 min. 30-min budget: nothing
    // is droppable; sets reduce from the end (floor 3), first anchor
    // untouched.
    const d = day([
      ex("Squat", 5, false),
      ex("Romanian Deadlift", 5, false),
      ex("Front Squat", 5, false),
      ex("Leg Press", 5, false),
    ]);
    const plan = buildExpressSession(d, "express30");
    expect(plan.trim.droppedExercises).toEqual([]);
    expect(plan.exercises).toHaveLength(4);
    // Anchor keeps full prescription.
    expect(plan.exercises[0].sets).toBe(5);
    // No compound below the floor.
    for (const e of plan.exercises) {
      expect(e.sets).toBeGreaterThanOrEqual(COMPOUND_MIN_SETS);
    }
  });

  it("reduces accessory sets (floor 2) before touching compounds", () => {
    // 2 compounds × 4 + 2 accessories × 5 = 18 sets = 45 min.
    // 30-min budget = 12 sets. Drop last accessory (5) → 13 sets.
    // Still over → reduce remaining accessory 5→4 (13-12=1 excess set,
    // wait: 13 sets = 32.5 min, excess = ceil(2.5/2.5)=1 → 5→4) → 12
    // sets = 30 min. Compounds untouched.
    const d = day([
      ex("Bench Press", 4, false),
      ex("Overhead Press", 4, false),
      ex("Cable Fly", 5, true),
      ex("Lateral Raise", 5, true),
    ]);
    const plan = buildExpressSession(d, "express30");
    expect(plan.trim.droppedExercises).toEqual(["Lateral Raise"]);
    expect(plan.trim.reducedSets).toEqual([
      { name: "Cable Fly", from: 5, to: 4 },
    ]);
    expect(plan.exercises.map((e) => e.sets)).toEqual([4, 4, 4]);
    expect(plan.estimatedMinutes).toBe(30);
    for (const e of plan.exercises.filter((e) => e.isAccessory)) {
      expect(e.sets).toBeGreaterThanOrEqual(ACCESSORY_MIN_SETS);
    }
  });

  it("runs honestly over budget when floors are reached", () => {
    // 6 compounds × 5 sets = 30 sets = 75 min. Floors: anchor 5 +
    // 5 × 3 = 20 sets = 50 min > 30. Plan must surface the real
    // estimate, not pretend to fit.
    const d = day([
      ex("A", 5, false),
      ex("B", 5, false),
      ex("C", 5, false),
      ex("D", 5, false),
      ex("E", 5, false),
      ex("F", 5, false),
    ]);
    const plan = buildExpressSession(d, "express30");
    expect(plan.exercises).toHaveLength(6);
    expect(plan.exercises[0].sets).toBe(5);
    expect(plan.estimatedMinutes).toBe(50);
    expect(plan.estimatedMinutes).toBeGreaterThan(30);
  });

  it("treats legacy exercises without isAccessory as protected compounds", () => {
    // No exercise carries the flag (legacy plan) → nothing may be
    // dropped; only set reduction from the end applies.
    const d = day([
      ex("Bench Press", 5, undefined),
      ex("Row", 5, undefined),
      ex("Curl", 5, undefined),
    ]);
    const plan = buildExpressSession(d, "express30");
    expect(plan.trim.droppedExercises).toEqual([]);
    expect(plan.exercises).toHaveLength(3);
    expect(plan.exercises[0].sets).toBe(5);
    for (const e of plan.exercises.slice(1)) {
      expect(e.sets).toBeGreaterThanOrEqual(COMPOUND_MIN_SETS);
    }
  });

  it("maps every plan position back to its ORIGINAL day index", () => {
    // Dropping a middle accessory must not shift later exercises'
    // source indexes — progression and the completion write index into
    // the STORED day, so a off-by-one here trains the wrong lift.
    const d = day([
      ex("Bench Press", 4, false), // src 0
      ex("Cable Fly", 4, true), // src 1 — dropped first (from end… )
      ex("Overhead Press", 4, false), // src 2
      ex("Lateral Raise", 4, true), // src 3
      ex("Tricep Pushdown", 4, true), // src 4
    ]); // 20 sets = 50 min
    const plan = buildExpressSession(d, "express30"); // 12-set budget
    // Every surviving exercise's sourceIndex points at the exercise
    // with the same identity in the original day.
    plan.exercises.forEach((e, i) => {
      expect(d.exercises[plan.sourceIndexes[i]].exerciseId).toBe(e.exerciseId);
    });
    // Compounds always survive with their original positions intact.
    expect(plan.sourceIndexes).toContain(0);
    expect(plan.sourceIndexes).toContain(2);
  });

  it("full plan maps positions 1:1", () => {
    const plan = buildExpressSession(typicalPushDay(), "full");
    expect(plan.sourceIndexes).toEqual([0, 1, 2, 3, 4]);
  });

  it("is deterministic and never mutates the input day", () => {
    const d = typicalPushDay();
    const before = JSON.stringify(d);
    const a = buildExpressSession(d, "express30");
    const b = buildExpressSession(d, "express30");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(d)).toBe(before);
    // Trimmed plan objects are fresh, not aliases into the day.
    expect(a.exercises[0]).not.toBe(d.exercises[0]);
  });
});

describe("expressChoices — only offer budgets that change something", () => {
  it("short day (≤30 min) offers full only — chooser is skipped", () => {
    const d = day([ex("Bench Press", 4, false), ex("Row", 4, false)]); // 20 min
    expect(expressChoices(d)).toEqual(["full"]);
  });

  it("mid day (>30, ≤45) offers full + 30", () => {
    expect(expressChoices(typicalPushDay())).toEqual(["full", "express30"]); // 43 min
  });

  it("long day (>45) offers all three", () => {
    const d = day([
      ex("Squat", 5, false),
      ex("RDL", 5, false),
      ex("Leg Press", 4, true),
      ex("Leg Curl", 4, true),
      ex("Calf Raise", 4, true),
    ]); // 22 sets = 55 min
    expect(expressChoices(d)).toEqual(["full", "express45", "express30"]);
  });
});

describe("summarizeTrim", () => {
  it("describes drops and reductions compactly", () => {
    expect(summarizeTrim({ droppedExercises: ["A"], reducedSets: [] })).toBe(
      "1 accessory trimmed"
    );
    expect(
      summarizeTrim({
        droppedExercises: ["A", "B"],
        reducedSets: [{ name: "C", from: 5, to: 3 }],
      })
    ).toBe("2 accessories trimmed · sets reduced on 1 exercise");
    expect(summarizeTrim({ droppedExercises: [], reducedSets: [] })).toBe(
      "no changes needed"
    );
  });
});
