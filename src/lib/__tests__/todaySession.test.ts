import { afterEach, describe, expect, it, vi } from "vitest";
import { todaySession, type TodaySessionInput } from "../todaySession";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import type { DayType } from "@/lib/scheduleUtils";
import type { ClaimState } from "@/lib/scheduledRunCompletion";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import {
  programmeDraftIdentity,
  sessionDayContext,
} from "@/features/program/sessionDay";
import type { SessionVariant } from "@/features/program/expressSession";
import type { WorkoutDraft } from "@/hooks/useWorkoutDraft";
import type { StoredRunSummary } from "@/lib/runResumeStorage";
import { freeformPlanMetadata } from "@/lib/runPlanMetadata";
import { storedRunName } from "@/lib/sessionsInFlight";
import {
  routineDraftIdentity,
  type RoutineLayout,
} from "@/features/program/routineSession";

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
    // Named as Train names it; the stored name stays the day's key.
    expect(session.lift?.name).toBe("Push");
  });

  it("names the card's day with its letter when the week repeats its type", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "lift" }),
        programState: programStateWith({
          workouts: [
            { ...PUSH, completed: true },
            workoutDay("Push — Shoulder Focus"),
          ],
        }),
      })
    );
    expect(session.lift).toMatchObject({ index: 1, name: "Push B" });
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

/* F14 and F21 (the training-engine simulator): runs are pinned to dates
   and lifts to the week's pattern (ADR-0002), but the card asked the
   weekday whether there was a run. A Sunday race read as a rest day for 7
   of the 10 race personas, and a run moved to another weekday showed rest
   there, 11 times of 11. */
describe("todaySession — a run sits on its date, whatever the weekday", () => {
  it("offers a race on a Sunday the week leaves to rest", () => {
    const session = todaySession(
      input({
        today: SUNDAY,
        profile: profileWith({ 2: "run", 4: "run" }),
        programState: programStateWith({
          runDays: [runDay(SUNDAY, { templateId: "half_race", type: "race" })],
        }),
      })
    );
    expect(session.type).toBe("run");
    expect(session.run?.runDay?.id).toBe(`rd-${SUNDAY}`);
    expect(session.rest).toBeNull();
  });

  it("offers a run moved to a lifting day, with the lift", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "lift", 4: "run" }),
        programState: programStateWith({
          workouts: [PUSH],
          runDays: [runDay(WEDNESDAY, { movedFromDate: THURSDAY })],
        }),
      })
    );
    expect(session.type).toBe("both");
    expect(session.lift?.workout?.dayName).toBe("Push — Chest Focus");
    expect(session.run?.runDay?.id).toBe(`rd-${WEDNESDAY}`);
  });

  it("offers no run on the weekday a run moved from, once the week's runs are written", () => {
    const session = todaySession(
      input({
        today: THURSDAY,
        profile: profileWith({ 4: "run" }),
        programState: programStateWith({
          runDays: [runDay(FRIDAY, { movedFromDate: THURSDAY })],
        }),
      })
    );
    expect(session.type).toBe("rest");
    expect(session.run).toBeNull();
  });

  it("still offers a run on a free runner's run weekday, where no runs are written", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "run" }, { runMode: "freeform" }),
        programState: programStateWith({ runDays: [] }),
      })
    );
    expect(session.type).toBe("run");
    expect(session.run?.runDay).toBeNull();
  });
});

/* Run21 (5): Home's card states the run's dose. A timed run states its
   time; a long run its distance, and its minutes at the runner's own easy
   pace once a benchmark is confirmed. The template's "about 80 min" for
   15 km assumed 5:20 /km. */
describe("todaySession — a run's dose", () => {
  // A 25-minute 5K, confirmed: an easy pace of about 6:32 /km.
  const confirmed = {
    runFitness: {
      benchmark: { distanceM: 5000, timeS: 25 * 60 },
      vdot: 38.3,
      source: "manual",
    },
  } as Partial<UserProfile>;
  const dose = (templateId: string, extra: Partial<UserProfile> = {}) =>
    todaySession(
      input({
        profile: profileWith({ 3: "run" }, extra),
        programState: programStateWith({
          runDays: [runDay(WEDNESDAY, { templateId })],
        }),
      })
    ).run?.dose;

  // FV3: the first-visit walk names today's run as its card does.
  it("names the run as its card does", () => {
    const run = (templateId: string) =>
      todaySession(
        input({
          profile: profileWith({ 3: "run" }),
          programState: programStateWith({
            runDays: [runDay(WEDNESDAY, { templateId })],
          }),
        })
      ).run;
    expect(run("easy_40")?.name).toBe("Easy 40");
    expect(run("long_15k")?.name).toBe("Long 15K");
  });

  it("is a timed run's own time", () => {
    expect(dose("easy_40")).toBe("40 min");
    expect(dose("easy_40", confirmed)).toBe("40 min");
  });

  it("is a long run's distance, and its minutes at a confirmed pace", () => {
    expect(dose("long_15k")).toBe("15 km");
    expect(dose("long_15k", confirmed)).toBe("15 km · about 100 min");
  });

  it("waits for a derived benchmark to be confirmed", () => {
    expect(
      dose("long_15k", {
        runFitness: {
          ...confirmed.runFitness!,
          source: "derived",
          pendingConfirmation: true,
        },
      } as Partial<UserProfile>)
    ).toBe("15 km");
  });

  it("is the day's override when the person swapped the run", () => {
    expect(
      todaySession(
        input({
          profile: profileWith({ 3: "run" }),
          programState: programStateWith({
            runDays: [
              runDay(WEDNESDAY, {
                templateId: "long_15k",
                userOverride: "easy_30",
              }),
            ],
          }),
        })
      ).run?.dose
    ).toBe("30 min");
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
    expect(session.rest).toMatchObject({
      kind: "first-workout",
      index: 0,
      name: "Push",
    });
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

  it("names a lift day as Train names it, and opens it", () => {
    // The day's type: a week of one Pull day gives it no letter.
    const session = todaySession(
      input({
        profile: profileWith({ 4: "lift" }),
        programState: programStateWith({ workouts: [PULL] }),
      })
    );
    expect(session.rest).toEqual({
      kind: "rest",
      tomorrow: { label: "Pull", target: "/program?day=0" },
    });
  });

  it("letters the day when its week holds another of its type", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 4: "lift" }),
        programState: programStateWith({
          workouts: [PULL, workoutDay("Pull — Row Focus")],
        }),
      })
    );
    expect(session.rest).toMatchObject({
      tomorrow: { label: "Pull A", target: "/program?day=0" },
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
      tomorrow: { label: "Pull", target: "/program?day=1" },
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
        label: "Pull and Easy 30",
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
      tomorrow: { label: "Pull" },
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
    expect(session.run?.racePace).toMatchObject({ kind: "finish", blockKm: 5 });
    // Named as its card names it, which the first-visit walk reads (FV3).
    expect(session.run?.name).toBe("Long 15K with race pace");
  });

  it("gives none without a goal time", () => {
    const session = todaySession(
      input({
        profile: racer({ 3: "run" }),
        programState: racePlan([runDay(WEDNESDAY, long15)]),
      })
    );
    expect(session.run?.racePace).toBeNull();
  });

  it("gives a tempo at the goal pace its race pace, and names it so", () => {
    const tempo = { templateId: "tempo_20", type: "tempo" };
    const today = todaySession(
      input({
        profile: racer({ 3: "run" }, 6330),
        programState: racePlan([runDay(WEDNESDAY, tempo)]),
      })
    );
    expect(today.run?.racePace).toMatchObject({ kind: "tempo" });
    const restDay = todaySession(
      input({
        profile: racer({ 4: "run" }, 6330),
        programState: racePlan([runDay(THURSDAY, tempo)]),
      })
    );
    expect(restDay.rest).toMatchObject({
      tomorrow: { label: "20 Min Tempo at race pace" },
    });
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

/* A session under way on this phone: a workout's draft, or the stored run.
   The draft's identity is the one Train's workout screen gives it, built
   by the same code (`sessionDay.ts`), so the card offers only what Resume
   will open. */
function draftFor(
  state: ProgramState,
  profile: UserProfile,
  dayIndex: number,
  {
    variant = "full",
    ticked = 2,
    savedAt = 1_000,
    weekNumber = state.weekNumber,
  }: {
    variant?: SessionVariant;
    ticked?: number;
    savedAt?: number;
    weekNumber?: number;
  } = {}
): WorkoutDraft {
  const day = state.workouts[dayIndex];
  return {
    dayIndex,
    dayName: day.dayName,
    setLogs: [
      Array.from({ length: 3 }, (_, i) => ({
        reps: 8,
        weight: 40,
        completed: i < ticked,
        type: "working" as const,
      })),
    ],
    exerciseNotes: {},
    elapsedSeconds: 1120,
    currentExIndex: 0,
    savedAt,
    identity: programmeDraftIdentity(
      day,
      dayIndex,
      weekNumber,
      variant,
      sessionDayContext(state, profile)
    ),
    completionId: "c1",
    completionCommandId: "c1",
  };
}

function storedRun(extra: Partial<StoredRunSummary> = {}): StoredRunSummary {
  return {
    v: 2,
    config: {
      activityType: "freerun",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: false,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time"],
      target: { type: "none" },
      planMetadata: freeformPlanMetadata("freeform"),
    },
    startedAt: 0,
    accumulatedSeconds: 1500,
    isRunning: false,
    lastWriteAt: 0,
    phase: "paused",
    ...extra,
  };
}

describe("todaySession — a session under way", () => {
  const liftDay = profileWith({ 3: "lift" });
  const plan = programStateWith({ workouts: [PUSH, PULL, LEGS] });

  it("puts today's workout under way on its own card, in Start's place", () => {
    const session = todaySession(
      input({
        profile: liftDay,
        programState: plan,
        inFlight: { drafts: [draftFor(plan, liftDay, 0)], run: null },
      })
    );
    expect(session.lift?.inProgress).toEqual({
      sport: "lift",
      name: "Push",
      sets: 2,
      elapsedSeconds: 1120,
      resumeTarget: "/program?day=0&resume=1",
    });
    expect(session.inProgressElsewhere).toEqual([]);
  });

  it("gives another day's workout under way a strip of its own", () => {
    const session = todaySession(
      input({
        profile: liftDay,
        programState: plan,
        inFlight: { drafts: [draftFor(plan, liftDay, 1)], run: null },
      })
    );
    expect(session.lift?.inProgress).toBeUndefined();
    expect(session.inProgressElsewhere).toEqual([
      expect.objectContaining({ name: "Pull", sets: 2 }),
    ]);
  });

  it("recognises a workout started short or easier, as it was started", () => {
    const budget = profileWith({ 3: "lift" }, { liftTimeBudgetMinutes: 30 });
    for (const variant of ["time_budget", "easier_today", "express30"] as const)
      expect(
        todaySession(
          input({
            profile: budget,
            programState: plan,
            inFlight: {
              drafts: [draftFor(plan, budget, 0, { variant })],
              run: null,
            },
          })
        ).lift?.inProgress
      ).toMatchObject({ resumeTarget: "/program?day=0&resume=1" });
  });

  it("offers nothing Resume could not open: last week's, an edited day, a finished day", () => {
    const lastWeek = draftFor(plan, liftDay, 0, { weekNumber: 2 });
    const edited = draftFor(
      programStateWith({
        workouts: [workoutDay("Push — Chest Focus", {}, ["bench-press"])],
      }),
      liftDay,
      0
    );
    const finished = draftFor(plan, liftDay, 0);
    const finishedPlan = programStateWith({
      workouts: [{ ...PUSH, completed: true }, PULL, LEGS],
    });
    const waiting = { ...draftFor(plan, liftDay, 0), completionPending: true };
    const routine = {
      ...draftFor(plan, liftDay, 0),
      identity: "v1|routine:abc|e0|d-1|Push — Chest Focus|lat-pulldownx3",
    };
    for (const [state, draft] of [
      [plan, lastWeek],
      [plan, edited],
      [finishedPlan, finished],
      [plan, waiting],
      [plan, routine],
    ] as const) {
      const session = todaySession(
        input({
          profile: liftDay,
          programState: state,
          inFlight: { drafts: [draft], run: null },
        })
      );
      expect(session.lift?.inProgress).toBeUndefined();
      expect(session.inProgressElsewhere).toEqual([]);
    }
  });

  it("offers the newest of two workouts under way", () => {
    const session = todaySession(
      input({
        profile: liftDay,
        programState: plan,
        inFlight: {
          drafts: [
            draftFor(plan, liftDay, 0, { savedAt: 1 }),
            draftFor(plan, liftDay, 2, { savedAt: 2 }),
          ],
          run: null,
        },
      })
    );
    // Named as Train names the day in its week.
    expect(session.inProgressElsewhere).toEqual([
      expect.objectContaining({
        name: "Legs · Quad focus",
        resumeTarget: "/program?day=2&resume=1",
      }),
    ]);
  });

  it("puts a new lifter's first workout under way on the rest day's card", () => {
    const rest = profileWith({});
    const session = todaySession(
      newAccount({
        profile: rest,
        programState: plan,
        inFlight: { drafts: [draftFor(plan, rest, 0)], run: null },
      })
    );
    expect(session.rest).toMatchObject({
      kind: "first-workout",
      inProgress: { name: "Push" },
    });
  });

  it("puts a run under way on today's run card while it could start one", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "run" }),
        programState: programStateWith({ runDays: [runDay(WEDNESDAY)] }),
        inFlight: { drafts: [], run: storedRun() },
      })
    );
    expect(session.run?.inProgress).toEqual({
      sport: "run",
      name: "Free run",
      sets: null,
      elapsedSeconds: 1500,
      resumeTarget: "/run?resume=1",
    });
  });

  it("names a run by the plan's session it was started from", () => {
    const session = todaySession(
      input({
        profile: profileWith({ 3: "run" }),
        programState: programStateWith({ runDays: [runDay(WEDNESDAY)] }),
        inFlight: {
          drafts: [],
          run: storedRun({
            config: {
              ...storedRun().config,
              activityType: "easy",
              planMetadata: {
                ...freeformPlanMetadata("freeform"),
                actualTemplateId: "easy_30",
              },
            },
          }),
        },
      })
    );
    expect(session.run?.inProgress?.name).toBe(session.run?.name);
  });

  it("gives a run under way its own strip on a lifting day, or when today's run is done", () => {
    const onLiftDay = todaySession(
      input({
        profile: liftDay,
        programState: plan,
        inFlight: { drafts: [], run: storedRun() },
      })
    );
    expect(onLiftDay.inProgressElsewhere).toEqual([
      expect.objectContaining({ sport: "run" }),
    ]);
    const doneToday = todaySession(
      input({
        profile: profileWith({ 3: "run" }),
        programState: programStateWith({
          runDays: [
            runDay(WEDNESDAY, { completed: true, status: "completed" }),
          ],
        }),
        inFlight: { drafts: [], run: storedRun() },
      })
    );
    expect(doneToday.run?.inProgress).toBeUndefined();
    expect(doneToday.inProgressElsewhere).toEqual([
      expect.objectContaining({ sport: "run" }),
    ]);
  });

  it("puts a run under way on a free runner's rest-day card", () => {
    const session = todaySession(
      input({
        profile: profileWith(
          {},
          { runMode: "freeform", athleteType: "Runner" }
        ),
        inFlight: { drafts: [], run: storedRun() },
      })
    );
    expect(session.rest).toMatchObject({
      kind: "free-run",
      inProgress: { sport: "run" },
    });
  });

  it("names a type started without a template in sentence case", () => {
    expect(
      storedRunName(
        { ...storedRun().config, activityType: "tempo" },
        null,
        "km"
      )
    ).toBe("Tempo run");
  });
});

/* A saved routine's workout under way. Its draft's identity is the one its
   page gives it (`routineSession.ts`), and it is offered only while the
   routine, as it is now, builds the same session. */
describe("todaySession — a routine's workout under way", () => {
  const liftDay = profileWith({ 3: "lift" });
  const plan = programStateWith({ workouts: [PUSH, PULL, LEGS] });
  const ARMS: RoutineLayout = {
    id: "r1",
    name: "Arms",
    exercises: [
      {
        name: "Barbell Curl",
        exerciseId: "barbell-curl",
        summary: "3×10",
        setCount: 3,
        targetReps: 10,
        targetWeightKg: 30,
      },
    ],
  };
  const [CURL] = ARMS.exercises;
  function routineDraft(
    routine: RoutineLayout,
    extra: Partial<WorkoutDraft> = {}
  ): WorkoutDraft {
    return {
      dayIndex: -1,
      dayName: routine.name,
      setLogs: [
        Array.from({ length: 3 }, (_, i) => ({
          reps: 10,
          weight: 30,
          completed: i === 0,
          type: "working" as const,
        })),
      ],
      exerciseNotes: {},
      elapsedSeconds: 640,
      currentExIndex: 0,
      savedAt: 2_000,
      identity: routineDraftIdentity(routine),
      completionId: "c2",
      completionCommandId: "c2",
      ...extra,
    };
  }
  const routinesNow = (...routines: RoutineLayout[]) =>
    new Map(routines.map((routine) => [routine.id, routine]));
  function offered(
    drafts: WorkoutDraft[],
    routines: ReadonlyMap<string, RoutineLayout> | undefined,
    extra: Partial<TodaySessionInput> = {}
  ) {
    return todaySession(
      input({
        profile: liftDay,
        programState: plan,
        inFlight: { drafts, run: null, routines },
        ...extra,
      })
    );
  }

  it("gives it a strip of its own, named as the routine, whose Resume opens its page", () => {
    const session = offered([routineDraft(ARMS)], routinesNow(ARMS));
    expect(session.inProgressElsewhere).toEqual([
      {
        sport: "lift",
        name: "Arms",
        sets: 1,
        elapsedSeconds: 640,
        resumeTarget: "/routine/r1?resume=1",
      },
    ]);
    // Today's own card still offers its Start.
    expect(session.lift).toMatchObject({ index: 0, name: "Push" });
    expect(session.lift?.inProgress).toBeUndefined();
  });

  it("is offered to someone with no programme too", () => {
    const session = offered([routineDraft(ARMS)], routinesNow(ARMS), {
      profile: profileWith({}),
      programState: null,
    });
    expect(session.inProgressElsewhere).toEqual([
      expect.objectContaining({ name: "Arms" }),
    ]);
  });

  it("offers nothing Resume could not open: a routine deleted, renamed, or with an exercise or a set count changed", () => {
    // The control: as kept, it is offered.
    expect(
      offered([routineDraft(ARMS)], routinesNow(ARMS)).inProgressElsewhere
    ).toHaveLength(1);
    for (const now of [
      // Deleted since, or not read yet.
      routinesNow(),
      undefined,
      routinesNow({ ...ARMS, name: "Arms day" }),
      routinesNow({ ...ARMS, exercises: [{ ...CURL, setCount: 4 }] }),
      routinesNow({
        ...ARMS,
        exercises: [
          CURL,
          { ...CURL, name: "Hammer Curl", exerciseId: "hammer-curl" },
        ],
      }),
      // Another routine's document.
      routinesNow({ ...ARMS, id: "r2" }),
    ])
      expect(offered([routineDraft(ARMS)], now).inProgressElsewhere).toEqual(
        []
      );
    // A finished workout waiting for the server is not under way.
    expect(
      offered(
        [routineDraft(ARMS, { completionPending: true })],
        routinesNow(ARMS)
      ).inProgressElsewhere
    ).toEqual([]);
  });

  it("offers the newer of a routine's workout and a programme day's", () => {
    const routine = routineDraft(ARMS, { savedAt: 2_000 });
    const newerRoutine = offered(
      [draftFor(plan, liftDay, 0, { savedAt: 1_000 }), routine],
      routinesNow(ARMS)
    );
    expect(newerRoutine.inProgressElsewhere).toEqual([
      expect.objectContaining({ name: "Arms" }),
    ]);
    expect(newerRoutine.lift?.inProgress).toBeUndefined();

    const newerDay = offered(
      [draftFor(plan, liftDay, 0, { savedAt: 3_000 }), routine],
      routinesNow(ARMS)
    );
    expect(newerDay.lift?.inProgress).toMatchObject({
      resumeTarget: "/program?day=0&resume=1",
    });
    expect(newerDay.inProgressElsewhere).toEqual([]);
  });
});
