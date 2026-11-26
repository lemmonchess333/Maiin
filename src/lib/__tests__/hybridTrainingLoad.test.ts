import { describe, it, expect } from "vitest";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";
import { computeHybridTrainingLoad } from "@/lib/hybridTrainingLoad";

const TODAY = "2026-10-20";

function daysAgoKey(daysAgo: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  return localDateString(
    addLocalDays(new Date(y, m - 1, d, 12, 0, 0), -daysAgo)
  );
}

function makeLift(daysAgo: number, workingSets = 16, rpe = 8) {
  return {
    date: daysAgoKey(daysAgo),
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        category: "Chest",
        caloriesBurned: 120,
        sets: Array.from({ length: workingSets }, (_, idx) => ({
          setNumber: idx + 1,
          type: "working" as const,
          weightKg: 80,
          reps: 8,
          rpe,
        })),
      },
    ],
  };
}

function makeRun(
  daysAgo: number,
  durationSec = 2400,
  activityType = "easy",
  overrides: Record<string, unknown> = {}
) {
  return {
    day: daysAgoKey(daysAgo),
    date: daysAgoKey(daysAgo),
    duration: durationSec,
    distance: (durationSec / 300) * 1000,
    activityType,
    type: "run",
    relativeEffort: null,
    isInvalid: false,
    savedAnyway: false,
    ...overrides,
  };
}

describe("computeHybridTrainingLoad", () => {
  it("returns insufficient on empty or sparse history (< 5 active days or < 14 day span)", () => {
    expect(
      computeHybridTrainingLoad({ workouts: [], runs: [], todayKey: TODAY })
        .status
    ).toBe("insufficient");

    // 6 active days all inside the last 7 days (< 14 day span)
    const workouts = [0, 1, 2, 3, 4, 5].map((d) => makeLift(d));
    expect(
      computeHybridTrainingLoad({ workouts, runs: [], todayKey: TODAY }).status
    ).toBe("insufficient");
  });

  it("computes combined lifting + running Fitness, Fatigue, Form and 14-day trend", () => {
    const workouts = [];
    const runs = [];
    for (let d = 56; d >= 0; d -= 2) {
      if (d % 4 === 0) workouts.push(makeLift(d, 16, 8));
      else runs.push(makeRun(d, 2700, "easy"));
    }

    const res = computeHybridTrainingLoad({
      workouts,
      runs,
      todayKey: TODAY,
    });
    expect(res.status).not.toBe("insufficient");
    expect(res.hasLift).toBe(true);
    expect(res.hasRun).toBe(true);
    expect(res.fitness).toBeGreaterThan(10);
    expect(res.fatigue).toBeGreaterThan(10);
    expect(res.form).toBeCloseTo(res.fitness - res.fatigue, 0);
    expect(res.activeDays42d).toBeGreaterThanOrEqual(18);
  });

  it("classifies a tapered week after steady training as fresh (Form >= +5)", () => {
    const runs = [];
    // Steady training from 60 to 9 days ago, then 8 easy/rest days to freshen up
    for (let d = 60; d >= 9; d -= 1) {
      if (d % 2 === 0) runs.push(makeRun(d, 3600, "tempo"));
    }
    const res = computeHybridTrainingLoad({
      workouts: [],
      runs,
      todayKey: TODAY,
    });
    expect(res.status).toBe("fresh");
    expect(res.form).toBeGreaterThanOrEqual(5);
  });

  it("classifies a sudden heavy spike over the last 5 days as building or overreaching", () => {
    const runs = [];
    const workouts = [];
    // Light baseline 40..10 days ago
    for (let d = 40; d >= 10; d -= 5) {
      runs.push(makeRun(d, 1800, "easy"));
    }
    // Sudden heavy double-day spike in last 5 days
    for (let d = 4; d >= 0; d -= 1) {
      runs.push(makeRun(d, 4800, "tempo", { relativeEffort: "harder" }));
      workouts.push(makeLift(d, 20, 9.5));
    }
    const res = computeHybridTrainingLoad({
      workouts,
      runs,
      todayKey: TODAY,
    });
    expect(["building", "overreaching"]).toContain(res.status);
    expect(res.form).toBeLessThan(-10);
    expect(res.fitnessDelta14d).toBeGreaterThan(0);
  });

  it("ignores invalid runs not marked savedAnyway", () => {
    const runs = [];
    for (let d = 30; d >= 0; d -= 3) {
      runs.push(
        makeRun(d, 2400, "easy", { isInvalid: true, savedAnyway: false })
      );
    }
    const res = computeHybridTrainingLoad({
      workouts: [],
      runs,
      todayKey: TODAY,
    });
    expect(res.status).toBe("insufficient");
  });

  it("does not falsely flag a consistent 21-day cold-start athlete as overreaching", () => {
    const workouts = [];
    const runs = [];
    // Steady alternating training for the first 21 days only (no prior history).
    for (let d = 20; d >= 0; d -= 2) {
      if (d % 4 === 0) workouts.push(makeLift(d, 16, 8));
      else runs.push(makeRun(d, 40 * 60, "easy"));
    }
    const res = computeHybridTrainingLoad({
      workouts,
      runs,
      todayKey: TODAY,
    });
    expect(res.status).toBe("optimal");
    expect(Math.abs(res.form)).toBeLessThan(8);
    expect(res.series).toHaveLength(21);
    expect(res.series.some((p) => p.liftLoad > 0)).toBe(true);
    expect(res.series.some((p) => p.runLoad > 0)).toBe(true);
  });

  it("projects upcoming plan load and race-day taper freshness when a race is within 21 days", () => {
    const workouts = [];
    const runs = [];
    for (let d = 48; d >= 0; d -= 2) {
      if (d % 4 === 0) workouts.push(makeLift(d, 16, 8));
      else runs.push(makeRun(d, 50 * 60, "tempo"));
    }
    const raceDate = localDateString(
      addLocalDays(new Date(2026, 9, 20, 12, 0, 0), 10)
    );
    const res = computeHybridTrainingLoad({
      workouts,
      runs,
      todayKey: TODAY,
      programState: {
        goal: "recomp",
        currentPhase: "Taper",
        weekNumber: 8,
        splitType: "upper_lower",
        updatedAt: Date.now(),
        workouts: [
          {
            dayName: "Upper",
            dayType: "upper",
            completed: false,
            exercises: [
              {
                exerciseId: "bench-press",
                instanceId: "bp-1",
                name: "Bench Press",
                movementCategory: "horizontal_push",
                sets: 4,
                reps: 6,
                weight: 80,
                restSeconds: 120,
                progressionType: "linear",
                lastSuccessfulWeight: 80,
                lastAttemptedWeight: 80,
                consecutiveFailures: 0,
                plateauCount: 0,
                performanceHistory: [],
                lastPerformance: {
                  sets: 4,
                  reps: 6,
                  weight: 80,
                  completed: true,
                },
              },
            ],
          },
        ],
        runDays: [
          { dayIndex: 2, templateId: "easy_30min", type: "easy" },
          { dayIndex: 4, templateId: "easy_30min", type: "easy" },
          { dayIndex: 6, templateId: "race", type: "race", date: raceDate },
        ],
        runPlan: {
          mode: "race_prep",
          raceGoal: { distance: "half_marathon", targetDate: raceDate },
        } as never,
      },
    });
    expect(res.projectedSeries.length).toBeGreaterThanOrEqual(14);
    expect(res.raceDayProjection).not.toBeNull();
    expect(res.raceDayProjection?.date).toBe(raceDate);
    expect(res.raceDayProjection!.form).toBeGreaterThan(res.form);
  });
});
