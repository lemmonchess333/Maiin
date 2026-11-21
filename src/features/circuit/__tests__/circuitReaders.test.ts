/**
 * A saved circuit as the app's other readers meet it (Circ1 (6), (B)):
 * the week counts it once as a session done, History reads it as a
 * circuit, the Analytics breakdown names it, and nothing that reads a
 * lift's sets finds anything in it: no best, no last sets, no volume.
 */
import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { builtInCircuit } from "../builtInCircuits";
import { circuitWorkoutFields } from "@/lib/circuitCompletion";
import { countedSessions } from "@/lib/trainingWeek";
import { buildPRMap } from "@/lib/prTracking";
import { lastSetsByExercise } from "@/features/program/lastSets";
import { workoutTonnageKg, type Workout } from "@/lib/savedWorkouts";
import { trainingHistorySessions } from "@/lib/trainingHistory";
import { performanceWeekBreakdown } from "@/lib/performanceWeekBreakdown";

const circuit = builtInCircuit({ kit: "minimal", minutes: 20 });
const asWorkout = (id: string, date: string): Workout =>
  ({
    id,
    ...circuitWorkoutFields({
      uid: "u1",
      completionId: id,
      startedAt: new Date(`${date}T07:00:00`).getTime(),
      circuit,
      outcome: {
        intervalsDone: 20,
        roundsDone: 4,
        workSecondsDone: 800,
        activeSeconds: 1180,
        finished: true,
        effort: "right",
      },
      bodyweightKg: 70,
    }),
    createdAt: Timestamp.fromDate(new Date(`${date}T07:30:00`)),
  }) as unknown as Workout;

const lift: Workout = {
  id: "lift-1",
  date: "2026-05-11",
  notes: "Push A",
  totalCalories: 300,
  durationMinutes: 50,
  createdAt: Timestamp.fromDate(new Date("2026-05-11T18:00:00")),
  exercises: [
    {
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      category: "push",
      caloriesBurned: 0,
      sets: [
        { setNumber: 1, reps: 5, weightKg: 80 },
        { setNumber: 2, reps: 5, weightKg: 80 },
      ],
    },
  ],
};
const done = asWorkout("free-c1", "2026-05-12");

describe("a saved circuit among the app's readers (Circ1 (6), (B))", () => {
  it("is one session done in the week", () => {
    expect(countedSessions([lift, done], []).lifts).toHaveLength(2);
    expect(countedSessions([done], []).lifts).toHaveLength(1);
  });

  it("gives no best, no last sets and no volume", () => {
    expect(buildPRMap([done, lift])).toEqual(buildPRMap([lift]));
    expect(lastSetsByExercise([done, lift])).toEqual(
      lastSetsByExercise([lift])
    );
    expect(workoutTonnageKg(done)).toBe(0);
  });

  it("reads in History as its minutes, rounds and moves, found by a move's name", () => {
    const filters = {
      from: "2026-05-01",
      to: "2026-05-31",
      sport: "all" as const,
      search: "",
    };
    const [row] = trainingHistorySessions([done], [], filters, "km");
    expect(row).toMatchObject({
      kind: "lift",
      title: "20-minute circuit",
      summary: ["20 min", "4 rounds", "5 moves"],
      href: "/workout/free-c1",
    });
    const found = trainingHistorySessions(
      [done, lift],
      [],
      { ...filters, search: circuit.moves[1].name.toLowerCase() },
      "km"
    );
    expect(found.map((session) => session.id)).toEqual(["free-c1"]);
  });

  it("is named in the Analytics week, beside the lifting sessions", () => {
    const options = {
      distanceUnit: "km" as const,
      liftUnit: "kg" as const,
      establishing: false,
    };
    const lifting = (agg: Record<string, number>) =>
      performanceWeekBreakdown({ aggregates: agg }, options).measures.find(
        (measure) => measure.key === "lifting"
      );
    expect(
      lifting({ liftSessions: 3, liftTonnage: 9000, circuitSessions: 1 })
        ?.detail
    ).toBe("3 sessions · 1 circuit");
    expect(lifting({ circuitSessions: 2 })?.detail).toBe("2 circuits");
    expect(lifting({ liftSessions: 2, liftTonnage: 5000 })?.detail).toBe(
      "2 sessions"
    );
    expect(lifting({})).toBeUndefined();
  });
});
