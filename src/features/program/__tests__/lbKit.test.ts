/**
 * Lift18 stage B: an lb lifter's loads round to lb kit, still stored as kg.
 * A plan whose `settings.loadUnit` is "lbs" steps 5 lb on a 45 lb bar, picks
 * the next pair on an lb dumbbell rack, warms up from the 45 lb bar, and
 * starts, eases and re-prescribes on the same kit. A plan without the
 * setting is the kg plan it always was.
 */
import { describe, it, expect } from "vitest";
import { kgToLb, lbToKg } from "@/lib/weightUnits";
import { loadGridFor } from "../loadSteps";
import { applySessionProgression } from "../sessionCompletion";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { warmupRamp } from "../warmupRamp";
import { easierWeight } from "../easierToday";
import { startingWeightForExercise } from "../startingLoads";
import { scaleLoadForReps } from "../represcribe";
import { platesInKit } from "@/lib/plateMath";

const lb = (kg: number) => Math.round(kgToLb(kg) * 1000) / 1000;

describe("the lb kit's grids", () => {
  it("a barbell steps 5 lb, or 2.5 lb with small plates", () => {
    const plates = loadGridFor("bench-press", false, "lbs");
    expect(lb(plates.above(lbToKg(135)))).toBe(140);
    expect(lb(plates.nearest(60))).toBe(130); // 132.3 lb
    const small = loadGridFor("bench-press", true, "lbs");
    expect(lb(small.above(lbToKg(135)))).toBe(137.5);
  });

  it("dumbbells go up the lb rack", () => {
    const rack = loadGridFor("db-bench", false, "lbs");
    expect(lb(rack.above(lbToKg(15)))).toBe(20);
    expect(lb(rack.above(lbToKg(10)))).toBe(12);
    expect(lb(rack.nearest(lbToKg(11)))).toBe(10);
  });

  it("a machine steps 5 lb", () => {
    expect(lb(loadGridFor("leg-press", false, "lbs").above(lbToKg(200)))).toBe(
      205
    );
  });

  it("is the kg kit when the plan has no lb setting", () => {
    expect(loadGridFor("bench-press", false).above(60)).toBe(62.5);
    expect(loadGridFor("bench-press", false, "kg").above(60)).toBe(62.5);
  });
});

const plan = (loadUnit?: "kg" | "lbs"): ProgramState =>
  normalizeProgramState({
    weekNumber: 2,
    goal: "recomp",
    currentPhase: "progression",
    splitType: "full_body",
    workouts: [
      {
        dayName: "Full body A",
        dayType: "full_body",
        completed: false,
        exercises: [
          {
            instanceId: "squat-1",
            exerciseId: "squat",
            name: "Squat",
            movementCategory: "knee_dominant",
            sets: 3,
            reps: 5,
            weight: lbToKg(135),
            progressionType: "linear",
          },
        ],
      },
    ],
    settings: {
      autoProgression: true,
      smallPlates: false,
      ...(loadUnit ? { loadUnit } : {}),
    },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);

const hitEverySet = (state: ProgramState) => {
  const lifts = state.workouts[0].exercises;
  return applySessionProgression(state, 0, {
    completionId: "session-0",
    date: "2026-10-14",
    prescription: { exercises: lifts, progressionBaseline: lifts },
    setLogs: lifts.map((lift) =>
      Array.from({ length: 3 }, () => ({
        weight: lift.weight,
        reps: lift.reps,
        completed: true,
      }))
    ),
  });
};

describe("a finished session on an lb plan", () => {
  it("steps the squat to the next lb plate, from settings.loadUnit", () => {
    const next = hitEverySet(plan("lbs")).workouts[0].exercises[0];
    expect(lb(next.weight)).toBe(140);
  });

  it("keeps the setting through normalising", () => {
    expect(plan("lbs").settings?.loadUnit).toBe("lbs");
    expect(plan().settings?.loadUnit).toBeUndefined();
  });

  it("is the kg step on a plan without it", () => {
    const next = hitEverySet(plan()).workouts[0].exercises[0];
    // 61.24 kg goes to the next 2.5 kg plate pair.
    expect(next.weight).toBe(62.5);
  });
});

describe("warm-ups, an easier day, a start and a block's re-prescription", () => {
  it("warms up from the 45 lb bar in 5 lb steps", () => {
    const ramp = warmupRamp(lbToKg(225), "Barbell", 5, "lbs");
    expect(ramp.map((set) => lb(set.weight))).toEqual([45, 115, 160, 190]);
  });

  it("an easier day lands on the lb kit, never under the 45 lb bar", () => {
    expect(
      lb(
        easierWeight({ exerciseId: "squat", weight: lbToKg(225) }, false, "lbs")
      )
    ).toBe(190);
    expect(
      lb(
        easierWeight({ exerciseId: "squat", weight: lbToKg(45) }, false, "lbs")
      )
    ).toBe(45);
  });

  it("a start for an lb lifter is one their kit makes", () => {
    const start = startingWeightForExercise("squat", "knee_dominant", {
      bodyweightKg: 80,
      experience: "beginner",
      unit: "lbs",
    });
    expect(lb(start) % 5).toBe(0);
    const dumbbell = startingWeightForExercise("db-bench", "horizontal_push", {
      bodyweightKg: 80,
      experience: "beginner",
      unit: "lbs",
    });
    expect([3, 5, 8, 10, 12, 15]).toContain(
      lb(dumbbell) <= 15 ? lb(dumbbell) : 15
    );
    expect(lb(dumbbell) <= 15 || lb(dumbbell) % 5 === 0).toBe(true);
  });

  it("a block's new rep range rescales onto 5 lb", () => {
    expect(lb(scaleLoadForReps(lbToKg(225), 5, 10, "lbs")) % 5).toBe(0);
    expect(scaleLoadForReps(100, 5, 10) % 2.5).toBe(0);
  });
});

describe("the plate calculator on an lb kit", () => {
  it("loads a 45 lb bar with lb plates", () => {
    const load = platesInKit(lbToKg(225), "lbs");
    expect(load?.bar).toBe(45);
    expect(load?.perSide).toEqual([{ plate: 45, count: 2 }]);
    expect(load?.remainder).toBe(0);
  });

  it("says what a kg load from before the switch misses by", () => {
    const load = platesInKit(60, "lbs");
    expect(load?.loadable).toBe(130);
    expect(load?.remainder).toBeCloseTo(2.28, 2);
  });
});
