import { describe, it, expect } from "vitest";
import {
  daysPerMuscle,
  extraPastCeiling,
  twiceWeeklyAdditions,
} from "../weeklyFrequency";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function ex(
  exerciseId: string,
  movementCategory: ProgramExercise["movementCategory"],
  over: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: exerciseId,
    exerciseId,
    instanceId: exerciseId,
    movementCategory,
    sets: 3,
    reps: 8,
    weight: 40,
    progressionType: "double",
    lastSuccessfulWeight: 40,
    lastAttemptedWeight: 40,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

const day = (
  dayName: string,
  dayType: string,
  exercises: ProgramExercise[]
): WorkoutDay => ({ dayName, dayType, completed: false, exercises });

/** Squat, bench, row and a hinge: every big muscle, and nothing for the
 *  side delts, calves or abs. */
const fullBody = (name: string) =>
  day(name, "full_body", [
    ex("squat", "knee_dominant"),
    ex("bench-press", "horizontal_push"),
    ex("barbell-row", "horizontal_pull", { isAccessory: true }),
    ex("romanian-deadlift", "hip_dominant", { isAccessory: true }),
  ]);

const upper = (name: string, extra: ProgramExercise[] = []) =>
  day(name, "upper", [
    ex("bench-press", "horizontal_push"),
    ex("barbell-row", "horizontal_pull"),
    ...extra,
  ]);
const lower = (name: string, extra: ProgramExercise[] = []) =>
  day(name, "lower", [
    ex("squat", "knee_dominant"),
    ex("romanian-deadlift", "hip_dominant", { isAccessory: true }),
    ...extra,
  ]);

const lateral = () =>
  ex("lateral-raise", "vertical_push", { isAccessory: true });
const seatedCalf = () =>
  ex("seated-calf-raise", "knee_dominant", { isAccessory: true });
const crunch = () => ex("cable-crunch", "core", { isAccessory: true });

describe("daysPerMuscle — the days a week each muscle is worked on", () => {
  it("counts a muscle a lift works as a secondary, as the volume model does", () => {
    const days = daysPerMuscle([fullBody("A")]);
    // A row's sets count toward the biceps; nothing here reaches the calves.
    expect(days.get("Biceps")).toBe(1);
    expect(days.get("Quads")).toBe(1);
    expect(days.has("Calves")).toBe(false);
  });
});

describe("twiceWeeklyAdditions — every muscle on two days (Lift4 (5))", () => {
  it("adds nothing to a one-day plan", () => {
    expect(twiceWeeklyAdditions([fullBody("A")])).toEqual([]);
  });

  it("gives a muscle the compounds never reach a lift on each day", () => {
    const added = twiceWeeklyAdditions([fullBody("A"), fullBody("B")]);
    for (const id of ["lateral-raise", "standing-calf-raise", "cable-crunch"]) {
      expect(
        added.filter((a) => a.exerciseId === id).map((a) => a.day),
        id
      ).toEqual([0, 1]);
    }
    // The big muscles are worked on both days already.
    expect(added).toHaveLength(3 * 2);
  });

  it("repeats the week's own lift, on a day of its kind", () => {
    const added = twiceWeeklyAdditions([
      upper("Upper A", [lateral()]),
      lower("Lower A", [seatedCalf(), crunch()]),
      upper("Upper B", [
        ex("lat-pulldown", "vertical_pull", { isAccessory: true }),
      ]),
      lower("Lower B"),
    ]);
    // The side delts' second day is the other upper day, though Lower B has
    // less work, and the calves' the other lower day, each with the lift the
    // week already has; the abs take the day with the least work.
    expect(added).toContainEqual({ day: 2, exerciseId: "lateral-raise" });
    expect(added).toContainEqual({ day: 3, exerciseId: "seated-calf-raise" });
    expect(added.filter((a) => a.exerciseId === "cable-crunch")).toHaveLength(
      1
    );
    expect(
      added.some(
        (a) => a.exerciseId === "lateral-raise" && (a.day === 1 || a.day === 3)
      )
    ).toBe(false);
  });

  it("leaves a muscle already worked on two days alone", () => {
    const added = twiceWeeklyAdditions([
      upper("Upper A", [lateral()]),
      upper("Upper B", [lateral()]),
    ]);
    expect(added.some((a) => a.exerciseId === "lateral-raise")).toBe(false);
  });
});

describe("extraPastCeiling — the table is a ceiling", () => {
  const week = () => [
    upper("Upper A", [lateral()]),
    upper("Upper B", [{ ...lateral(), instanceId: "added" }]),
  ];
  const extras = new Set(["added"]);

  it("names nothing while every muscle is within its ceiling", () => {
    expect(extraPastCeiling(week(), extras, () => 100)).toBeUndefined();
  });

  it("names the added lift that works a muscle past its ceiling", () => {
    // The lateral raise counts toward the upper back as well; at a ceiling
    // of 10 sets the rows and raises are past it.
    const ceiling = (m: string) => (m === "UpperBack" ? 10 : 100);
    expect(extraPastCeiling(week(), extras, ceiling)).toBe("added");
  });

  it("names nothing when only the plan's own lifts are past a ceiling", () => {
    // Only the rows and the bench work the chest and triceps; no added lift
    // is to blame for them.
    const ceiling = (m: string) => (m === "Chest" ? 1 : 100);
    expect(extraPastCeiling(week(), extras, ceiling)).toBeUndefined();
  });
});
