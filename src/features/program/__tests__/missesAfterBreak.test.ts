/**
 * Miss counts start again after a break (Lift4 (7); "after a return" in the
 * lifting handoff's lighter-week precedence table). A miss from before two
 * weeks away says nothing about the lifter coming back, whichever way they
 * came back: "Ease back in" already resets the counts, and "Keep my old
 * weights", or closing the sheet, left them, so the first miss back lowered
 * the lift 10% at once.
 */
import { describe, it, expect } from "vitest";
import { applySessionProgression } from "../sessionCompletion";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { WELCOME_BACK_DAYS } from "../liftLayoff";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";

const plan = (): ProgramState =>
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
            instanceId: "bench-1",
            exerciseId: "bench-press",
            name: "Bench Press",
            movementCategory: "horizontal_push",
            sets: 3,
            reps: 5,
            weight: 80,
            progressionType: "linear",
          },
        ],
      },
      {
        dayName: "Full body B",
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
            weight: 100,
            progressionType: "linear",
          },
        ],
      },
    ],
    settings: { autoProgression: true, smallPlates: false },
    fatigueScore: 0,
    weekHistory: [],
    updatedAt: 0,
  } as unknown as ProgramState);

const day = (date: string, n: number) =>
  localDateString(addLocalDays(parseLocalDate(date), n));

/** A session of one day at the plan's weights, every set a rep short. */
function missed(state: ProgramState, dayIndex: number, date: string) {
  const lifts = state.workouts[dayIndex].exercises;
  return applySessionProgression(state, dayIndex, {
    completionId: `session-${String(dayIndex)}-${date}`,
    date,
    prescription: { exercises: lifts, progressionBaseline: lifts },
    setLogs: lifts.map((lift) =>
      Array.from({ length: 3 }, () => ({
        weight: lift.weight,
        reps: lift.reps - 1,
        completed: true,
      }))
    ),
  });
}

const lift = (state: ProgramState, id: string) =>
  state.workouts
    .flatMap((d) => d.exercises)
    .find((ex) => ex.instanceId === id)!;

const START = "2026-09-07";

describe("a miss from before a break", () => {
  it("doesn't count with the first miss back", () => {
    const before = missed(missed(plan(), 0, START), 1, day(START, 2));
    expect(lift(before, "bench-1").consecutiveFailures).toBe(1);
    const back = missed(before, 0, day(START, 2 + WELCOME_BACK_DAYS));
    // One miss, the one since coming back: the bench holds its weight.
    expect(lift(back, "bench-1").consecutiveFailures).toBe(1);
    expect(lift(back, "bench-1").weight).toBe(80);
  });

  it("starts again for every lift, not only the session's", () => {
    const before = missed(missed(plan(), 0, START), 1, day(START, 2));
    const back = missed(before, 0, day(START, 2 + WELCOME_BACK_DAYS));
    // The squat's day comes next; its miss from before the break is gone.
    expect(lift(back, "squat-1").consecutiveFailures).toBe(0);
  });

  it("still counts across a gap shorter than a break", () => {
    const before = missed(missed(plan(), 0, START), 1, day(START, 2));
    const soon = missed(before, 0, day(START, 2 + WELCOME_BACK_DAYS - 1));
    // Two misses in a row: the bench comes down, as it always has.
    expect(lift(soon, "bench-1").weight).toBeLessThan(80);
  });
});
