import { describe, it, expect } from "vitest";
import { qualityRunDaysOf } from "@/features/program/runPlacement";
import {
  orderForAdjacency,
  sessionsBeforeLongRuns,
  sessionsBeforeQualityRuns,
} from "@/features/program/overlapModel";
import {
  heatHoldsBenchmark,
  marathonDurabilityRange,
  predictedRaceTimesFromFitness,
} from "@/lib/runPaces";
import {
  benchmarkEffortOf,
  HILLY_BENCHMARK_GAIN_PER_KM,
} from "@/lib/benchmarkEfforts";
import {
  judgementCreditsFor,
  weeklyVolumeByJudgementMuscle,
} from "@/features/program/volumeModel";
import { performedWeeklyVolume } from "@/lib/performedVolume";
import type { WorkoutDay } from "@/features/program/programTypes";

function makeWorkoutDay(
  dayName: string,
  exercises: Array<{
    exerciseId: string;
    name: string;
    movementCategory: WorkoutDay["exercises"][number]["movementCategory"];
    sets: number;
  }>
): WorkoutDay {
  return {
    dayName,
    dayType: "strength",
    completed: false,
    exercises: exercises.map((ex) => ({
      ...ex,
      reps: 8,
      weight: 60,
      progressionType: "double",
      lastSuccessfulWeight: 60,
      lastAttemptedWeight: 60,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: null,
    })),
  };
}

describe("quality-run DOMS protection", () => {
  // weekSchedule is indexed 0 (Sun) .. 6 (Sat)
  const schedule = [
    { day: 0, type: "run" }, // Sun (long)
    { day: 1, type: "lift" }, // Mon
    { day: 2, type: "run" }, // Tue
    { day: 3, type: "lift" }, // Wed
    { day: 4, type: "run" }, // Thu
    { day: 5, type: "rest" }, // Fri
    { day: 6, type: "lift" }, // Sat (eve of Sun long)
  ];

  it("identifies quality run days and separates quality eves from long-run eves", () => {
    const qDays = qualityRunDaysOf(schedule);
    expect(qDays).toHaveLength(1);
    expect(qDays[0]).not.toBe(0); // not the Sunday long run

    const longEves = sessionsBeforeLongRuns(schedule, 3);
    const qualityEves = sessionsBeforeQualityRuns(schedule, 3);
    expect(longEves).toEqual([2]); // Sat lift (index 2) before Sun long run
    for (const qEve of qualityEves) {
      expect(longEves).not.toContain(qEve);
    }
  });

  it("returns 2 quality days when a week holds 5+ run days and 0 for < 2 run days", () => {
    const fiveRuns = [
      { day: 0, type: "run" },
      { day: 1, type: "run" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "run" },
      { day: 6, type: "rest" },
    ];
    expect(qualityRunDaysOf(fiveRuns)).toHaveLength(2);
    expect(qualityRunDaysOf([{ day: 0, type: "run" }])).toEqual([]);
  });

  it("moves heavy legs away from a quality-run eve while keeping long-run eve priority", () => {
    const twoDaySchedule = [
      { day: 0, type: "run" }, // Sun long
      { day: 1, type: "rest" },
      { day: 2, type: "lift" }, // Tue (index 0, not before a run)
      { day: 3, type: "rest" },
      { day: 4, type: "lift" }, // Thu (index 1, eve of Fri quality run)
      { day: 5, type: "run" }, // Fri quality
      { day: 6, type: "rest" },
    ];
    const qEves = sessionsBeforeQualityRuns(twoDaySchedule, 2);
    expect(qEves).toEqual([1]); // Thu (index 1) before Fri quality run

    const legs = makeWorkoutDay("Lower", [
      {
        exerciseId: "squat",
        name: "Back Squat",
        movementCategory: "knee_dominant",
        sets: 4,
      },
      {
        exerciseId: "romanian-deadlift",
        name: "Romanian Deadlift",
        movementCategory: "hip_dominant",
        sets: 4,
      },
    ]);
    const upper = makeWorkoutDay("Upper", [
      {
        exerciseId: "bench-press",
        name: "Bench Press",
        movementCategory: "horizontal_push",
        sets: 4,
      },
    ]);

    const ordered = orderForAdjacency([upper, legs], twoDaySchedule);
    expect(ordered[1].dayName).toBe("Upper");
    expect(ordered[0].dayName).toBe("Lower");
  });
});

describe("mileage-based marathon durability range", () => {
  const fitness = {
    benchmark: { distanceM: 5000, timeS: 1500 }, // 25:00 5K
    vdot: null,
    source: "derived" as const,
  };

  it("widens durability range on low mileage, caps at +12%, and narrows/clears on high mileage", () => {
    const times = predictedRaceTimesFromFitness(fitness)!;
    const lowMileage = marathonDurabilityRange(fitness, 20);
    const medMileage = marathonDurabilityRange(fitness, 55);
    const highMileage = marathonDurabilityRange(fitness, 110);

    expect(lowMileage).not.toBeNull();
    expect(lowMileage!.fastS).toBe(times.marathon);
    expect(lowMileage!.slowS).toBeLessThanOrEqual(
      Math.round(times.marathon * 1.12)
    );
    expect(medMileage).not.toBeNull();
    expect(medMileage!.slowS).toBeLessThan(lowMileage!.slowS);
    expect(highMileage).toBeNull();
  });

  it("falls back to +5% when recentWeeklyKm is absent for VDOT < 55 and null for >= 55", () => {
    const times = predictedRaceTimesFromFitness(fitness)!;
    expect(marathonDurabilityRange(fitness, null)).toEqual({
      fastS: times.marathon,
      slowS: Math.round(times.marathon * 1.05),
    });

    const elite = {
      benchmark: { distanceM: 5000, timeS: 1050 }, // 17:30 5K (VDOT > 55)
      vdot: null,
      source: "race" as const,
    };
    expect(marathonDurabilityRange(elite, null)).toBeNull();
  });
});

describe("hill-protected VDOT benchmarks", () => {
  it("stamps hillyRun when elevation gain per km reaches HILLY_BENCHMARK_GAIN_PER_KM", () => {
    const flat = benchmarkEffortOf({
      distance: 5000,
      duration: 1500,
      avgPace: 300,
      activityType: "race",
      elevationGain: 40, // 8 m/km
    });
    const hilly = benchmarkEffortOf({
      distance: 5000,
      duration: 1650,
      avgPace: 330,
      activityType: "race",
      elevationGain: HILLY_BENCHMARK_GAIN_PER_KM * 5, // 15 m/km
    });

    expect(flat?.hillyRun).toBeUndefined();
    expect(hilly?.hillyRun).toBe(true);
  });

  it("holds benchmark VDOT on a slower hilly effort while still allowing faster hilly efforts to raise it", () => {
    const hillyEffort = benchmarkEffortOf({
      distance: 5000,
      duration: 1650,
      avgPace: 330,
      activityType: "race",
      elevationGain: 100,
    })!;
    expect(heatHoldsBenchmark({ effort: hillyEffort, vdot: 35 }, 42)).toBe(
      true
    );
    expect(heatHoldsBenchmark({ effort: hillyEffort, vdot: 45 }, 42)).toBe(
      false
    );
  });
});

describe("fractional (0.5×) synergist volume counting", () => {
  it("keeps ADR-0010 1:1 default and halves secondary muscle credits at 0.5×", () => {
    const bench = {
      exerciseId: "bench-press",
      movementCategory: "horizontal_push" as const,
    };
    const fullCredits = judgementCreditsFor(bench)!;
    const fractionalCredits = judgementCreditsFor(bench, 0.5)!;

    expect(fullCredits.get("Chest")).toBe(1);
    expect(fullCredits.get("Triceps")).toBe(1);
    expect(fractionalCredits.get("Chest")).toBe(1);
    expect(fractionalCredits.get("Triceps")).toBe(0.5);

    const day = [{ exercises: [{ ...bench, sets: 4 }] }];
    const fullVol = weeklyVolumeByJudgementMuscle(day);
    const fracVol = weeklyVolumeByJudgementMuscle(day, 0.5);
    expect(fullVol.find((r) => r.muscle === "Triceps")?.sets).toBe(4);
    expect(fracVol.find((r) => r.muscle === "Triceps")?.sets).toBe(2);
  });

  it("propagates secondaryWeight through performedWeeklyVolume", () => {
    const workouts = [
      {
        date: "2026-11-16",
        exercises: [
          {
            exerciseId: "bench-press",
            exerciseName: "Bench Press",
            sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }],
          },
        ],
      },
    ];
    const opts = {
      weekKeys: ["2026-11-16"],
      primaryGoal: "hypertrophy",
    };
    const full = performedWeeklyVolume(workouts, opts);
    const frac = performedWeeklyVolume(workouts, {
      ...opts,
      secondaryWeight: 0.5,
    });
    expect(full.find((r) => r.muscle === "Chest")?.setsPerWeek).toBe(4);
    expect(full.find((r) => r.muscle === "Triceps")?.setsPerWeek).toBe(4);
    expect(frac.find((r) => r.muscle === "Chest")?.setsPerWeek).toBe(4);
    expect(frac.find((r) => r.muscle === "Triceps")?.setsPerWeek).toBe(2);
  });
});
