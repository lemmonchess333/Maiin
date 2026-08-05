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
  draftScopeForVariant,
  estimateSessionMinutes,
  expressChoices,
  summarizeTrim,
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

/** 2 compounds (4 sets) + 3 accessories (3 sets each) = 17 sets.
 *  Under the rest-aware model (2026-08-04) that is ~56 min, not the ~43 the
 *  old `sets × 2.5` blend reported: 5 exercises × (90s setup + 2×60s warm-up)
 *  + 17 × (45s work + 90s rest). The old number omitted warm-ups and setup
 *  entirely, which is why estimates read ~20 min for hour-long sessions. */
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
  it("counts warm-ups, rest and per-exercise setup — not just working sets", () => {
    // 5 × 90s setup + 5 × 2 × 60s warm-up + 17 × (45s + 90s) = 3345s = 56 min.
    expect(estimateSessionMinutes(typicalPushDay().exercises)).toBe(56);
  });

  it("honours a per-exercise rest prescription", () => {
    // The blended constant could not tell a 180s-rest lift from a 60s one.
    const heavy = estimateSessionMinutes([
      { sets: 3, weight: 100, restSeconds: 180 },
    ]);
    const light = estimateSessionMinutes([
      { sets: 3, weight: 100, restSeconds: 60 },
    ]);
    expect(heavy).toBeGreaterThan(light);
  });

  it("charges no warm-up ramp to a bodyweight/uncalibrated lift", () => {
    // Mirrors warmupRamp's own condition — it returns [] for weight <= 0.
    const loaded = estimateSessionMinutes([{ sets: 3, weight: 60 }]);
    const bodyweight = estimateSessionMinutes([{ sets: 3, weight: 0 }]);
    expect(loaded).toBeGreaterThan(bodyweight);
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
    expect(plan.estimatedMinutes).toBe(56);
  });
});

describe("buildExpressSession — trimming policy", () => {
  it("drops whole accessories from the END first (30 min budget)", () => {
    // Under the rest-aware model a 30-minute budget is genuinely tight —
    // 30 real minutes is only ~10 working sets once rest is counted. The
    // policy is unchanged (accessories from the end first, then set
    // reductions, floors respected); it simply cannot pretend to fit as
    // much as the old blend did, and the design explicitly allows running
    // honestly over budget rather than gutting the session.
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
    // Meaningfully shorter than the full session, even where the floors
    // stop it reaching the nominal budget exactly.
    expect(plan.estimatedMinutes).toBeLessThan(
      estimateSessionMinutes(typicalPushDay().exercises)
    );
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
    // The TRIM POLICY is what this test is about, and it is unchanged by
    // the 2026-08-04 rest-aware estimate: drop the last accessory whole,
    // then reduce the remaining accessory 5→4, compounds untouched. Only
    // the absolute minute figure moved (30 → 38) because warm-ups, rest
    // and per-exercise setup are now counted.
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
    expect(plan.estimatedMinutes).toBe(38);
    for (const e of plan.exercises.filter((e) => e.isAccessory)) {
      expect(e.sets).toBeGreaterThanOrEqual(ACCESSORY_MIN_SETS);
    }
  });

  it("runs honestly over budget when floors are reached", () => {
    // Floors bind: anchor keeps 5 sets, the other five drop to the
    // compound floor of 3 = 20 working sets. The point of the test is that
    // the plan SURFACES the real estimate rather than pretending to fit —
    // which matters more now the estimate is honest (66 min, not 50).
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
    expect(plan.estimatedMinutes).toBe(66);
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

describe("expressChoices — only offer budgets whose trim changes something", () => {
  it("short day offers full only — chooser is skipped", () => {
    const d = day([ex("Bench Press", 4, false), ex("Row", 4, false)]); // 8 sets
    expect(expressChoices(d)).toEqual(["full"]);
  });

  it("never offers a variant whose trim is empty", () => {
    // THE SCREENSHOT ROW (operator, 2026-08-05). This 17-set day reads
    // ~56 min on the rest-aware wall clock, so the old estimate-based
    // gate offered express45 — but 17 sets is UNDER the 45 budget's
    // 18-set allowance, so its trim was empty and the sheet rendered
    // "45 min · no changes needed": an option that admits it does
    // nothing. The gate must ask the builder, not the clock.
    const d = typicalPushDay(); // 17 sets
    const offered = expressChoices(d);
    expect(offered).toEqual(["full", "express30"]);
    for (const v of offered) {
      if (v === "full") continue;
      const { trim } = buildExpressSession(d, v);
      expect(
        trim.droppedExercises.length + trim.reducedSets.length,
        `${v} offered with an empty trim`
      ).toBeGreaterThan(0);
    }
  });

  it("a day over BOTH set budgets offers both, each with a real trim", () => {
    const d = day([
      ex("Squat", 5, false),
      ex("RDL", 5, false),
      ex("Leg Press", 4, true),
      ex("Leg Curl", 4, true),
      ex("Calf Raise", 4, true),
    ]); // 22 sets — over 18 (45-budget) and over 12 (30-budget)
    expect(expressChoices(d)).toEqual(["full", "express45", "express30"]);
    const t45 = buildExpressSession(d, "express45").trim;
    const t30 = buildExpressSession(d, "express30").trim;
    expect(
      t45.droppedExercises.length + t45.reducedSets.length
    ).toBeGreaterThan(0);
    // …and the two offers are genuinely DIFFERENT sessions — identical
    // trims collapse to the tighter budget, so the same cut is never
    // dressed up as two choices.
    expect(JSON.stringify(t45)).not.toBe(JSON.stringify(t30));
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

describe("draftScopeForVariant", () => {
  it("gives every non-full variant its own draft namespace", () => {
    // The draft fingerprint covers layout, not loads — an easier clone
    // with all set-floors bound would collide with the full session
    // without this separation (wrong sessionVariant on completion).
    expect(draftScopeForVariant("full")).toBe("programme");
    expect(draftScopeForVariant("express45")).toBe("programme:express45");
    expect(draftScopeForVariant("express30")).toBe("programme:express30");
    expect(draftScopeForVariant("easier_today")).toBe("programme:easier_today");
    const scopes = (
      ["full", "express45", "express30", "easier_today"] as const
    ).map(draftScopeForVariant);
    expect(new Set(scopes).size).toBe(scopes.length);
  });
});
