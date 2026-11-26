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
});
