/**
 * Which sets of a saved workout were new bests (lifting finding 8), by the
 * rule the session uses: past the exercise's best so far, once three
 * sessions have trained it.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
import { listedSets, workoutBests } from "../workoutBests";
import type { Workout } from "../savedWorkouts";

const stamp = (ms: number) => ({ toMillis: () => ms }) as Workout["createdAt"];

function workout(
  id: string,
  date: string,
  sets: [number, number, string?][],
  more: Partial<Workout> = {},
  name = "Bench Press"
): Workout {
  return {
    id,
    date,
    notes: "Push",
    totalCalories: 0,
    durationMinutes: 40,
    createdAt: stamp(Date.parse(`${date}T18:00:00`)),
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: name,
        category: "push",
        caloriesBurned: 0,
        sets: sets.map(([weightKg, reps, type], i) => ({
          setNumber: i + 1,
          weightKg,
          reps,
          ...(type ? { type } : {}),
        })),
      },
    ],
    ...more,
  };
}

const three = [
  workout("w1", "2026-03-02", [[60, 8]]),
  workout("w2", "2026-03-04", [[60, 8]]),
  workout("w3", "2026-03-06", [[60, 8]]),
];

describe("a saved workout's new bests", () => {
  it("marks a set past the best so far, and not one that only matches it", () => {
    const today = workout("w4", "2026-03-09", [
      [60, 8],
      [62.5, 8],
      [62.5, 8],
    ]);
    expect(workoutBests(today, [...three, today])).toEqual(
      new Map([[0, new Set([1])]])
    );
  });

  it("marks none before three sessions have trained the exercise", () => {
    const today = workout("w3b", "2026-03-09", [[80, 8]]);
    expect(workoutBests(today, [three[0], three[1], today]).size).toBe(0);
  });

  it("reads only what came before it, not a later best", () => {
    const today = workout("w4", "2026-03-09", [[62.5, 8]]);
    const later = workout("w5", "2026-03-11", [[70, 8]]);
    expect(workoutBests(today, [...three, today, later])).toEqual(
      new Map([[0, new Set([0])]])
    );
  });

  it("orders two sessions on one day by when they were saved", () => {
    const morning = workout("am", "2026-03-09", [[65, 8]], {
      createdAt: stamp(Date.parse("2026-03-09T07:00:00")),
    });
    const evening = workout("pm", "2026-03-09", [[62.5, 8]], {
      createdAt: stamp(Date.parse("2026-03-09T19:00:00")),
    });
    const all = [...three, morning, evening];
    expect(workoutBests(morning, all).size).toBe(1);
    // The morning's 65 kg is the best the evening had to beat.
    expect(workoutBests(evening, all).size).toBe(0);
  });

  it("never marks a warm-up or a timed hold, and counts places past warm-ups", () => {
    const today = workout("w4", "2026-03-09", [
      [70, 8, "warmup"],
      [62.5, 8, "working"],
    ]);
    const bests = workoutBests(today, [...three, today]);
    expect(bests).toEqual(new Map([[0, new Set([0])]]));
    expect(listedSets(today.exercises[0])[0].weightKg).toBe(62.5);

    const hold = workout("h", "2026-03-09", [[20, 90]]);
    hold.exercises[0].repUnit = "seconds";
    expect(workoutBests(hold, [...three, hold]).size).toBe(0);
  });
});
