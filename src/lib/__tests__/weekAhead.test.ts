/**
 * The week ahead the weekly review ends on (App1 Q36): seven days, what the
 * plan holds on each, its counts and the lifts' order, read from the week
 * Home and Train read.
 */
import { describe, expect, it } from "vitest";
import { weekAheadView } from "../weekAhead";
import type { UserProfile } from "../auth";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";

/** Wednesday 28 October 2026; the week is Monday 26 to Sunday 1. */
const TODAY = "2026-10-28";
const WEEK = "2026-10-26";

const lift = (dayName: string, done = false): WorkoutDay => ({
  dayName,
  dayType: "lift",
  completed: done,
  exercises: [],
});

const runDay = (overrides: Partial<ScheduledRunDay>): ScheduledRunDay => ({
  id: "run",
  date: "2026-10-27",
  weekKey: WEEK,
  dayIndex: 2,
  templateId: "easy_30",
  type: "easy",
  status: "planned",
  ...overrides,
});

const BOTH_SCHEDULE: UserProfile["weekSchedule"] = [
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "lift" },
  { day: 4, type: "run" },
  { day: 5, type: "lift" },
  { day: 6, type: "rest" },
  { day: 0, type: "run" },
];

const profile = (overrides: Partial<UserProfile> = {}): UserProfile =>
  ({
    uid: "u1",
    weeklyWorkoutsTarget: 3,
    weeklyRunDaysTarget: 3,
    weekSchedule: BOTH_SCHEDULE,
    ...overrides,
  }) as UserProfile;

const programme = (overrides: Partial<ProgramState> = {}): ProgramState =>
  ({
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 2,
    splitType: "ppl",
    workouts: [lift("Push"), lift("Pull"), lift("Legs")],
    fatigueScore: 0,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    runDays: [
      runDay({ id: "tue", date: "2026-10-27", dayIndex: 2 }),
      runDay({
        id: "thu",
        date: "2026-10-29",
        dayIndex: 4,
        templateId: "tempo_20",
        type: "tempo",
      }),
      runDay({
        id: "sun",
        date: "2026-11-01",
        dayIndex: 0,
        templateId: "long_15k",
        type: "long",
      }),
    ],
    ...overrides,
  }) as ProgramState;

const view = (
  p: UserProfile | null = profile(),
  s: ProgramState | null = programme()
) =>
  weekAheadView({ todayKey: TODAY, profile: p, programState: s, unit: "km" });

describe("weekAheadView", () => {
  it("is the seven days of the week under way, Monday first", () => {
    const v = view();
    expect(v.weekKey).toBe(WEEK);
    expect(v.days.map((d) => d.dateKey)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(v.days.map((d) => [d.past, d.isToday])).toEqual([
      [true, false],
      [true, false],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
      [false, false],
    ]);
  });

  it("says what each day holds: a lift, a named run with its dose, or rest", () => {
    const days = view().days;
    expect(days.map((d) => d.lift)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(days[1].run).toEqual({ name: "Easy 30", dose: "30 min" });
    expect(days[3].run?.name).toBe("20 Min Tempo");
    expect(days[6].run).toEqual({ name: "Long 15K", dose: "15.0 km" });
    expect(days[5]).toMatchObject({ lift: false, run: null });
  });

  it("names a long run in the reader's unit", () => {
    const v = weekAheadView({
      todayKey: TODAY,
      profile: profile(),
      programState: programme(),
      unit: "mi",
    });
    expect(v.days[6].run).toEqual({ name: "Long 9.3 mi", dose: "9.3 mi" });
  });

  it("counts the week as Home does: planned lifts and the plan's runs", () => {
    const v = view();
    expect(v.lifts).toBe(3);
    expect(v.runs).toBe(3);
  });

  /* A race plan keeps its dated run days at the top of the programme
     document. The recap once read them from a field the plan does not
     have, so a race runner's week ahead never showed a run. */
  it("reads the run days the plan holds at the top of its document", () => {
    const v = view(
      profile({
        runMode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2026-12-12" },
      } as Partial<UserProfile>)
    );
    expect(v.runs).toBe(3);
    expect(v.days.filter((d) => d.run).length).toBe(3);
  });

  it("puts a moved run on the date the plan holds it, not its weekday", () => {
    const s = programme({
      runDays: [
        runDay({ id: "tue", date: "2026-10-31", dayIndex: 2 }),
        runDay({ id: "thu", date: "2026-10-29", dayIndex: 4 }),
      ],
    });
    const days = view(profile(), s).days;
    expect(days[1].run).toBeNull();
    expect(days[5].run?.name).toBe("Easy 30");
  });

  it("gives the lifts' order from the next one, never a weekday's name", () => {
    const v = view(
      profile(),
      programme({ workouts: [lift("Push", true), lift("Pull"), lift("Legs")] })
    );
    expect(v.liftOrder).toEqual(["Pull", "Legs"]);
  });

  it("a lift-only week: lifts and rest, no runs counted", () => {
    const v = view(
      profile({
        weeklyRunDaysTarget: 0,
        weekSchedule: [
          { day: 1, type: "lift" },
          { day: 2, type: "rest" },
          { day: 3, type: "lift" },
          { day: 4, type: "rest" },
          { day: 5, type: "lift" },
          { day: 6, type: "rest" },
          { day: 0, type: "rest" },
        ],
      }),
      programme({ runDays: [] })
    );
    expect(v.runs).toBeNull();
    expect(v.lifts).toBe(3);
    expect(v.days.every((d) => d.run === null)).toBe(true);
  });

  it("a run-only week: runs and rest, no lifts or order", () => {
    const v = view(
      profile({
        weeklyWorkoutsTarget: 0,
        weekSchedule: [
          { day: 1, type: "rest" },
          { day: 2, type: "run" },
          { day: 3, type: "rest" },
          { day: 4, type: "run" },
          { day: 5, type: "rest" },
          { day: 6, type: "rest" },
          { day: 0, type: "run" },
        ],
      }),
      programme({ workouts: [] })
    );
    expect(v.lifts).toBeNull();
    expect(v.runs).toBe(3);
    expect(v.liftOrder).toEqual([]);
    expect(v.days.every((d) => !d.lift)).toBe(true);
  });

  it("a free runner's run days are 'Run', with no count to plan against", () => {
    const v = view(profile(), programme({ runDays: [] }));
    expect(v.runs).toBeNull();
    expect(v.days[1].run).toEqual({ name: "Run", dose: null });
  });

  it("a new account's days before it began hold nothing", () => {
    const v = view(
      profile({
        // A server timestamp, as `createdAt` is stored.
        createdAt: {
          toMillis: () => new Date(2026, 9, 28, 8).getTime(),
        },
      } as unknown as Partial<UserProfile>)
    );
    expect(v.days[0]).toMatchObject({ beforeStart: true, lift: false });
    expect(v.days[1]).toMatchObject({ beforeStart: true, run: null });
    expect(v.days[2]).toMatchObject({ beforeStart: false, lift: true });
  });

  it("with no plan read yet, the person's usual week still shows", () => {
    const v = view(profile(), null);
    expect(v.lifts).toBe(3);
    expect(v.days[0].lift).toBe(true);
    expect(v.liftOrder).toEqual([]);
  });

  it("states a race plan's position in Train's words, and nothing for others", () => {
    expect(view().planLine).toBeNull();
    const race = view(
      profile({
        runMode: "race_prep",
        raceGoal: { distance: "half", targetDate: "2027-01-31" },
      } as Partial<UserProfile>),
      programme({
        runPlan: {
          mode: "race_prep",
          currentWeek: 2,
          totalWeeks: 14,
        } as ProgramState["runPlan"],
      })
    );
    expect(race.planLine).toBe("Race prep · Half Marathon · Week 3/14");
  });
});
