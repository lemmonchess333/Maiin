import { describe, it, expect } from "vitest";
import { getRepBucket, repBucketLabel, buildPRMap, checkSetPR } from "../prTracking";
import type { RepBucket } from "../prTracking";

describe("getRepBucket", () => {
  it.each([
    [1, "1rm"],
    [2, "3rm"],
    [3, "3rm"],
    [4, "5rm"],
    [5, "5rm"],
    [6, "8rm"],
    [8, "8rm"],
    [9, "10rm"],
    [10, "10rm"],
    [15, "10rm"],
    [20, "10rm"],
  ] as [number, RepBucket][])("maps %i reps → %s", (reps, expected) => {
    expect(getRepBucket(reps)).toBe(expected);
  });
});

describe("repBucketLabel", () => {
  it.each([
    ["1rm", "1-Rep Max"],
    ["3rm", "3-Rep Max"],
    ["5rm", "5-Rep Max"],
    ["8rm", "8-Rep Max"],
    ["10rm", "10+ Rep Max"],
  ] as [RepBucket, string][])("%s → %s", (bucket, label) => {
    expect(repBucketLabel(bucket)).toBe(label);
  });
});

describe("buildPRMap", () => {
  it("picks highest weight per bucket per exercise", () => {
    const workouts = [
      {
        date: "2025-01-01",
        exercises: [{
          exerciseName: "Bench Press",
          sets: [
            { weightKg: 80, reps: 5 },
            { weightKg: 85, reps: 5 },
            { weightKg: 100, reps: 1 },
          ],
        }],
      },
      {
        date: "2025-01-03",
        exercises: [{
          exerciseName: "Bench Press",
          sets: [
            { weightKg: 82.5, reps: 5 },
            { weightKg: 90, reps: 3 },
          ],
        }],
      },
    ];

    const map = buildPRMap(workouts);
    expect(map["Bench Press"]["5rm"]?.weight).toBe(85);
    expect(map["Bench Press"]["1rm"]?.weight).toBe(100);
    expect(map["Bench Press"]["3rm"]?.weight).toBe(90);
    expect(map["Bench Press"]["8rm"]).toBeNull();
    expect(map["Bench Press"]["10rm"]).toBeNull();
  });

  it("ignores sets with zero weight", () => {
    const map = buildPRMap([{
      date: "2025-01-01",
      exercises: [{
        exerciseName: "Push Ups",
        sets: [{ weightKg: 0, reps: 20 }],
      }],
    }]);
    expect(map["Push Ups"]["10rm"]).toBeNull();
  });

  it("handles multiple exercises", () => {
    const map = buildPRMap([{
      date: "2025-01-01",
      exercises: [
        { exerciseName: "Squat", sets: [{ weightKg: 120, reps: 5 }] },
        { exerciseName: "Deadlift", sets: [{ weightKg: 180, reps: 1 }] },
      ],
    }]);
    expect(map["Squat"]["5rm"]?.weight).toBe(120);
    expect(map["Deadlift"]["1rm"]?.weight).toBe(180);
  });
});

describe("checkSetPR", () => {
  const prMap = buildPRMap([
    {
      date: "2025-01-01",
      exercises: [{
        exerciseName: "Bench Press",
        sets: [
          { weightKg: 80, reps: 5 },
          { weightKg: 100, reps: 1 },
        ],
      }],
    },
  ]);
  const sessionCounts = { "Bench Press": 5, "New Exercise": 1 };

  it("returns bucket when weight beats record", () => {
    expect(checkSetPR("Bench Press", 82.5, 5, prMap, sessionCounts)).toBe("5rm");
  });

  it("returns null when weight does not beat record", () => {
    expect(checkSetPR("Bench Press", 80, 5, prMap, sessionCounts)).toBeNull();
    expect(checkSetPR("Bench Press", 75, 5, prMap, sessionCounts)).toBeNull();
  });

  it("returns bucket for a new rep range with no prior record", () => {
    expect(checkSetPR("Bench Press", 60, 10, prMap, sessionCounts)).toBe("10rm");
  });

  it("returns null when session count < minSessions", () => {
    expect(checkSetPR("New Exercise", 200, 5, prMap, sessionCounts)).toBeNull();
    expect(checkSetPR("New Exercise", 200, 5, prMap, sessionCounts, 3)).toBeNull();
  });

  it("returns null for zero weight", () => {
    expect(checkSetPR("Bench Press", 0, 5, prMap, sessionCounts)).toBeNull();
  });

  it("returns bucket for exercise not in prMap but with enough sessions", () => {
    const counts = { "OHP": 4 };
    expect(checkSetPR("OHP", 50, 8, prMap, counts)).toBe("8rm");
  });
});
