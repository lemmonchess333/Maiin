/**
 * A lift's stated start (Mob2 call 12): how far back it can go, the days
 * offered, what a time is checked against, and how the finish screen says
 * it. Every `now` is handed in, so no window here waits on the calendar.
 * Also an empty workout's name as it is saved (Mob2 call 11).
 */
import { describe, expect, it } from "vitest";
import {
  startAt,
  startBounds,
  startDayName,
  startDays,
  startLabel,
  startProblem,
} from "../sessionStart";
import {
  EMPTY_WORKOUT_NAME,
  EMPTY_WORKOUT_NAME_MAX,
  emptyWorkoutName,
} from "../emptyWorkout";
import { workoutTitle } from "@/hooks/useWorkouts";
import { accountStartMs } from "@/lib/startDay";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";

/** A local moment: 2026-10-28 (a Wednesday) at 12:00, or as given. */
const at = (day = 28, hour = 12, minute = 0, month = 9) =>
  new Date(2026, month, day, hour, minute).getTime();
const now = at();

describe("the account's beginning", () => {
  it("is the profile's createdAt, else the sign-in record's", () => {
    expect(accountStartMs({ toMillis: () => 5 }, null)).toBe(5);
    expect(accountStartMs(undefined, "Mon, 26 Oct 2026 14:02:00 GMT")).toBe(
      Date.parse("Mon, 26 Oct 2026 14:02:00 GMT")
    );
    // A server timestamp still on its way has no toMillis.
    expect(accountStartMs({}, undefined)).toBeNull();
  });
});

describe("how far back a start can go", () => {
  it("never past now, and back to the account for a routine", () => {
    const bounds = startBounds({
      now,
      startedAt: now - 60_000,
      accountStart: at(10),
      planWeek: false,
    });
    expect(bounds).toEqual({ earliest: at(10), latest: now });
  });

  it("stays in the plan's week for a programme day", () => {
    const bounds = startBounds({
      now,
      startedAt: now - 60_000,
      accountStart: at(10),
      planWeek: true,
    });
    expect(localDateString(new Date(bounds.earliest))).toBe(
      localWeekKey(new Date(now))
    );
    expect(new Date(bounds.earliest).getHours()).toBe(0);
  });

  it("never before an account that began this week", () => {
    const bounds = startBounds({
      now,
      startedAt: now,
      accountStart: at(27, 14, 2),
      planWeek: true,
    });
    expect(bounds.earliest).toBe(at(27, 14, 2));
  });

  it("is today alone while the account's beginning is unknown", () => {
    const bounds = startBounds({
      now,
      startedAt: now,
      accountStart: null,
      planWeek: false,
    });
    expect(bounds.earliest).toBe(at(28, 0));
  });

  it("keeps a session's own start when it began before the floor", () => {
    const resumed = at(25, 22);
    const bounds = startBounds({
      now,
      startedAt: resumed,
      accountStart: at(26),
      planWeek: false,
    });
    expect(bounds.earliest).toBe(resumed);
  });
});

describe("the days offered", () => {
  it("are today back to the floor's day, newest first", () => {
    expect(startDays({ earliest: at(25, 14), latest: now })).toEqual([
      "2026-10-28",
      "2026-10-27",
      "2026-10-26",
      "2026-10-25",
    ]);
    expect(startDays({ earliest: at(28, 9), latest: now })).toEqual([
      "2026-10-28",
    ]);
  });

  it("cross a month", () => {
    expect(
      startDays({ earliest: at(30, 9, 0, 8), latest: at(1, 8, 0, 9) })
    ).toEqual(["2026-10-01", "2026-09-30"]);
  });
});

describe("a stated time", () => {
  const bounds = { earliest: at(27, 14, 2), latest: now };

  it("is the day and time picked", () => {
    expect(startAt("2026-10-27", 18, 30)).toBe(at(27, 18, 30));
  });

  it("is refused later than now, by the minute", () => {
    expect(startProblem(at(28, 12, 1), bounds)).toBe("later-than-now");
    expect(startProblem(now + 30_000, bounds)).toBeNull();
    expect(startProblem(at(28, 11, 59), bounds)).toBeNull();
  });

  it("is refused before the floor", () => {
    expect(startProblem(at(27, 14, 1), bounds)).toBe("before-the-floor");
    expect(startProblem(at(27, 14, 2), bounds)).toBeNull();
  });
});

describe("how the finish screen says it", () => {
  it("names today and yesterday, and other days day first", () => {
    expect(startDayName(new Date(now), "2026-10-28")).toBe("Today");
    expect(startDayName(new Date(at(27)), "2026-10-28")).toBe("Yesterday");
    expect(startDayName(new Date(at(26)), "2026-10-28")).toBe("Mon 26 Oct");
    expect(startDayName(new Date(at(26, 9, 0, 11)), "2027-01-02")).toBe(
      "Sat 26 Dec 2026"
    );
  });

  it("with its time in 24 hours", () => {
    expect(startLabel(at(27, 18, 5), "2026-10-28")).toBe("Yesterday · 18:05");
    expect(startLabel(at(28, 7, 10), "2026-10-28")).toBe("Today · 07:10");
  });
});

describe("an empty workout's name", () => {
  it("is trimmed, its spaces single, and Workout when nothing is typed", () => {
    expect(emptyWorkoutName("  Hotel   gym ")).toBe("Hotel gym");
    expect(emptyWorkoutName("   ")).toBe(EMPTY_WORKOUT_NAME);
    expect(emptyWorkoutName(undefined)).toBe(EMPTY_WORKOUT_NAME);
  });

  it("is no longer than the longest name", () => {
    expect(emptyWorkoutName("x".repeat(80))).toHaveLength(
      EMPTY_WORKOUT_NAME_MAX
    );
  });

  it("is the saved workout's whole title, a dash in it too", () => {
    const name = emptyWorkoutName("Legs — heavy");
    expect(workoutTitle({ notes: name })).toBe("Legs – heavy");
  });
});
