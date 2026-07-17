/**
 * Easier today (PROGRAM-ADAPT-01) — pure engine pins.
 *
 * The contract under test:
 *   - execution CLONE: identity + order preserved, nothing dropped,
 *     input day never mutated, deterministic
 *   - every exercise loses one set (primary floor 2, accessory floor 1)
 *   - non-zero loads follow the EXISTING deload policy (×0.85, nearest
 *     2.5 kg) — pinned equal to programEngine.applyDeload so the two
 *     can never drift; zero (bodyweight/uncalibrated) stays zero
 *   - recommendation: strong existing signals only, ONE factual reason,
 *     no readiness percentage, deterministic priority order
 *   - signal helpers: lower-body via movementCategory, recovering
 *     target muscles via the recovery model's resolution rules
 */
import { describe, it, expect } from "vitest";
import {
  buildEasierSession,
  deloadWeight,
  easierTodayRecommendation,
  isLowerBodyDay,
  recoveringTargetMuscles,
  summarizeEasier,
  EASIER_PRIMARY_MIN_SETS,
  EASIER_ACCESSORY_MIN_SETS,
} from "../easierToday";
import { applyDeload } from "../programEngine";
import type {
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "../programTypes";
import type { MuscleRecoveryEntry } from "@/lib/muscleRecovery";

let uid = 0;
function ex(
  name: string,
  sets: number,
  weight: number,
  opts: {
    isAccessory?: boolean;
    movementCategory?: MovementCategory;
    exerciseId?: string;
  } = {}
): ProgramExercise {
  return {
    name,
    exerciseId:
      opts.exerciseId ?? `${name.toLowerCase().replace(/\s+/g, "-")}-${uid++}`,
    movementCategory: opts.movementCategory ?? "horizontal_push",
    sets,
    reps: 8,
    weight,
    progressionType: "double",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...(opts.isAccessory === undefined
      ? {}
      : { isAccessory: opts.isAccessory }),
  };
}

function day(exercises: ProgramExercise[]): WorkoutDay {
  return { dayName: "Push", dayType: "push", exercises, completed: false };
}

describe("buildEasierSession", () => {
  it("preserves identity and order, drops nothing, never mutates the input", () => {
    const input = day([
      ex("Bench Press", 4, 80, { isAccessory: false }),
      ex("Overhead Press", 4, 50, { isAccessory: false }),
      ex("Lateral Raise", 3, 10, { isAccessory: true }),
    ]);
    const snapshot = JSON.parse(JSON.stringify(input));
    const plan = buildEasierSession(input);

    expect(plan.exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Overhead Press",
      "Lateral Raise",
    ]);
    expect(plan.sourceIndexes).toEqual([0, 1, 2]);
    expect(input).toEqual(snapshot); // stored prescription untouched
    expect(buildEasierSession(input)).toEqual(plan); // deterministic
  });

  it("reduces every exercise by one set with the primary(2)/accessory(1) floors", () => {
    const plan = buildEasierSession(
      day([
        ex("Bench Press", 4, 80, { isAccessory: false }), // 4 → 3
        ex("Squat", 2, 100, { isAccessory: false }), // floor: stays 2
        ex("Legacy Lift", 2, 60, {}), // undefined = primary → stays 2
        ex("Lateral Raise", 2, 10, { isAccessory: true }), // 2 → 1
        ex("Curl", 1, 12, { isAccessory: true }), // floor: stays 1
      ])
    );
    expect(plan.exercises.map((e) => e.sets)).toEqual([3, 2, 2, 1, 1]);
    expect(
      plan.exercises.every((e) => e.sets >= EASIER_ACCESSORY_MIN_SETS)
    ).toBe(true);
    expect(
      plan.exercises
        .filter((e) => e.isAccessory !== true)
        .every((e) => e.sets >= EASIER_PRIMARY_MIN_SETS)
    ).toBe(true);
  });

  it("reduces non-zero loads via the deload policy and keeps zero loads at zero", () => {
    const plan = buildEasierSession(
      day([
        ex("Bench Press", 4, 80, { isAccessory: false }), // 80×0.85=68 → 67.5
        ex("Push-Up", 3, 0, { isAccessory: false }), // bodyweight → 0
      ])
    );
    expect(plan.exercises[0].weight).toBe(67.5);
    expect(plan.exercises[1].weight).toBe(0);
  });

  it("deloadWeight is pinned EQUAL to programEngine.applyDeload's weight rule", () => {
    // The one rule, two call sites — this pin is what stops drift.
    for (const w of [0, 12.5, 20, 42.5, 60, 77.5, 80, 102.5, 140]) {
      const engineDay = applyDeload([
        day([ex("Probe", 5, w, { isAccessory: false })]),
      ])[0];
      expect(deloadWeight(w)).toBe(engineDay.exercises[0].weight);
    }
  });

  it("summarizes factually", () => {
    const changed = buildEasierSession(
      day([ex("Bench Press", 4, 80, { isAccessory: false })])
    );
    expect(summarizeEasier(changed)).toBe(
      "one set less per lift, lighter loads"
    );
    const floored = buildEasierSession(
      day([ex("Push-Up", 2, 0, { isAccessory: false })])
    );
    expect(summarizeEasier(floored)).toBe("same session, no changes");
  });
});

describe("easierTodayRecommendation", () => {
  const NONE = {
    hardRunYesterday: false,
    lowerBodyDay: false,
    recoveringMuscles: [] as string[],
    deloadRecommended: false,
  };

  it("no signal → not recommended, no reason", () => {
    expect(easierTodayRecommendation(NONE)).toEqual({
      recommended: false,
      reason: null,
    });
  });

  it("hard run + lower-body day → recommended with the run reason", () => {
    const r = easierTodayRecommendation({
      ...NONE,
      hardRunYesterday: true,
      lowerBodyDay: true,
    });
    expect(r.recommended).toBe(true);
    expect(r.reason).toMatch(/hard run yesterday/i);
  });

  it("a hard run WITHOUT lower-body work today is not enough on its own", () => {
    expect(
      easierTodayRecommendation({ ...NONE, hardRunYesterday: true }).recommended
    ).toBe(false);
  });

  it("recovering target muscles → recommended, muscles named factually", () => {
    const r = easierTodayRecommendation({
      ...NONE,
      recoveringMuscles: ["Quads", "Hamstrings"],
    });
    expect(r.recommended).toBe(true);
    expect(r.reason).toBe(
      "Quads and Hamstrings still recovering from recent training"
    );
  });

  it("the existing deload recommendation → recommended", () => {
    const r = easierTodayRecommendation({ ...NONE, deloadRecommended: true });
    expect(r.recommended).toBe(true);
    expect(r.reason).toMatch(/deload/i);
  });

  it("never emits a percentage — one factual sentence only", () => {
    for (const s of [
      { ...NONE, hardRunYesterday: true, lowerBodyDay: true },
      { ...NONE, recoveringMuscles: ["Chest"] },
      { ...NONE, deloadRecommended: true },
    ]) {
      const r = easierTodayRecommendation(s);
      expect(r.reason).not.toMatch(/%|\bpercent\b|\breadiness\b/i);
    }
  });
});

describe("signal helpers", () => {
  it("isLowerBodyDay keys off movementCategory (knee/hip dominant)", () => {
    expect(
      isLowerBodyDay(
        day([ex("Back Squat", 4, 100, { movementCategory: "knee_dominant" })])
      )
    ).toBe(true);
    expect(
      isLowerBodyDay(
        day([ex("Deadlift", 3, 120, { movementCategory: "hip_dominant" })])
      )
    ).toBe(true);
    expect(
      isLowerBodyDay(
        day([ex("Bench Press", 4, 80, { movementCategory: "horizontal_push" })])
      )
    ).toBe(false);
  });

  it("recoveringTargetMuscles intersects day PRIMARY muscles with recovering entries", () => {
    const entries = [
      { muscle: "Quads", status: "recovering" },
      { muscle: "Chest", status: "ready" },
      { muscle: "Hamstrings", status: "nearly" },
    ] as MuscleRecoveryEntry[];
    // Custom-lift ids exercise the movement-category attribution
    // fallback (knee_dominant → Quads, horizontal_push → Chest) — the
    // same rule the weekly volume tally applies.
    const lower = day([
      ex("Back Squat", 4, 100, { movementCategory: "knee_dominant" }),
      ex("Bench Press", 4, 80, { movementCategory: "horizontal_push" }),
      ex("Romanian Deadlift", 3, 90, { movementCategory: "hip_dominant" }),
    ]);
    const result = recoveringTargetMuscles(lower, entries);
    expect(result).toEqual(["Quads"]); // Chest ready, Hamstrings only "nearly"
  });
});
