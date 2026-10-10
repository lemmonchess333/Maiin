import { afterEach, describe, expect, it, vi } from "vitest";
import { todaySession, type TodaySessionInput } from "../todaySession";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { DayType } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";

/**
 * Today's session on Home, decided without the page. Every date here is a
 * key the test passes in; the module reads no clock, so none of them has
 * to sit inside a window the real day moves. 27 September 2026 is a
 * Sunday and 30 September a Wednesday.
 */
const SUNDAY = "2026-09-27";
const MONDAY = "2026-09-28";
const WEDNESDAY = "2026-09-30";
const THURSDAY = "2026-10-01";
const FRIDAY = "2026-10-02";
const DAY = 86_400_000;

function profileWith(
  types: Partial<Record<number, DayType>>,
  extra: Partial<UserProfile> = {}
): UserProfile {
  return {
    uid: "u1",
    displayName: "Test",
    weekSchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      type: types[day] ?? "rest",
    })),
    weeklyWorkoutsTarget: 3,
    ...extra,
  } as unknown as UserProfile;
}

function programStateWith(overrides: Record<string, unknown> = {}) {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 3,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays: [],
    ...overrides,
  } as unknown as ProgramState;
}

function workoutDay(
  dayName: string,
  extra: Record<string, unknown> = {},
  exerciseIds = ["lat-pulldown"]
) {
  return {
    dayName,
    dayType: "pull",
    exercises: exerciseIds.map((exerciseId) => ({
      name: exerciseId,
      exerciseId,
      sets: 3,
    })),
    completed: false,
    ...extra,
  };
}

function runDay(dateKey: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `rd-${dateKey}`,
    dayIndex: parseLocalDate(dateKey).getDay(),
    date: dateKey,
    weekKey: localWeekKey(parseLocalDate(dateKey)),
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

const PUSH = workoutDay("Push — Chest Focus");
const PULL = workoutDay("Pull — Lat Focus");
const LEGS = workoutDay("Legs — Quad Focus");

/** An account well past its first fortnight, with sessions and meals. */
function input(extra: Partial<TodaySessionInput> = {}): TodaySessionInput {
  const nowMs = parseLocalDate(WEDNESDAY).getTime() + 12 * 3_600_000;
  return {
    today: WEDNESDAY,
    profile: profileWith({}),
    programState: programStateWith(),
    claimMap: new Map(),
    workouts: [{ id: "old", date: "2026-08-01" }],
    createdAtMs: nowMs - 90 * DAY,
    nowMs,
    lifetimeRuns: 12,
    lifetimeMeals: 40,
    ...extra,
  };
}

/** A new account: two days old, nothing logged yet. */
function newAccount(extra: Partial<TodaySessionInput> = {}) {
  const base = input();
  return input({
    workouts: [],
    createdAtMs: base.nowMs - 2 * DAY,
    lifetimeRuns: 0,
    lifetimeMeals: 0,
    ...extra,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("todaySession — a lifting day", () => {
  it("offers the programme's next workout, not the weekday's", () => {
    // Wednesday is the week's third lift day, but nothing is done yet:
    // Train starts at the first workout, and so does Home (ADR-0002).
    const session = todaySession(
      input({
        profile: profileWith({ 1: "lift", 2: "lift", 3: "lift" }),
        programState: programStateWith({ workouts: [PUSH, PULL, LEGS] }),
      })
    );
    expect(session).toMatchObject({ type: "lift", run: null, rest: null });
    expect(session.lift).toMatchObject({
      index: 0,
      isStartable: true,
      status: "planned",
    });
    expect(session.lift?.workout?.dayName).toBe("Push — Chest Focus");
  });

  it("keeps a workout finished today on the card, done", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "lift" }),
        programState: programStateWith({
          workouts: [
            { ...PUSH, completed: true, completedWorkoutId: "w-today" },
            PULL,
          ],
        }),
        workouts: [{ id: "w-today", date: WEDNESDAY }],
      })
    );
    expect(session.lift).toMatchObject({
      index: 0,
      status: "completed",
      isStartable: false,
    });
  });

  it("offers no workout on a lifting day the programme has none for", () => {
    // StackedCTACards shows "Check your lifting plan" instead.
    const session = todaySession(
      input({ profile: profileWith({ 3: "lift" }) })
    );
    expect(session.type).toBe("lift");
    expect(session.lift?.workout).toBeNull();
  });

  it("names up to three muscle groups, then more", () => {
    const four = workoutDay("Upper — Mixed", {}, [
      "bench-press",
      "lat-pulldown",
      "overhead-press",
      "barbell-curl",
    ]);
    const three = workoutDay("Upper — Push", {}, [
      "bench-press",
      "overhead-press",
      "bench-press",
    ]);
    const lift = (workout: ReturnType<typeof workoutDay>) =>
      todaySession(
        input({
          profile: profileWith({ 3: "lift" }),
          programState: programStateWith({ workouts: [workout] }),
        })
      ).lift;
    expect(lift(four)?.muscleGroups).toBe("Chest · Back · Shoulders + more");
    expect(lift(three)?.muscleGroups).toBe("Chest · Shoulders");
  });
});

describe("todaySession — a run day", () => {
  it("offers the run planned on the date", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "run" }),
        programState: programStateWith({ runDays: [runDay(WEDNESDAY)] }),
      })
    );
    expect(session).toMatchObject({ type: "run", lift: null, rest: null });
    expect(session.run).toMatchObject({ completed: false, isFirst: false });
    expect(session.run?.runDay?.id).toBe(`rd-${WEDNESDAY}`);
  });

  it("reads the run as done when its completion is claimed", () => {
    const claimMap = new Map<string, ClaimState>([
      [`rd-${WEDNESDAY}`, { manualCompleted: true, legacyCompleted: false }],
    ]);
    const session = todaySession(
      input({
        profile: profileWith({ 3: "run" }),
        programState: programStateWith({ runDays: [runDay(WEDNESDAY)] }),
        claimMap,
      })
    );
    expect(session.run?.completed).toBe(true);
  });

  it("offers both on a day that has both", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "both" }),
        programState: programStateWith({
          workouts: [PUSH],
          runDays: [runDay(WEDNESDAY)],
        }),
      })
    );
    expect(session.type).toBe("both");
    expect(session.lift?.workout?.dayName).toBe("Push — Chest Focus");
    expect(session.run?.runDay?.id).toBe(`rd-${WEDNESDAY}`);
    expect(session.rest).toBeNull();
  });
});

describe("todaySession — a new person's first run", () => {
  const runDayInput = {
    profile: profileWith({ 3: "run" }),
    programState: programStateWith({ runDays: [runDay(WEDNESDAY)] }),
  };

  it("frames the run as their first", () => {
    expect(todaySession(newAccount(runDayInput)).run?.isFirst).toBe(true);
  });

  it("does not while their runs are still being counted", () => {
    // Read as having some, so "Your first run" never flashes and goes.
    expect(
      todaySession(newAccount({ ...runDayInput, lifetimeRuns: null })).run
        ?.isFirst
    ).toBe(false);
  });

  it("does not after the first fortnight", () => {
    const nowMs = input().nowMs;
    expect(
      todaySession(
        newAccount({ ...runDayInput, createdAtMs: nowMs - 20 * DAY })
      ).run?.isFirst
    ).toBe(false);
  });
});

describe("todaySession — what a rest day offers", () => {
  const firstWorkoutReady = {
    programState: programStateWith({ workouts: [PUSH, PULL] }),
  };
  const freeRunner = profileWith(
    {},
    { runMode: "freeform", athleteType: "Runner" }
  );

  it("a new lifter's first workout, whatever the weekday", () => {
    const session = todaySession(newAccount(firstWorkoutReady));
    expect(session).toMatchObject({ type: "rest", lift: null, run: null });
    expect(session.rest).toMatchObject({ kind: "first-workout", index: 0 });
  });

  it("the workout chosen to go next, when one was", () => {
    const session = todaySession(
      newAccount({
        programState: programStateWith({
          workouts: [PUSH, PULL],
          nextWorkoutOverride: 1,
        }),
      })
    );
    expect(session.rest).toMatchObject({ kind: "first-workout", index: 1 });
  });

  it("the first workout before a free run", () => {
    expect(
      todaySession(newAccount({ ...firstWorkoutReady, profile: freeRunner }))
        .rest?.kind
    ).toBe("first-workout");
  });

  it("a run to someone who runs freely", () => {
    expect(todaySession(input({ profile: freeRunner })).rest).toEqual({
      kind: "free-run",
    });
    // A free-running lifter is not offered one: they have no run day.
    expect(
      todaySession(
        input({
          profile: profileWith(
            {},
            { runMode: "freeform", athleteType: "Lifter" }
          ),
        })
      ).rest?.kind
    ).toBe("rest");
  });

  it("a free run before a new person's first meal", () => {
    expect(todaySession(newAccount({ profile: freeRunner })).rest).toEqual({
      kind: "free-run",
    });
  });

  it("a new person's first meal, when there is no workout to offer", () => {
    expect(todaySession(newAccount()).rest).toEqual({ kind: "first-meal" });
    // A meal logged ends it.
    expect(todaySession(newAccount({ lifetimeMeals: 1 })).rest?.kind).toBe(
      "rest"
    );
  });

  it("otherwise a rest day, with nothing tomorrow when tomorrow rests too", () => {
    expect(todaySession(input()).rest).toEqual({
      kind: "rest",
      tomorrow: null,
    });
  });
});

describe("todaySession — the rest day names tomorrow", () => {
  it("names Monday's run on a Sunday, before the new week's runs are written", () => {
    /* The plan holds this week's runs only; Monday's run is written when
       the week rolls over. Tomorrow is still a run day. */
    const session = todaySession(
      input({
        today: SUNDAY,
        profile: profileWith({ 1: "run" }),
        programState: programStateWith({
          runDays: [runDay("2026-09-21", { status: "completed_exact" })],
        }),
      })
    );
    // Runs are pinned to dates (ADR-0002), so the day opens by its date.
    expect(session.rest).toEqual({
      kind: "rest",
      tomorrow: { label: "Run", target: `/program?tab=run&rday=${MONDAY}` },
    });
  });

  it("names the run planned for tomorrow", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 4: "run" }),
        programState: programStateWith({ runDays: [runDay(THURSDAY)] }),
      })
    );
    expect(session.rest).toMatchObject({
      tomorrow: {
        label: "Easy 30",
        target: `/program?tab=run&rday=${THURSDAY}`,
      },
    });
  });

  it("names nothing for a day whose run was moved to another day", () => {
    /* Moving a run changes its date and leaves the weekly schedule alone,
       so Thursday is still a run day after its run moves to Friday. The
       week's runs are written, and none is on Thursday. */
    const session = todaySession(
      input({
        profile: profileWith({ 4: "run" }),
        programState: programStateWith({
          runDays: [runDay(FRIDAY, { movedFromDate: THURSDAY })],
        }),
      })
    );
    expect(session.rest).toEqual({ kind: "rest", tomorrow: null });
  });

  it("reads a run with no date or week as this week's, as the resolver does", () => {
    const undated = (dayIndex: number) =>
      runDay(WEDNESDAY, {
        id: `rd-undated-${dayIndex}`,
        dayIndex,
        date: undefined,
        weekKey: undefined,
      });
    const withRuns = (runDays: unknown[]) =>
      todaySession(
        input({
          profile: profileWith({ 1: "run", 4: "run" }),
          programState: programStateWith({ runDays }),
        })
      ).rest;
    // Anchor: the same plan with a Thursday run names it.
    expect(withRuns([undated(1), undated(4)])).toMatchObject({
      tomorrow: { label: "Easy 30" },
    });
    expect(withRuns([undated(1)])).toEqual({ kind: "rest", tomorrow: null });
  });

  it("names a lift day the way the rest of the app does, and opens it", () => {
    // "Pull · Lat focus", as the workout and finish screens say it.
    const session = todaySession(
      input({
        profile: profileWith({ 4: "lift" }),
        programState: programStateWith({ workouts: [PULL] }),
      })
    );
    expect(session.rest).toEqual({
      kind: "rest",
      tomorrow: { label: "Pull · Lat focus", target: "/program?day=0" },
    });
  });

  it("names the workout that will be next by then, in the programme's order", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 4: "lift" }),
        programState: programStateWith({
          workouts: [{ ...PUSH, completed: true }, PULL, LEGS],
        }),
      })
    );
    expect(session.rest).toMatchObject({
      tomorrow: { label: "Pull · Lat focus", target: "/program?day=1" },
    });
  });

  it("names both sessions of a day that has both", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 4: "both" }),
        programState: programStateWith({
          workouts: [PULL],
          runDays: [runDay(THURSDAY)],
        }),
      })
    );
    expect(session.rest).toEqual({
      kind: "rest",
      tomorrow: {
        label: "Pull · Lat focus and Easy 30",
        target: "/program?day=0",
      },
    });
  });
});

describe("todaySession — one day", () => {
  it("reads the day it is given, not the clock's", () => {
    // The clock says Monday, a lifting day; the day Home passes is Sunday.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(parseLocalDate(MONDAY).getTime() + 9 * 3_600_000);
    const session = todaySession(
      input({
        today: SUNDAY,
        profile: profileWith({ 1: "lift" }),
        programState: programStateWith({ workouts: [PULL] }),
      })
    );
    expect(session.type).toBe("rest");
    expect(session.rest).toMatchObject({
      tomorrow: { label: "Pull · Lat focus" },
    });
  });

  it("judges which days have come by that day too", () => {
    /* Home's day can trail the clock; here the clock still says Sunday
       and the day is Monday, whose workout, the week's only one, is done.
       Against the clock Monday would not have come yet, and a day that
       has not come shows its lift planned (ADR-0002). */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(parseLocalDate(SUNDAY).getTime() + 23 * 3_600_000);
    const session = todaySession(
      input({
        today: MONDAY,
        profile: profileWith({ 1: "lift" }),
        programState: programStateWith({
          workouts: [{ ...PULL, completed: true }],
        }),
      })
    );
    expect(session.lift).toMatchObject({
      status: "completed",
      isStartable: false,
    });
  });
});

describe("todaySession — a long run that finishes at race pace (Run21 (2))", () => {
  // Half, 10 weeks: week 6 is the build, where a goal time gives a long run
  // of 12 km or more a race-pace finish (the launch's gate).
  const racePlan = (runDays: unknown[]) =>
    programStateWith({
      runDays,
      runPlan: {
        mode: "race_prep",
        currentWeek: 5,
        totalWeeks: 10,
        raceGoal: { distance: "half", targetDate: "2099-01-01" },
      },
    });
  const racer = (
    types: Partial<Record<number, DayType>>,
    targetTimeS?: number
  ) =>
    profileWith(types, {
      runMode: "race_prep",
      raceGoal: {
        distance: "half",
        targetDate: "2099-01-01",
        ...(targetTimeS ? { targetTimeS } : {}),
      },
    });
  const long15 = { templateId: "long_15k", type: "long" };

  it("gives today's run card the finish its name says", () => {
    const session = todaySession(
      input({
        profile: racer({ 3: "run" }, 6330),
        programState: racePlan([runDay(WEDNESDAY, long15)]),
      })
    );
    expect(session.run?.racePaceFinish?.blockKm).toBe(5);
  });

  it("gives none without a goal time", () => {
    const session = todaySession(
      input({
        profile: racer({ 3: "run" }),
        programState: racePlan([runDay(WEDNESDAY, long15)]),
      })
    );
    expect(session.run?.racePaceFinish).toBeNull();
  });

  it("names it so on the rest day before it", () => {
    const session = todaySession(
      input({
        profile: racer({ 4: "run" }, 6330),
        programState: racePlan([runDay(THURSDAY, long15)]),
      })
    );
    expect(session.rest).toMatchObject({
      tomorrow: { label: "Long 15K with race pace" },
    });
  });
});
