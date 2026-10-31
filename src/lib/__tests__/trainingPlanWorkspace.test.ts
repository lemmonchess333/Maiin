import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  buildTrainingPlanWorkspace,
  weekCountLabel,
} from "../trainingPlanWorkspace";
import type { UserProfile } from "../auth";
import type { Workout } from "../savedWorkouts";
import type { SavedRun } from "../savedRuns";
import type { ClaimState } from "../scheduledRunCompletion";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";

const lift = (dayName: string, completed = false): WorkoutDay => ({
  dayName,
  dayType: "lift",
  completed,
  exercises: [],
});

const runDay = (overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay => ({
  id: "tempo-thu",
  date: "2026-10-29",
  weekKey: "2026-10-26",
  dayIndex: 4,
  templateId: "tempo_20",
  type: "tempo",
  status: "planned",
  ...overrides,
});

const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    uid: "u1",
    displayName: "Example",
    weeklyWorkoutsTarget: 3,
    weeklyRunDaysTarget: 2,
    weekSchedule: [
      { day: 1, type: "lift" },
      { day: 2, type: "run" },
      { day: 3, type: "lift" },
      { day: 4, type: "run" },
      { day: 5, type: "lift" },
      { day: 6, type: "rest" },
      { day: 0, type: "rest" },
    ],
    ...overrides,
  }) as UserProfile;

const programme = (overrides: Partial<ProgramState> = {}): ProgramState =>
  ({
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "upper_lower",
    workouts: [lift("Upper A"), lift("Lower A"), lift("Upper B")],
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    runDays: [
      runDay({
        id: "easy-tue",
        date: "2026-10-27",
        dayIndex: 2,
        type: "easy",
        templateId: "easy_30",
      }),
      runDay(),
    ],
    ...overrides,
  }) as ProgramState;

const workout = (id: string, date: string, notes: string): Workout => ({
  id,
  date,
  notes,
  exercises: [],
  durationMinutes: 42,
  totalCalories: 0,
  createdAt: Timestamp.fromDate(new Date(2026, 9, 28)),
});

const savedRun = (overrides: Partial<SavedRun> = {}): SavedRun => ({
  id: "saved-run",
  day: "2026-10-29",
  distance: 5000,
  duration: 1800,
  avgPace: 360,
  elevationGain: 0,
  calories: 0,
  activityType: "tempo",
  completedAt: new Date(2026, 9, 29),
  relativeEffort: null,
  savedAtSeconds: 0,
  ...overrides,
});

const claim = (overrides: Partial<ClaimState> = {}): ClaimState => ({
  manualCompleted: false,
  legacyCompleted: false,
  ...overrides,
});

const build = (
  overrides: Partial<Parameters<typeof buildTrainingPlanWorkspace>[0]> = {}
) =>
  buildTrainingPlanWorkspace({
    todayKey: "2026-10-28",
    profile: profile(),
    programState: programme(),
    workouts: [],
    runs: [],
    claimMap: new Map(),
    ...overrides,
  });

describe("training plan workspace", () => {
  it("keeps lift rotation identity separate from planned weekdays", () => {
    const result = build({
      programState: programme({
        workouts: [lift("Upper A", true), lift("Lower A"), lift("Upper B")],
      }),
      workouts: [workout("w1", "2026-10-28", "Upper A — Programme Week 1")],
    });
    expect(result.weekKey).toBe("2026-10-26");
    expect(result.days.map((d) => d.dayIndex)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(result.nextLift?.dayName).toBe("Lower A");
    expect(result.nextLiftIndex).toBe(1);
    expect(result.days[0].activities).toMatchObject([
      { title: "Lift day", completed: false },
    ]);
    expect(result.days[2].activities).toMatchObject([
      { title: "Upper A", completed: true, href: "/workout/w1" },
    ]);
    expect(result.days[4].activities).toMatchObject([
      { title: "Lift day", completed: false },
    ]);
  });

  it("honours Make this next without assigning that identity to a date", () => {
    const result = build({
      programState: programme({ nextWorkoutOverride: 2 }),
    });
    expect(result.nextLiftIndex).toBe(2);
    expect(result.nextLift?.dayName).toBe("Upper B");
    expect(result.days[2].activities[0].title).toBe("Lift day");
  });

  it("does not fabricate a dated completion from a completed rotation flag", () => {
    const result = build({
      programState: programme({ workouts: [lift("Upper A", true)] }),
    });
    expect(
      result.days.flatMap((d) => d.activities).filter((a) => a.completed)
    ).toEqual([]);
  });

  it("keeps Both-day totals independent and extra sessions on their actual date", () => {
    const configured = profile();
    configured.weekSchedule = configured.weekSchedule!.map((d) =>
      d.day === 4 ? { ...d, type: "both" } : d
    );
    const result = build({
      profile: configured,
      workouts: [workout("extra", "2026-10-31", "Extra lift")],
    });
    expect(result.days[3].activities.map((a) => a.kind)).toEqual([
      "lift",
      "run",
    ]);
    expect(result.summary).toEqual({
      lifts: { done: 1, planned: 4 },
      runs: { done: 0, planned: 2 },
      restDays: 1,
    });
    expect(result.days[5].activities[0].title).toBe("Extra lift");
  });

  it("shows a moved run only on its instance date, leaving its old date empty", () => {
    const moved = runDay({
      date: "2026-10-31",
      dayIndex: 6,
      movedFromDate: "2026-10-29",
      movedToDate: "2026-10-31",
    });
    const result = build({ programState: programme({ runDays: [moved] }) });
    expect(result.days[3].isEmpty).toBe(true);
    expect(result.days[5].activities[0].runDay?.id).toBe(moved.id);
    expect(result.summary.runs.planned).toBe(1);
  });

  it("renders a claimed saved run once and suppresses its move action", () => {
    const result = build({
      runs: [savedRun()],
      claimMap: new Map([
        ["tempo-thu", claim({ claimedSavedRunId: "saved-run" })],
      ]),
    });
    expect(result.days[3].activities).toHaveLength(1);
    expect(result.days[3].activities[0]).toMatchObject({
      completed: true,
      canMove: false,
      href: "/run/saved-run",
    });
  });

  it("shows a run done a day late once, on its planned date, as Home does", () => {
    const result = build({
      todayKey: "2026-10-31",
      runs: [savedRun({ day: "2026-10-30" })],
      claimMap: new Map([
        ["tempo-thu", claim({ claimedSavedRunId: "saved-run" })],
      ]),
    });
    expect(result.days[3].activities).toMatchObject([
      { kind: "run", completed: true, href: "/run/saved-run" },
    ]);
    expect(result.days[3].activities[0].meta).toMatch(/^Done Fri\b/);
    expect(result.days[4].activities.filter((a) => a.kind === "run")).toEqual(
      []
    );
    expect(
      result.days
        .flatMap((d) => d.activities)
        .filter((a) => a.href === "/run/saved-run")
    ).toHaveLength(1);
    // Thursday held a run: it is not also a rest day.
    expect(result.days[3].isEmpty).toBe(false);
    expect(result.summary.runs).toEqual({ done: 1, planned: 2 });
  });

  it("reads past days as done, missed or settled, never as planned", () => {
    const result = build({
      todayKey: "2026-10-30",
      programState: programme({
        // Monday's slot was done on Tuesday; Wednesday's never was.
        workouts: [lift("Upper A", true), lift("Lower A"), lift("Upper B")],
      }),
      workouts: [workout("w1", "2026-10-27", "Upper A — Programme Week 1")],
    });
    const meta = (i: number) => result.days[i].activities.map((a) => a.meta);
    expect(meta(0)).toEqual(["Done on another day"]);
    expect(meta(2)).toEqual(["Missed"]);
    // Tuesday's easy run and Thursday's tempo were never run.
    expect(meta(1).some((m) => m.startsWith("Missed"))).toBe(true);
    expect(meta(3).some((m) => m.startsWith("Missed"))).toBe(true);
    // Today and ahead are still planned.
    expect(meta(4)).toEqual(["Planned · follows your rotation"]);
    for (const day of result.days)
      for (const activity of day.activities)
        if (day.dateKey < "2026-10-30")
          expect(activity.meta).not.toMatch(/Planned/);
  });

  it("writes the week's counts done against planned", () => {
    expect(weekCountLabel("Lifts", { done: 1, planned: 3 })).toBe(
      "Lifts 1 of 3"
    );
    expect(weekCountLabel("Runs", { done: 2, planned: null })).toBe("Runs 2");
    expect(weekCountLabel("Runs", { done: 0, planned: null })).toBeNull();
  });

  it("counts the week as Home and the review do", () => {
    const result = build({
      todayKey: "2026-10-30",
      workouts: [workout("w1", "2026-10-26", "Upper A — Programme Week 1")],
      runs: [savedRun({ id: "easy", day: "2026-10-27" })],
      claimMap: new Map([["easy-tue", claim({ claimedSavedRunId: "easy" })]]),
    });
    expect(result.summary.lifts).toEqual({ done: 1, planned: 3 });
    expect(result.summary.runs).toEqual({ done: 1, planned: 2 });
  });

  it("distinguishes manual completion without a saved run", () => {
    const result = build({
      claimMap: new Map([["tempo-thu", claim({ manualCompleted: true })]]),
    });
    expect(result.days[3].activities[0]).toMatchObject({
      completed: true,
      canMove: false,
    });
    expect(result.days[3].activities[0].meta).toContain("Marked complete");
  });

  it("keeps invalid extra records visible without claiming counted completion", () => {
    const result = build({
      runs: [savedRun({ id: "invalid", day: "2026-10-31", savedAnyway: true })],
    });
    expect(result.days[5].activities[0]).toMatchObject({
      completed: false,
      canMove: false,
      href: "/run/invalid",
    });
    expect(result.days[5].activities[0].meta).toContain("Not counted");
  });

  it("does not invent run sessions for freeform or empty accounts", () => {
    const result = build({ programState: programme({ runDays: [] }) });
    expect(result.summary.runs.planned).toBeNull();
    expect(
      result.days.flatMap((d) => d.activities).filter((a) => a.kind === "run")
    ).toEqual([]);
    const empty = build({
      profile: profile({
        weeklyWorkoutsTarget: 0,
        weeklyRunDaysTarget: 0,
        weekSchedule: undefined,
      }),
      programState: programme({ workouts: [], runDays: [] }),
    });
    expect(empty.nextLift).toBeNull();
    expect(empty.summary).toEqual({
      lifts: { done: 0, planned: null },
      runs: { done: 0, planned: null },
      restDays: 7,
    });
  });

  it("does not project pre-account dates as missed sessions or rest days", () => {
    const result = build({
      profile: profile({
        createdAt: Timestamp.fromDate(new Date(2026, 9, 30)),
      }),
    });
    expect(
      result.days
        .slice(0, 4)
        .every(
          (d) => d.beforeStart && !d.plannedLift && d.activities.length === 0
        )
    ).toBe(true);
    expect(result.summary.lifts.planned).toBe(1);
    expect(result.summary.runs.planned).toBeNull();
    expect(result.summary.restDays).toBe(2);
  });

  it("uses the local Monday window across month boundaries and doesn't borrow old runs", () => {
    const result = build({ todayKey: "2026-11-02" });
    expect(result.days.map((d) => d.dateKey)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(result.summary.runs.planned).toBeNull();
  });

  it("uses preferred distance units for actual saved runs", () => {
    const result = build({
      profile: profile({ preferredDistanceUnit: "mi" }),
      runs: [savedRun({ day: "2026-10-31" })],
    });
    expect(result.days[5].activities[0].meta).toContain("3.1 mi");
  });

  it("converts the distance and title of a planned long run to the preferred unit", () => {
    const result = build({
      profile: profile({ preferredDistanceUnit: "mi" }),
      programState: programme({
        runDays: [runDay({ templateId: "long_6k", type: "long" })],
      }),
    });
    expect(result.days[3].activities[0].title).toContain("3.7 mi");
    expect(result.days[3].activities[0].meta).toContain("3.7 mi");
    expect(result.days[3].activities[0].meta).not.toContain("km");
  });

  it("only exposes a move source for stable, uncompleted non-race instances", () => {
    expect(build().days[3].activities[0].canMove).toBe(true);
    for (const overrides of [
      { id: undefined },
      { status: "skipped" as const },
      { type: "race", templateId: "5k_race" },
    ]) {
      const result = build({
        programState: programme({ runDays: [runDay(overrides)] }),
      });
      expect(result.days[3].activities[0].canMove).toBe(false);
    }
  });
});
