import { describe, it, expect } from "vitest";
import { bestSetPerExercise } from "../liftRecords";

/**
 * The PRs tab's lift records: each exercise's best set by estimated
 * one-rep max, reps for an unweighted bodyweight exercise. Timed holds
 * and warm-ups are not sets a record can be made of.
 */

const session = (
  date: string,
  exercises: {
    exerciseName: string;
    repUnit?: string;
    sets: { weightKg: number; reps: number; type?: string }[];
  }[]
) => ({ date, exercises });

const NEW_SINCE = "2026-09-21";

describe("bestSetPerExercise", () => {
  it("keeps each exercise's best set by estimated one-rep max", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-01", [
          { exerciseName: "Bench Press", sets: [{ weightKg: 80, reps: 8 }] },
        ]),
        session("2026-09-10", [
          // 100 × 3 (e1RM 110) beats 80 × 8 (e1RM 101.3).
          { exerciseName: "Bench Press", sets: [{ weightKg: 100, reps: 3 }] },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records).toEqual([
      {
        name: "Bench Press",
        weight: 100,
        reps: 3,
        date: "2026-09-10",
        isNew: false,
      },
    ]);
  });

  it("leaves out a timed hold, whose reps are seconds", () => {
    // 20 kg for 60 s scored as 20 × (1 + 60/30) = 60 "kg" before.
    const records = bestSetPerExercise(
      [
        session("2026-09-10", [
          {
            exerciseName: "Weighted Plank",
            repUnit: "seconds",
            sets: [{ weightKg: 20, reps: 60 }],
          },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records).toEqual([]);
  });

  it("leaves out a warm-up set", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-10", [
          {
            exerciseName: "Back Squat",
            sets: [
              { weightKg: 140, reps: 1, type: "warmup" },
              { weightKg: 100, reps: 5, type: "working" },
            ],
          },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records[0]).toMatchObject({ weight: 100, reps: 5 });
  });

  it("scores an unweighted bodyweight exercise on reps", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-10", [
          {
            exerciseName: "Pull-Ups",
            sets: [
              { weightKg: 0, reps: 8 },
              { weightKg: 0, reps: 11 },
            ],
          },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records[0]).toMatchObject({
      name: "Pull-Ups",
      weight: 0,
      reps: 11,
    });
  });

  it("skips a weighted exercise's set with no load, and a set with no reps", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-10", [
          {
            exerciseName: "Bench Press",
            sets: [
              { weightKg: 0, reps: 10 },
              { weightKg: 90, reps: 0 },
            ],
          },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records).toEqual([]);
  });

  it("marks a record set on or after the cutoff as new", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-21", [
          { exerciseName: "Bench Press", sets: [{ weightKg: 85, reps: 5 }] },
        ]),
        session("2026-09-20", [
          { exerciseName: "Deadlift", sets: [{ weightKg: 150, reps: 5 }] },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records.map((r) => [r.name, r.isNew])).toEqual([
      ["Bench Press", true],
      ["Deadlift", false],
    ]);
  });

  it("limits a window's records to its sessions", () => {
    const records = bestSetPerExercise(
      [
        session("2026-08-01", [
          { exerciseName: "Bench Press", sets: [{ weightKg: 110, reps: 1 }] },
        ]),
        session("2026-09-10", [
          { exerciseName: "Bench Press", sets: [{ weightKg: 90, reps: 3 }] },
        ]),
      ],
      { sinceKey: "2026-08-28", newSinceKey: NEW_SINCE }
    );
    expect(records[0]).toMatchObject({ weight: 90, date: "2026-09-10" });
  });

  it("lists the newest record first", () => {
    const records = bestSetPerExercise(
      [
        session("2026-09-01", [
          { exerciseName: "Deadlift", sets: [{ weightKg: 150, reps: 5 }] },
        ]),
        session("2026-09-12", [
          { exerciseName: "Bench Press", sets: [{ weightKg: 85, reps: 5 }] },
        ]),
      ],
      { newSinceKey: NEW_SINCE }
    );
    expect(records.map((r) => r.name)).toEqual(["Bench Press", "Deadlift"]);
  });

  it("keeps the day a tied best was first set, whatever order sessions arrive in", () => {
    // A squat held at 105 kg × 5 for four weeks is one record, set once.
    const held = ["2026-09-25", "2026-09-18", "2026-09-11", "2026-09-04"].map(
      (date) =>
        session(date, [
          { exerciseName: "Barbell Squat", sets: [{ weightKg: 105, reps: 5 }] },
        ])
    );
    for (const order of [held, [...held].reverse()]) {
      const [record] = bestSetPerExercise(order, { newSinceKey: NEW_SINCE });
      expect(record).toMatchObject({ date: "2026-09-04", isNew: false });
    }
  });
});
