import { describe, it, expect } from "vitest";
import { estimateSessionMinutes } from "../expressSession";
import {
  FIT_TOLERANCE,
  refitSessionsToTime,
  sessionFits,
  sessionMinutesFor,
  sizeSessionsToTime,
} from "../sessionFit";
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

describe("sizeSessionsToTime — a new plan, sized to its time (Lift21)", () => {
  /** The full-body day as a builder hands it over: one main lift, ranked
   *  in its own order. */
  const ranked = (): WorkoutDay => ({
    ...fullBody(),
    exercises: fullBody().exercises.map((e, i) => ({
      ...e,
      isAccessory: i > 0,
      keepRank: i + 1,
    })),
  });
  const sized = (
    day: WorkoutDay,
    minutes: number,
    experience: "beginner" | "intermediate" = "intermediate"
  ) => sizeSessionsToTime([day], minutes, experience)[0];
  const total = (day: WorkoutDay) =>
    day.exercises.reduce((n, e) => n + e.sets, 0);

  it("with no length to fit, gives the main lift four sets, its first pull as many, and every other lift three", () => {
    expect(shape(sized(ranked(), Number.POSITIVE_INFINITY))).toBe(
      "bench-press 4, squat 3, lat-pulldown 4, romanian-deadlift 3, cable-crunch 3, standing-calf-raise 3"
    );
  });

  it("takes lifts off the end of the day's order, and no set off a lift it keeps", () => {
    const hour = sized(ranked(), 60);
    const short = sized(ranked(), 45);
    expect(short.exercises.length).toBeLessThan(hour.exercises.length);
    // What is left is the start of the day's order.
    expect(short.exercises.map((e) => e.exerciseId)).toEqual(
      ranked()
        .exercises.slice(0, short.exercises.length)
        .map((e) => e.exerciseId)
    );
    for (const day of [hour, short])
      for (const e of day.exercises) expect(e.sets).toBeGreaterThanOrEqual(3);
  });

  it("gives the main lift three sets under an hour", () => {
    // Time left over can still take it to four; with none, it is three.
    const day = sized(ranked(), 45);
    expect(day.exercises[0].sets).toBeGreaterThanOrEqual(3);
    const tight: WorkoutDay = {
      ...ranked(),
      exercises: ranked().exercises.slice(0, 3),
    };
    expect(shape(sized(tight, 36))).toBe(
      "bench-press 3, squat 3, lat-pulldown 3"
    );
  });

  it("fits the day within the tolerance, and inside its length once time is given back", () => {
    for (const minutes of [45, 60, 75]) {
      const day = sized(ranked(), minutes);
      expect(sessionFits(day.exercises, minutes)).toBe(true);
      expect(minutesOf(day, minutes)).toBeLessThanOrEqual(
        Math.ceil(minutes * (1 + FIT_TOLERANCE))
      );
    }
  });

  it("gives time left over back as sets, to four a lift", () => {
    // Three lifts in 75 minutes: every one goes to four.
    const three: WorkoutDay = {
      ...ranked(),
      exercises: ranked().exercises.slice(0, 3),
    };
    expect(shape(sized(three, 75))).toBe(
      "bench-press 4, squat 4, lat-pulldown 4"
    );
  });

  it("lets a lift a later pass added go before any the builders ranked", () => {
    const added = ex("lateral-raise", 3, {
      instanceId: "added",
      movementCategory: "vertical_push",
      isAccessory: true,
      weight: 10,
    });
    const four = ranked().exercises.slice(0, 4);
    const day: WorkoutDay = { ...ranked(), exercises: [...four, added] };
    expect(sized(day, 600).exercises).toHaveLength(5);
    // The longest day that has to give one lift up gives up the added one.
    const fewer = [70, 65, 60, 55, 50]
      .map((minutes) => sized(day, minutes))
      .find((d) => d.exercises.length === 4);
    expect(fewer?.exercises.map((e) => e.exerciseId)).toEqual(
      four.map((e) => e.exerciseId)
    );
  });

  it("brings back one of the day's first four when it fits once a dearer lift has gone", () => {
    // The squat is dear and the curl after it cheap. In 28 minutes the
    // curl goes, then the squat, and the curl, the day's fourth piece, fits
    // again; the pushdown, its fifth, stays out.
    const day: WorkoutDay = {
      ...ranked(),
      exercises: [
        ex("bench-press", 3, { keepRank: 1 }),
        ex("lat-pulldown", 3, {
          movementCategory: "vertical_pull",
          isAccessory: true,
          keepRank: 2,
        }),
        ex("squat", 3, {
          movementCategory: "knee_dominant",
          weight: 90,
          isAccessory: true,
          keepRank: 3,
        }),
        ex("db-curl", 3, {
          movementCategory: "arms_biceps",
          isAccessory: true,
          weight: 10,
          keepRank: 4,
        }),
        ex("rope-tricep-pushdown", 3, {
          movementCategory: "arms_triceps",
          isAccessory: true,
          weight: 20,
          keepRank: 5,
        }),
      ],
    };
    expect(sized(day, 28).exercises.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "lat-pulldown",
      "db-curl",
    ]);
  });

  it("keeps three lifts however short the time, and two in half an hour", () => {
    expect(sized(ranked(), 40).exercises).toHaveLength(3);
    // …running over rather than gutting the session; the card says so.
    expect(sized(ranked(), 5).exercises).toHaveLength(2);
  });

  it("gives a beginner three sets on the main lift and its first pull, two elsewhere, and three at most", () => {
    const day = sized(ranked(), Number.POSITIVE_INFINITY, "beginner");
    expect(shape(day)).toBe(
      "bench-press 3, squat 2, lat-pulldown 3, romanian-deadlift 2, cable-crunch 2, standing-calf-raise 2"
    );
    for (const e of sized(ranked(), 600, "beginner").exercises)
      expect(e.sets).toBe(3);
  });

  it("gives a half-hour day three and two, which holds about six working sets", () => {
    const day = sized(ranked(), 30);
    expect(total(day)).toBeGreaterThanOrEqual(6);
    for (const e of day.exercises) expect(e.sets).toBeLessThanOrEqual(3);
    expect(sessionFits(day.exercises, 30)).toBe(true);
    // At full rests the same lifts would not fit the half hour.
    expect(minutesOf(day, 60)).toBeGreaterThan(30);
  });

  it("keeps a deadlift from the floor to three sets", () => {
    const day: WorkoutDay = {
      ...ranked(),
      exercises: [
        ex("deadlift", 3, {
          movementCategory: "hip_dominant",
          weight: 100,
          keepRank: 1,
        }),
        ...ranked().exercises.slice(2, 4),
      ],
    };
    expect(sized(day, 600).exercises[0].sets).toBe(3);
  });

  it("keeps the day's set ceiling: 18, and 21 from 75 minutes", () => {
    const eight: WorkoutDay = {
      ...ranked(),
      exercises: [
        ...ranked().exercises,
        ex("db-curl", 3, {
          movementCategory: "arms_biceps",
          isAccessory: true,
          weight: 10,
          keepRank: 7,
        }),
        ex("rope-tricep-pushdown", 3, {
          movementCategory: "arms_triceps",
          isAccessory: true,
          weight: 20,
          keepRank: 8,
        }),
      ],
    };
    expect(total(sized(eight, 70))).toBeLessThanOrEqual(18);
    expect(total(sized(eight, 600))).toBeLessThanOrEqual(21);
    expect(total(sized(eight, 600))).toBeGreaterThan(18);
  });

  it("leaves a timed hold's sets alone", () => {
    const plank = ex("plank", 2, {
      movementCategory: "core",
      isAccessory: true,
      repUnit: "seconds",
      reps: 45,
      weight: 0,
      keepRank: 2,
    });
    const day: WorkoutDay = {
      ...ranked(),
      exercises: [ranked().exercises[0], plank],
    };
    expect(sized(day, 600).exercises[1].sets).toBe(2);
  });
});

describe("refitSessionsToTime — a plan the person has", () => {
  it("moves sets only: nothing is dropped, and a longer session gives them back", () => {
    const week = [fullBody()];
    const short = refitSessionsToTime(week, "intermediate", 30);
    expect(short[0].exercises).toHaveLength(6);
    short[0].exercises.forEach((e) => {
      expect(e.sets).toBeGreaterThanOrEqual(2);
      expect(e.baseSets).toBe(e.sets);
    });
    const long = refitSessionsToTime(short, "intermediate", 75);
    // Its place's sets: four on the day's first main lift from an hour and
    // on its first pull, three on every other lift. The six fill the 75
    // minutes, so none goes deeper.
    expect(shape(long[0])).toBe(
      "bench-press 4, squat 3, lat-pulldown 4, romanian-deadlift 3, cable-crunch 3, standing-calf-raise 3"
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
    const [out] = refitSessionsToTime([day], undefined, 45);
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
      undefined,
      75
    );
    expect(out.exercises[0].sets).toBe(4);
  });
});
