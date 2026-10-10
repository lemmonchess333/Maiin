import { describe, expect, it, vi } from "vitest";
import type { ProgramExercise } from "@/features/program/programTypes";
import type { LoggedSet } from "@/features/program/workoutSetRecord";

/**
 * The E2E journeys save a lift they only need to have happened through the
 * engine, from Node (`e2e/helpers/journeyLift.ts`). The app's builders for
 * the saved workout live in `liftCompletion.ts`, which starts the Firebase
 * client and can't load there, so the journeys build it with their own
 * copy (`e2e/helpers/journeyLiftDoc.ts`). This holds the copy to the app's
 * output, so the journeys save what the workout screen saves.
 */
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { liftTotals, liftWorkoutExercises } from "@/lib/liftCompletion";
import {
  journeyLiftTotals,
  journeyWorkoutExercises,
} from "../../../e2e/helpers/journeyLiftDoc";

function exercise(overrides: Partial<ProgramExercise>): ProgramExercise {
  return {
    instanceId: overrides.exerciseId ?? "squat",
    exerciseId: "squat",
    name: "Barbell Squat",
    movementCategory: "knee_dominant",
    sets: 3,
    baseSets: 3,
    reps: 5,
    weight: 100,
    progressionType: "linear",
    isAccessory: false,
    restSeconds: 180,
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  } as ProgramExercise;
}

const done = (weight: number, reps: number, count: number): LoggedSet[] =>
  Array.from({ length: count }, () => ({
    weight,
    reps,
    completed: true,
    type: "working",
  }));

const session = {
  ran: [
    exercise({}),
    exercise({
      exerciseId: "pull-ups",
      name: "Pull-Ups",
      movementCategory: "vertical_pull",
      weight: 0,
      reps: 8,
    }),
    exercise({
      exerciseId: "plank",
      name: "Plank",
      movementCategory: "core",
      repUnit: "seconds",
      weight: 0,
      reps: 45,
      sets: 2,
    }),
  ],
  setLogs: [
    // The last set cut short, and one not done at all.
    [
      ...done(100, 5, 2),
      { weight: 95, reps: 3, completed: true, type: "working" },
    ],
    [
      ...done(0, 8, 2),
      { weight: 0, reps: 8, completed: false, type: "working" },
    ],
    done(0, 45, 2),
  ],
};

describe("a journey's saved lift is the app's", () => {
  it("records the exercises as the workout screen's save does", () => {
    expect(journeyWorkoutExercises(session.ran, session.setLogs)).toEqual(
      liftWorkoutExercises(session.ran, session.setLogs)
    );
  });

  it("totals the session as the save does, with and without a clock", () => {
    const exercises = liftWorkoutExercises(session.ran, session.setLogs);
    for (const durationMinutes of [0, 47])
      for (const bodyweightKg of [0, 82.5])
        expect(
          journeyLiftTotals(exercises, { durationMinutes, bodyweightKg })
        ).toEqual(liftTotals(exercises, { durationMinutes, bodyweightKg }));
  });
});
