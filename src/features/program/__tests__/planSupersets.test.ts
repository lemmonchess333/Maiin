import { describe, expect, it } from "vitest";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { getExerciseById } from "@/lib/exercises";
import { estimateSessionSeconds } from "../expressSession";
import { pairRuns, pairedWithNext } from "../pairSlot";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import {
  canPair,
  plannedSupersets,
  plansPairs,
  withoutPairs,
  writePairs,
} from "../planSupersets";
import type { ProgramExercise, WorkoutDay } from "../programTypes";
import { restSecondsFor } from "../restTime";
import { sessionPrescription } from "../sessionCompletion";
import { sessionFits } from "../sessionFit";

function lift(
  exerciseId: string,
  opts: { main?: boolean; sets?: number; reps?: number } = {}
): ProgramExercise {
  const known = getExerciseById(exerciseId);
  if (!known) throw new Error(`no exercise ${exerciseId}`);
  return {
    name: known.name,
    exerciseId,
    instanceId: `slot-${exerciseId}`,
    movementCategory: inferMovementCategory(known.name, exerciseId),
    sets: opts.sets ?? 3,
    reps: opts.reps ?? 10,
    weight: 20,
    progressionType: "double",
    lastSuccessfulWeight: 20,
    lastAttemptedWeight: 20,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: opts.main ? false : true,
  } as ProgramExercise;
}

describe("which plans pair their lifts (Lift22 call 1)", () => {
  it("pairs in 30 and 45 minute plans past beginner", () => {
    expect(plansPairs(30, "intermediate")).toBe(true);
    expect(plansPairs(45, "advanced")).toBe(true);
  });

  it("keeps straight sets from an hour, for a beginner, and with no length", () => {
    expect(plansPairs(60, "intermediate")).toBe(false);
    expect(plansPairs(45, "beginner")).toBe(false);
    expect(plansPairs(Number.POSITIVE_INFINITY, "intermediate")).toBe(false);
  });
});

describe("what may pair (Lift22 calls 2 and 3, STATUS 2026-11-12)", () => {
  it("pairs two isolations for different muscles", () => {
    expect(canPair(lift("db-curl"), lift("face-pulls"))).toBe(true);
    expect(canPair(lift("rope-tricep-pushdown"), lift("lateral-raise"))).toBe(
      true
    );
  });

  it("pairs a supporting machine or dumbbell lift with an isolation for another muscle", () => {
    expect(canPair(lift("hack-squat"), lift("standing-calf-raise"))).toBe(true);
    expect(canPair(lift("db-bench"), lift("db-curl"))).toBe(true);
  });

  it("never pairs one muscle twice", () => {
    expect(canPair(lift("db-curl"), lift("hammer-curl"))).toBe(false);
  });

  it("never pairs two supporting compounds", () => {
    expect(canPair(lift("db-bench"), lift("db-shoulder-press"))).toBe(false);
  });

  it("never pairs a barbell lift or the main lift", () => {
    expect(canPair(lift("barbell-row"), lift("db-curl"))).toBe(false);
    expect(canPair(lift("db-curl", { main: true }), lift("face-pulls"))).toBe(
      false
    );
  });
});

describe("writing a day's pairs", () => {
  it("pairs from the end of the day, passing over a lift that cannot pair", () => {
    const day = writePairs([
      lift("squat", { main: true }),
      lift("romanian-deadlift"),
      lift("hack-squat"),
      lift("leg-extension"),
      lift("standing-calf-raise"),
    ]);
    // Leg extension and calf raise pair; the hack squat cannot pair with
    // the leg extension (both quads), and the Romanian deadlift is a
    // barbell lift.
    expect(day.map((_, i) => pairedWithNext(day, i))).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it("leaves the lifts it was given as they were", () => {
    const given = [lift("db-curl"), lift("face-pulls")];
    writePairs(given);
    expect(given.every((ex) => ex.supersetWith === undefined)).toBe(true);
  });

  it("clears pairs that no longer stand", () => {
    const paired = writePairs([lift("db-curl"), lift("face-pulls")]);
    expect(withoutPairs(paired).some((ex) => ex.supersetWith)).toBe(false);
  });

  it("ends a pair when a lift moves between the two", () => {
    const [curl, pull] = writePairs([lift("db-curl"), lift("face-pulls")]);
    const moved = [curl, lift("lateral-raise"), pull];
    expect(pairedWithNext(moved, 0)).toBe(false);
    expect(pairRuns(moved).map((run) => run.length)).toEqual([1, 1, 1]);
  });
});

describe("a pair on the clock (Lift22 call 4)", () => {
  it("rests once a round, after its second lift", () => {
    const straight = [lift("db-curl"), lift("face-pulls")];
    const paired = writePairs(straight);
    const rest = { sessionMinutes: 45 };
    const curlRest = restSecondsFor(straight[0], rest);
    expect(
      estimateSessionSeconds(straight, rest) -
        estimateSessionSeconds(paired, rest)
    ).toBe(3 * curlRest);
  });
});

describe("a pair in the session (Lift22 call 5)", () => {
  it("opens as the session's superset", () => {
    const day = writePairs([
      lift("bench-press", { main: true }),
      lift("rope-tricep-pushdown"),
      lift("lateral-raise"),
    ]);
    expect(plannedSupersets(day)).toEqual([
      { ids: ["slot-rope-tricep-pushdown", "slot-lateral-raise"] },
    ]);
    const prescription = sessionPrescription(
      { dayName: "Push", exercises: day },
      "completion-1"
    );
    expect(prescription.supersets).toEqual(plannedSupersets(day));
  });

  it("opens no superset on a day with no pair", () => {
    const prescription = sessionPrescription(
      { dayName: "Push", exercises: [lift("bench-press", { main: true })] },
      "completion-1"
    );
    expect(prescription.supersets).toBeUndefined();
  });
});

describe("a new plan's pairs", () => {
  const weekOf = (
    liftDays: number,
    sessionMinutes: number,
    experience: string
  ): WorkoutDay[] =>
    (
      buildPlan({
        primaryGoal: "hypertrophy",
        nutritionPhase: "recomp",
        experience,
        sessionMinutes,
        bodyweightKg: 80,
        sex: "male",
        liftDays,
        preferredSplit: "auto",
        runMode: "freeform",
        weeklyRunDays: 0,
        equipment: "full_gym",
        injuries: [],
        currentDate: "2026-11-09",
      } as unknown as PlanBuilderInput) as unknown as {
        programState: { workouts: WorkoutDay[] };
      }
    ).programState.workouts;

  const pairsIn = (week: WorkoutDay[]) =>
    week.flatMap((d) =>
      d.exercises.flatMap((ex, i) =>
        pairedWithNext(d.exercises, i) ? [[ex, d.exercises[i + 1]]] : []
      )
    );

  it("pairs a 45-minute week, each pair by the rules and each day inside its length", () => {
    for (const days of [3, 4, 5, 6]) {
      const week = weekOf(days, 45, "intermediate");
      for (const [a, b] of pairsIn(week))
        expect(canPair(a, b), `${a.exerciseId} + ${b.exerciseId}`).toBe(true);
      for (const d of week)
        expect(sessionFits(d.exercises, 45), d.dayName).toBe(true);
    }
    expect(pairsIn(weekOf(6, 45, "intermediate")).length).toBeGreaterThan(0);
  });

  it("writes no pair into an hour's plan or a beginner's", () => {
    expect(pairsIn(weekOf(6, 60, "intermediate"))).toEqual([]);
    expect(pairsIn(weekOf(6, 45, "beginner"))).toEqual([]);
  });
});
