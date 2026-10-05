import { describe, it, expect } from "vitest";
import { estimateSessionMinutes } from "../expressSession";
import {
  fitSessionsToTime,
  refitSessionsToTime,
  sessionFits,
  sessionMinutesFor,
} from "../sessionFit";
import { roleRepsFor } from "../roleTable";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

function ex(
  exerciseId: string,
  sets: number,
  over: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: exerciseId,
    exerciseId,
    instanceId: `${exerciseId}-${sets}`,
    movementCategory: "horizontal_push",
    sets,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

/** A full-body day of six lifts at three sets: about 75 minutes. */
const fullBody = (): WorkoutDay => ({
  dayName: "Full Body",
  dayType: "full_body",
  completed: false,
  exercises: [
    ex("bench-press", 3),
    ex("squat", 3, { movementCategory: "knee_dominant", weight: 90 }),
    ex("lat-pulldown", 3, {
      movementCategory: "vertical_pull",
      isAccessory: true,
    }),
    ex("romanian-deadlift", 3, {
      movementCategory: "hip_dominant",
      isAccessory: true,
    }),
    ex("cable-crunch", 3, {
      movementCategory: "core",
      isAccessory: true,
      weight: 30,
    }),
    ex("standing-calf-raise", 3, {
      movementCategory: "knee_dominant",
      isAccessory: true,
      weight: 40,
    }),
  ],
});

const minutesOf = (day: WorkoutDay, sessionMinutes: number) =>
  estimateSessionMinutes(day.exercises, { sessionMinutes });
const shape = (day: WorkoutDay) =>
  day.exercises.map((e) => `${e.exerciseId} ${e.sets}`).join(", ");

describe("sessionMinutesFor", () => {
  it("is the person's answer, or an hour", () => {
    expect(sessionMinutesFor(30)).toBe(30);
    expect(sessionMinutesFor(75)).toBe(75);
    expect(sessionMinutesFor(undefined)).toBe(60);
    expect(sessionMinutesFor(null)).toBe(60);
    expect(sessionMinutesFor(10)).toBe(60);
    expect(sessionMinutesFor("45")).toBe(60);
  });
});

describe("fitSessionsToTime — a new plan, built to fit (Lift4 (5))", () => {
  it("leaves a day that fits alone", () => {
    const day = fullBody();
    expect(minutesOf(day, 120)).toBeLessThanOrEqual(120);
    expect(shape(fitSessionsToTime([day], 120)[0])).toBe(shape(day));
  });

  it("cuts isolations' sets first, the largest and then the latest", () => {
    const [day] = fitSessionsToTime([fullBody()], 70);
    expect(minutesOf(day, 70)).toBeLessThanOrEqual(70);
    expect(shape(day)).toBe(
      "bench-press 3, squat 3, lat-pulldown 3, romanian-deadlift 3, cable-crunch 3, standing-calf-raise 2"
    );
  });

  // Two of the same day: every muscle gets direct work on the other, so
  // the first day's lifts may go.
  const twice = () => [fullBody(), { ...fullBody(), dayName: "Again" }];

  it("then drops isolations before a main lift loses a set", () => {
    const [day] = fitSessionsToTime(twice(), 60);
    expect(shape(day)).toBe(
      "bench-press 3, squat 3, lat-pulldown 2, romanian-deadlift 2, cable-crunch 2"
    );
    expect(minutesOf(day, 60)).toBeLessThanOrEqual(60);
  });

  it("then takes the main lifts to two sets, then drops other compounds", () => {
    const [day] = fitSessionsToTime(twice(), 40);
    expect(shape(day)).toBe("bench-press 2, squat 2, lat-pulldown 2");
    expect(minutesOf(day, 40)).toBeLessThanOrEqual(40);
  });

  it("keeps a muscle's last direct lift while something else can give way", () => {
    // One day a week: every accessory is its muscle's only direct work, so
    // the main lifts give a set before any of them goes…
    const [hour] = fitSessionsToTime([fullBody()], 60);
    expect(shape(hour)).toBe(
      "bench-press 3, squat 2, lat-pulldown 2, romanian-deadlift 2, cable-crunch 2, standing-calf-raise 2"
    );
    // …and then time wins: the session fits as promised.
    const [short] = fitSessionsToTime([fullBody()], 35);
    expect(minutesOf(short, 35)).toBeLessThanOrEqual(35);
    expect(short.exercises.length).toBeLessThan(6);
  });

  it("never drops a main lift, nor takes one below two sets", () => {
    const [day] = fitSessionsToTime([fullBody()], 10);
    expect(shape(day)).toBe("bench-press 2, squat 2");
    // …and runs over rather than gut the session; the card says so.
    expect(minutesOf(day, 10)).toBeGreaterThan(10);
  });

  it("rests less in a 30-minute plan, which holds about six working sets", () => {
    const [day] = fitSessionsToTime([fullBody()], 30);
    const sets = day.exercises.reduce((n, e) => n + e.sets, 0);
    expect(sets).toBeGreaterThanOrEqual(6);
    expect(minutesOf(day, 30)).toBeLessThanOrEqual(30);
    // At full rests the same lifts would not fit the half hour.
    expect(minutesOf(day, 60)).toBeGreaterThan(30);
  });

  it("drops a lift whose muscle is worked elsewhere before its last", () => {
    // The calf raise is the week's only calf work, the crunch is not: at an
    // hour the crunch goes and the calf raise stays.
    const other: WorkoutDay = {
      ...fullBody(),
      dayName: "Other",
      exercises: fullBody().exercises.filter(
        (e) => e.exerciseId !== "standing-calf-raise"
      ),
    };
    const [fitted] = fitSessionsToTime([fullBody(), other], 60);
    const ids = fitted.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("standing-calf-raise");
    expect(ids).not.toContain("cable-crunch");
  });

  it("keeps the 18-set ceiling whatever the time", () => {
    const big: WorkoutDay = {
      ...fullBody(),
      exercises: fullBody().exercises.map((e) => ({ ...e, sets: 5 })),
    };
    expect(sessionFits(big.exercises, 600)).toBe(false);
    const [day] = fitSessionsToTime([big], 600);
    expect(day.exercises.reduce((n, e) => n + e.sets, 0)).toBeLessThanOrEqual(
      18
    );
  });
});

describe("refitSessionsToTime — a plan the person has", () => {
  it("moves sets only: nothing is dropped, and a longer session gives them back", () => {
    const week = [fullBody()];
    const short = refitSessionsToTime(week, "hypertrophy", "intermediate", 30);
    expect(short[0].exercises).toHaveLength(6);
    short[0].exercises.forEach((e) => {
      expect(e.sets).toBeGreaterThanOrEqual(2);
      expect(e.baseSets).toBe(e.sets);
    });
    const long = refitSessionsToTime(short, "hypertrophy", "intermediate", 75);
    long[0].exercises.forEach((e) =>
      expect(e.sets).toBe(roleRepsFor("hypertrophy", e, "intermediate").sets)
    );
  });

  it("keeps reps, weights and history", () => {
    const day = fullBody();
    day.exercises[0] = {
      ...day.exercises[0],
      reps: 9,
      weight: 72.5,
      performanceHistory: [
        { date: "2026-10-01", weight: 70, repsCompleted: 8, repsTarget: 8 },
      ],
    };
    const [out] = refitSessionsToTime([day], "hypertrophy", undefined, 45);
    expect(out.exercises[0]).toMatchObject({
      reps: 9,
      weight: 72.5,
      performanceHistory: day.exercises[0].performanceHistory,
    });
  });

  it("leaves a timed hold's sets alone", () => {
    const plank = ex("plank", 4, {
      movementCategory: "core",
      isAccessory: true,
      repUnit: "seconds",
      reps: 45,
      weight: 0,
    });
    const [out] = refitSessionsToTime(
      [{ ...fullBody(), exercises: [plank] }],
      "hypertrophy",
      undefined,
      75
    );
    expect(out.exercises[0].sets).toBe(4);
  });
});
