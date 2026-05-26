/**
 * Tests for the shared date-aware training resolver (PR-0c).
 *
 * The resolver answers "what's training for this calendar date?"
 * for Home, DayPeekCard, WeekStrip, and DayActionSheet. These
 * tests pin the correctness contracts inline derivations got
 * wrong:
 *
 *   - runDay matching is by date, then weekKey+dayIndex, then
 *     legacy-fallback ONLY when target date is in current week.
 *     A next-Monday strip date must NEVER inherit this-Monday's
 *     runDay (the date-inheritance bug).
 *   - Freeform users (no run plan) get `run.status === "none"`,
 *     not phantom default-2 run slots.
 *   - Today's lift is found by dayOfWeek → lift-index mapping,
 *     not "next incomplete" array scan.
 *   - Status surfacing routes through scheduledRunStatus helpers,
 *     so skipped is not startable, race_completed_unlinked is
 *     reconciliation not terminal, etc.
 */
import { describe, it, expect } from "vitest";
import {
  resolveRunDayForDate,
  resolveTrainingDayForDate,
  resolveTrainingWindow,
} from "../trainingResolver";
import type { AnyScheduledRunStatus } from "../scheduledRunStatus";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    dayIndex: 1,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutDay> = {}): WorkoutDay {
  return {
    dayName: "Day",
    dayType: "lift",
    exercises: [],
    completed: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "u-1",
    displayName: "Test",
    email: "t@example.com",
    ...overrides,
  } as UserProfile;
}

function makeProgramState(overrides: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "ppl",
    workouts: [],
    fatigueScore: 0,
    updatedAt: Date.now(),
    settings: { autoProgression: true, microloading: true },
    weekHistory: [],
    programSchemaVersion: 2,
    runDays: [],
    ...overrides,
  } as ProgramState;
}

// Anchor week: Sunday 2026-05-17 → Saturday 2026-05-23.
// Mon = "2026-05-18", next Mon = "2026-05-25".
const CURRENT_WEEK_KEY = "2026-05-17";
const THIS_MON = "2026-05-18";
const NEXT_MON = "2026-05-25";

describe("resolveRunDayForDate — priority 1 (exact date)", () => {
  it("matches a runDay whose `date` equals the target", () => {
    const runDays = [makeRunDay({ date: THIS_MON, dayIndex: 1 })];
    expect(resolveRunDayForDate(THIS_MON, runDays, CURRENT_WEEK_KEY)).toBe(
      runDays[0]
    );
  });

  it("does NOT match a runDay whose `date` is for a different calendar day", () => {
    const runDays = [makeRunDay({ date: THIS_MON, dayIndex: 1 })];
    expect(
      resolveRunDayForDate(NEXT_MON, runDays, CURRENT_WEEK_KEY)
    ).toBeNull();
  });
});

describe("resolveRunDayForDate — priority 2 (current-week weekKey)", () => {
  it("matches a runDay with weekKey + dayIndex but no date when target is in the same week", () => {
    const runDays = [
      makeRunDay({ weekKey: CURRENT_WEEK_KEY, dayIndex: 1, date: undefined }),
    ];
    expect(resolveRunDayForDate(THIS_MON, runDays, CURRENT_WEEK_KEY)).toBe(
      runDays[0]
    );
  });

  it("does NOT match a runDay whose weekKey is a different week", () => {
    const runDays = [
      makeRunDay({ weekKey: CURRENT_WEEK_KEY, dayIndex: 1, date: undefined }),
    ];
    // Target next Mon → its weekKey is 2026-05-24, doesn't match
    expect(
      resolveRunDayForDate(NEXT_MON, runDays, CURRENT_WEEK_KEY)
    ).toBeNull();
  });
});

describe("resolveRunDayForDate — priority 3 (legacy guarded fallback)", () => {
  it("matches a date-less / weekKey-less runDay when target is inside the current week", () => {
    const runDays = [
      makeRunDay({ date: undefined, weekKey: undefined, dayIndex: 1 }),
    ];
    expect(resolveRunDayForDate(THIS_MON, runDays, CURRENT_WEEK_KEY)).toBe(
      runDays[0]
    );
  });

  it("does NOT match the same legacy runDay when target is in a future week — THE date-inheritance bug fix", () => {
    const runDays = [
      makeRunDay({ date: undefined, weekKey: undefined, dayIndex: 1 }),
    ];
    expect(
      resolveRunDayForDate(NEXT_MON, runDays, CURRENT_WEEK_KEY)
    ).toBeNull();
  });

  it("does NOT fall back when a runDay HAS date/weekKey (priority 1/2 fail without falling through)", () => {
    // A runDay with a `date` that doesn't match the target shouldn't
    // be reached by the legacy path either.
    const runDays = [makeRunDay({ date: "2026-04-13", dayIndex: 1 })];
    expect(
      resolveRunDayForDate(THIS_MON, runDays, CURRENT_WEEK_KEY)
    ).toBeNull();
  });
});

describe("resolveRunDayForDate — empty / undefined", () => {
  it("returns null for undefined runDays", () => {
    expect(
      resolveRunDayForDate(THIS_MON, undefined, CURRENT_WEEK_KEY)
    ).toBeNull();
  });
  it("returns null for empty runDays array", () => {
    expect(resolveRunDayForDate(THIS_MON, [], CURRENT_WEEK_KEY)).toBeNull();
  });
});

describe("resolveTrainingDayForDate — freeform user, no run plan", () => {
  it("returns run.status='none' for every freeform-user resolved day (phantom-runs bug fix)", () => {
    // Profile has neither weeklyRunDaysTarget nor weeklyRunsTarget set.
    // Pre-PR-0c, Home synthesised `runTarget = 2` and generateSchedule
    // produced run dots; the resolver uses getWeeklyRunTarget which
    // returns 0 so no run slots appear.
    const profile = makeProfile({ weeklyWorkoutsTarget: 3 });
    const programState = makeProgramState();
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(r.run.status).toBe("none");
    expect(r.run.runDay).toBeNull();
    expect(r.run.isStartable).toBe(false);
    expect(r.run.startUrl).toBeNull();
  });

  it("does not synthesise run slots in the schedule when run target is 0", () => {
    const profile = makeProfile({
      weeklyWorkoutsTarget: 3,
      weeklyRunDaysTarget: 0,
    });
    // Sweep every day of the week.
    for (let i = 0; i < 7; i++) {
      const dateKey = `2026-05-${String(17 + i).padStart(2, "0")}`;
      const r = resolveTrainingDayForDate({
        dateKey,
        profile,
        programState: makeProgramState(),
        currentWeekKey: CURRENT_WEEK_KEY,
      });
      expect(r.scheduleType === "run" || r.scheduleType === "both").toBe(false);
    }
  });
});

describe("resolveTrainingDayForDate — next-Monday-does-not-inherit-this-Monday", () => {
  it("a completed_exact runDay on this Mon does not leak into next Mon's resolution", () => {
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "run" },
        { day: 2, type: "rest" },
        { day: 3, type: "rest" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    const programState = makeProgramState({
      runDays: [
        makeRunDay({
          date: THIS_MON,
          weekKey: CURRENT_WEEK_KEY,
          dayIndex: 1,
          status: "completed_exact",
          completed: true,
        }),
      ],
    });
    const thisMon = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    const nextMon = resolveTrainingDayForDate({
      dateKey: NEXT_MON,
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(thisMon.run.isCompleted).toBe(true);
    // Next Mon: weekly schedule still says run, but no runDay matches
    expect(nextMon.scheduleType).toBe("run");
    expect(nextMon.run.runDay).toBeNull();
    expect(nextMon.run.status).toBe("none");
    expect(nextMon.run.isCompleted).toBe(false);
  });
});

describe("resolveTrainingDayForDate — status surfacing", () => {
  // PR-D: `race_completed_unlinked` dropped from the enum;
  // `isReconciliation` field removed from `ResolvedRun`.
  // `race_no_show` is now PR-D's recoverable inferred state —
  // terminal=false because the reconciliation flow allows
  // race_no_show → completed_*.
  // PR-J Q8 P102: status union widened to cover both active +
  // legacy values (the test iterates across both).
  const cases: Array<{
    status: AnyScheduledRunStatus;
    startable: boolean;
    terminal: boolean;
    completed: boolean;
    hasStartUrl: boolean;
  }> = [
    {
      status: "planned",
      startable: true,
      terminal: false,
      completed: false,
      hasStartUrl: true,
    },
    {
      status: "completed_exact",
      startable: false,
      terminal: true,
      completed: true,
      hasStartUrl: false,
    },
    {
      status: "completed_modified",
      startable: false,
      terminal: true,
      completed: true,
      hasStartUrl: false,
    },
    {
      status: "completed_late",
      startable: false,
      terminal: true,
      completed: true,
      hasStartUrl: false,
    },
    {
      status: "skipped",
      startable: false,
      terminal: true,
      completed: false,
      hasStartUrl: false,
    },
    {
      status: "race_no_show",
      startable: false,
      terminal: false,
      completed: false,
      hasStartUrl: false,
    },
  ];

  cases.forEach((c) => {
    it(`status="${c.status}" surfaces correct flags`, () => {
      const profile = makeProfile({
        weekSchedule: [
          { day: 0, type: "rest" },
          { day: 1, type: "run" },
          { day: 2, type: "rest" },
          { day: 3, type: "rest" },
          { day: 4, type: "rest" },
          { day: 5, type: "rest" },
          { day: 6, type: "rest" },
        ],
      });
      const programState = makeProgramState({
        runDays: [
          makeRunDay({
            id: "runday_x",
            date: THIS_MON,
            weekKey: CURRENT_WEEK_KEY,
            dayIndex: 1,
            status: c.status,
            completed: c.completed,
          }),
        ],
      });
      const r = resolveTrainingDayForDate({
        dateKey: THIS_MON,
        profile,
        programState,
        currentWeekKey: CURRENT_WEEK_KEY,
      });
      expect(r.run.status).toBe(c.status);
      expect(r.run.isStartable).toBe(c.startable);
      expect(r.run.isTerminal).toBe(c.terminal);
      expect(r.run.isCompleted).toBe(c.completed);
      expect(r.run.startUrl !== null).toBe(c.hasStartUrl);
    });
  });

  it("startUrl includes template + scheduledRunId for planned", () => {
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "run" },
        { day: 2, type: "rest" },
        { day: 3, type: "rest" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    const programState = makeProgramState({
      runDays: [
        makeRunDay({
          id: "runday_2026-05-17_1_easy_30",
          date: THIS_MON,
          weekKey: CURRENT_WEEK_KEY,
          dayIndex: 1,
          templateId: "easy_30",
          status: "planned",
        }),
      ],
    });
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(r.run.startUrl).toContain("template=easy_30");
    expect(r.run.startUrl).toContain("scheduledRunId=");
  });
});

describe("resolveTrainingDayForDate — lift index mapping", () => {
  it("maps Mon → workouts[0], Wed → workouts[1] when those are the only lift slots", () => {
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "rest" },
        { day: 3, type: "lift" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    const programState = makeProgramState({
      workouts: [
        makeWorkout({ dayName: "Push" }),
        makeWorkout({ dayName: "Pull" }),
      ],
    });
    const mon = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    const wed = resolveTrainingDayForDate({
      dateKey: "2026-05-20",
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    const tue = resolveTrainingDayForDate({
      dateKey: "2026-05-19",
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(mon.lift.index).toBe(0);
    expect(mon.lift.workout?.dayName).toBe("Push");
    expect(wed.lift.index).toBe(1);
    expect(wed.lift.workout?.dayName).toBe("Pull");
    expect(tue.lift.index).toBeNull();
    expect(tue.lift.status).toBe("none");
  });

  it("surfaces completed / skipped lift status when set", () => {
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "rest" },
        { day: 3, type: "rest" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    const completed = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState: makeProgramState({
        workouts: [makeWorkout({ completed: true })],
      }),
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(completed.lift.status).toBe("completed");
    expect(completed.lift.isTerminal).toBe(true);
    expect(completed.lift.isStartable).toBe(false);

    const skipped = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile,
      programState: makeProgramState({
        workouts: [makeWorkout({ skipped: true })],
      }),
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(skipped.lift.status).toBe("skipped");
    expect(skipped.lift.isTerminal).toBe(true);
  });

  it("returns lift.workout=null when schedule says lift but workouts[] is shorter (plan drift)", () => {
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "lift" },
        { day: 2, type: "rest" },
        { day: 3, type: "lift" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    // Schedule expects 2 lift days, but workouts has only 1
    const programState = makeProgramState({ workouts: [makeWorkout()] });
    const wed = resolveTrainingDayForDate({
      dateKey: "2026-05-20",
      profile,
      programState,
      currentWeekKey: CURRENT_WEEK_KEY,
    });
    expect(wed.lift.index).toBe(1);
    expect(wed.lift.workout).toBeNull();
    expect(wed.lift.status).toBe("none");
  });
});

describe("resolveTrainingDayForDate — schedule synthesis when weekSchedule missing", () => {
  it("uses getWeeklyRunTarget (which defaults to 0, NOT 2) when both target fields are unset", () => {
    const profile = makeProfile({ weeklyWorkoutsTarget: 3 });
    // Sweep all 7 days: none should have a run or both type
    let runSlots = 0;
    for (let i = 0; i < 7; i++) {
      const dateKey = `2026-05-${String(17 + i).padStart(2, "0")}`;
      const r = resolveTrainingDayForDate({
        dateKey,
        profile,
        programState: makeProgramState(),
        currentWeekKey: CURRENT_WEEK_KEY,
      });
      if (r.scheduleType === "run" || r.scheduleType === "both") runSlots++;
    }
    expect(runSlots).toBe(0);
  });
});

describe("resolveTrainingWindow", () => {
  it("returns `days` resolved entries starting at startDate", () => {
    const profile = makeProfile({});
    const programState = makeProgramState();
    const start = new Date(2026, 4, 18); // Mon 2026-05-18 (local)
    const window = resolveTrainingWindow({
      startDate: start,
      days: 7,
      profile,
      programState,
    });
    expect(window).toHaveLength(7);
    expect(window[0].dateKey).toBe("2026-05-18");
    expect(window[6].dateKey).toBe("2026-05-24");
  });

  it("uses one currentWeekKey for every day so a future strip date does not inherit this-week status", () => {
    // Today = Fri 2026-05-22. Strip = [Fri, Sat, Sun, Mon, Tue, Wed, Thu]
    // The Mon in the strip is NEXT week's Mon (2026-05-25).
    const profile = makeProfile({
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "run" },
        { day: 2, type: "rest" },
        { day: 3, type: "rest" },
        { day: 4, type: "rest" },
        { day: 5, type: "rest" },
        { day: 6, type: "rest" },
      ],
    });
    const programState = makeProgramState({
      runDays: [
        // Legacy doc with no date/weekKey, dayIndex=1 (Monday).
        makeRunDay({
          dayIndex: 1,
          date: undefined,
          weekKey: undefined,
          status: "completed_exact",
          completed: true,
        }),
      ],
    });
    const fri = new Date(2026, 4, 22);
    const window = resolveTrainingWindow({
      startDate: fri,
      days: 7,
      profile,
      programState,
    });
    // Find the Mon strip day
    const stripMon = window.find((d) => d.dateKey === "2026-05-25");
    expect(stripMon).toBeDefined();
    // Even though dayIndex matches, target weekKey (next week) does
    // not equal currentWeekKey (this week), so legacy fallback gates
    // out and the next-Mon day has run.runDay=null.
    expect(stripMon!.run.runDay).toBeNull();
    expect(stripMon!.run.status).toBe("none");
    expect(stripMon!.run.isCompleted).toBe(false);
  });
});

describe("resolveTrainingDayForDate — PR-J Q3 chunk B3c (claimMap-derived completion)", () => {
  // The claim map is the single source of truth for `run.isCompleted`
  // when supplied. The helper unifies three completion sources
  // (manual / claimed-saved-run / legacy), so the resolver doesn't
  // care which produced the ✅. When claimMap is omitted, the
  // resolver falls back to legacy `isScheduledRunCompleted(status)`
  // — the back-compat path the rest of this file already covers.

  const PROFILE = makeProfile({
    weekSchedule: [
      { day: 0, type: "rest" },
      { day: 1, type: "run" },
      { day: 2, type: "rest" },
      { day: 3, type: "rest" },
      { day: 4, type: "rest" },
      { day: 5, type: "rest" },
      { day: 6, type: "rest" },
    ],
  });
  const RUN_DAY = makeRunDay({
    id: "runday_b3c_mon",
    date: THIS_MON,
    weekKey: CURRENT_WEEK_KEY,
    dayIndex: 1,
    status: "planned",
  });
  const PROGRAM = makeProgramState({ runDays: [RUN_DAY] });

  it("claimMap with manualCompleted=true surfaces run.isCompleted (status stays planned)", () => {
    const claimMap = new Map([
      [
        RUN_DAY.id!,
        {
          claimedSavedRunId: undefined,
          manualCompleted: true,
          legacyCompleted: false,
        },
      ],
    ]);
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile: PROFILE,
      programState: PROGRAM,
      currentWeekKey: CURRENT_WEEK_KEY,
      claimMap,
    });
    expect(r.run.status).toBe("planned");
    expect(r.run.isCompleted).toBe(true);
  });

  it("claimMap with claimedSavedRunId surfaces run.isCompleted", () => {
    const claimMap = new Map([
      [
        RUN_DAY.id!,
        {
          claimedSavedRunId: "saved-xyz",
          manualCompleted: false,
          legacyCompleted: false,
        },
      ],
    ]);
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile: PROFILE,
      programState: PROGRAM,
      currentWeekKey: CURRENT_WEEK_KEY,
      claimMap,
    });
    expect(r.run.isCompleted).toBe(true);
  });

  it("claimMap with no entry for the runDay → run.isCompleted=false (overrides legacy status)", () => {
    // Even when the runDay carries a legacy `status="completed_exact"`,
    // an empty claim map says "no completion derived" and the
    // resolver respects that. This is the precise semantic that
    // makes the claim map authoritative when supplied.
    const legacyProgram = makeProgramState({
      runDays: [{ ...RUN_DAY, status: "completed_exact", completed: true }],
    });
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile: PROFILE,
      programState: legacyProgram,
      currentWeekKey: CURRENT_WEEK_KEY,
      claimMap: new Map(),
    });
    expect(r.run.isCompleted).toBe(false);
  });

  it("omitting claimMap entirely falls back to legacy status check (back-compat)", () => {
    const legacyProgram = makeProgramState({
      runDays: [{ ...RUN_DAY, status: "completed_exact", completed: true }],
    });
    const r = resolveTrainingDayForDate({
      dateKey: THIS_MON,
      profile: PROFILE,
      programState: legacyProgram,
      currentWeekKey: CURRENT_WEEK_KEY,
      // no claimMap — back-compat path
    });
    expect(r.run.isCompleted).toBe(true);
  });
});
