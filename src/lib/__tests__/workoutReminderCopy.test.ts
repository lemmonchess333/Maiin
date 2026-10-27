/**
 * The training-day reminder's words and its next time (Mob1 call 3): a
 * lift day names the programme's next workout, a run day says it is a
 * run, and setup previews the first one ("Upper A tomorrow at 07:30").
 */
import { describe, it, expect } from "vitest";
import {
  nextLiftName,
  nextReminderAt,
  reminderPreview,
  reminderWhen,
  workoutReminderCopy,
} from "../workoutReminderCopy";
import type { WorkoutDay } from "@/features/program/programTypes";

/** Wed 15 Jul 2026, 09:00 local. */
const WED_0900 = new Date(2026, 6, 15, 9, 0, 0);

/** Sun rest, Mon lift, Tue run, Wed lift, Thu rest, Fri both, Sat run. */
const SCHEDULE = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "rest" },
  { day: 5, type: "both" },
  { day: 6, type: "run" },
];

const day = (dayName: string, extra: Partial<WorkoutDay> = {}) =>
  ({ dayName, exercises: [], ...extra }) as unknown as WorkoutDay;

const UPPER_LOWER = [
  day("Upper — Chest & Back"),
  day("Lower — Squat Focus"),
  day("Upper — Shoulders & Arms"),
  day("Lower — Deadlift Focus"),
];

describe("nextLiftName", () => {
  it("names the next workout as Home's card does", () => {
    expect(nextLiftName({ workouts: UPPER_LOWER })).toBe("Upper A");
  });

  it("moves on once a workout is done, whatever the weekday", () => {
    const workouts = UPPER_LOWER.map((w, i) =>
      i === 0 ? { ...w, completed: true } : w
    );
    expect(nextLiftName({ workouts })).toBe("Lower A");
  });

  it("follows Make this next", () => {
    expect(
      nextLiftName({ workouts: UPPER_LOWER, nextWorkoutOverride: 3 })
    ).toBe("Lower B");
  });

  it("is null with no programme, or nothing left this week", () => {
    expect(nextLiftName(null)).toBeNull();
    expect(
      nextLiftName({
        workouts: UPPER_LOWER.map((w) => ({ ...w, completed: true })),
      })
    ).toBeNull();
  });
});

describe("workoutReminderCopy", () => {
  it("a lift day names the next workout", () => {
    expect(workoutReminderCopy(1, SCHEDULE, "Upper A")).toEqual({
      title: "Upper A today",
      body: "Your session is ready when you are.",
    });
    // A day with a lift and a run names the lift.
    expect(workoutReminderCopy(5, SCHEDULE, "Upper A").title).toBe(
      "Upper A today"
    );
  });

  it("a run day says it is a run", () => {
    expect(workoutReminderCopy(2, SCHEDULE, "Upper A")).toEqual({
      title: "Time to run",
      body: "Your run is ready when you are.",
    });
  });

  it("says the plain reminder when the session is not known", () => {
    const plain = {
      title: "Time to train",
      body: "Your session is ready when you are.",
    };
    expect(workoutReminderCopy(1, SCHEDULE, null)).toEqual(plain);
    expect(workoutReminderCopy(1, undefined, "Upper A")).toEqual(plain);
  });
});

describe("when the reminder next goes off", () => {
  it("is today while the time is still ahead", () => {
    const next = nextReminderAt("18:00", SCHEDULE, WED_0900)!;
    expect(next.weekday).toBe(3);
    expect(reminderWhen(next.at, WED_0900)).toBe("today at 18:00");
  });

  it("skips rest days and a time already gone", () => {
    // Wednesday 07:30 has gone and Thursday rests: Friday.
    const next = nextReminderAt("07:30", SCHEDULE, WED_0900)!;
    expect(next.weekday).toBe(5);
    expect(reminderWhen(next.at, WED_0900)).toBe("on Friday at 07:30");
  });

  it("says tomorrow for the next day", () => {
    const tue = new Date(2026, 6, 14, 9, 0, 0);
    expect(reminderWhen(nextReminderAt("07:30", SCHEDULE, tue)!.at, tue)).toBe(
      "tomorrow at 07:30"
    );
  });

  it("is never for a time that is not HH:mm", () => {
    expect(nextReminderAt("7am", SCHEDULE, WED_0900)).toBeNull();
    expect(reminderPreview("7am", SCHEDULE, "Upper A", WED_0900)).toBeNull();
  });
});

describe("setup's preview", () => {
  it("names the first lift and when it goes off", () => {
    const tue = new Date(2026, 6, 14, 9, 0, 0);
    expect(reminderPreview("07:30", SCHEDULE, "Upper A", tue)).toBe(
      "Upper A tomorrow at 07:30"
    );
  });

  it("says a run on a run day, and a reminder when no day is named", () => {
    const mon = new Date(2026, 6, 13, 9, 0, 0);
    expect(reminderPreview("07:30", SCHEDULE, "Upper A", mon)).toBe(
      "A run tomorrow at 07:30"
    );
    expect(reminderPreview("07:30", undefined, "Upper A", mon)).toBe(
      "A reminder tomorrow at 07:30"
    );
  });
});
