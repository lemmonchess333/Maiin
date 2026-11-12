/**
 * The race's final weeks on the week a plan is made or a race is added
 * (Lift4 (10); training deep dive, hybrid-week defect 4). Only the rollover
 * applied them, so a race added 6, 13 or 20 days out left the week's
 * lifting whole: squats 4 × 3 three days before a 10K, and a full week
 * after it. The week the race is added in is now the race's: its days
 * still to do lighter, race week's one short session, and the week after
 * lighter too.
 *
 * Dates are fixed: `buildPlan` takes its day as `currentDate`.
 */
import { describe, expect, it } from "vitest";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { advanceWeek } from "../programEngine";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import type { ProgramState, WorkoutDay } from "../programTypes";
import { raceBlockWeek } from "../weekPrescription";

/** The week of Monday 11 May 2026. */
const MONDAY = "2026-05-11";
const TUESDAY = "2026-05-12";
/** Lifts Monday, Thursday and Friday; runs Tuesday, Wednesday and Saturday
 *  (day 0 is Sunday). */
const SCHEDULE: ScheduleDay[] = [
  { day: 0, type: "rest" },
  { day: 1, type: "lift" },
  { day: 2, type: "run" },
  { day: 3, type: "run" },
  { day: 4, type: "lift" },
  { day: 5, type: "lift" },
  { day: 6, type: "run" },
];

const lifting: PlanBuilderInput = {
  primaryGoal: "strength",
  nutritionPhase: "recomp",
  experience: "intermediate",
  bodyweightKg: 80,
  sex: "male",
  liftDays: 3,
  preferredSplit: "full_body",
  runMode: "freeform",
  weeklyRunDays: 0,
  equipment: "full_gym",
  injuries: [],
  weekSchedule: SCHEDULE,
  sessionMinutes: 60,
  currentDate: MONDAY,
};

/** Monday's plan, with Monday's lift done. */
function mondayDone(): ProgramState {
  const state = buildPlan(lifting).programState;
  return {
    ...state,
    workouts: state.workouts.map((day, i) =>
      i === 0 ? { ...day, completed: true } : day
    ),
  };
}

/** Monday's plan, made once: each build gives its lifts new slots. */
const MONDAY_PLAN = mondayDone();

/** A 10K on `targetDate` added on Tuesday to the plan Monday made. */
function raceAdded(targetDate: string): ProgramState {
  return buildPlan({
    ...lifting,
    runMode: "race_prep",
    weeklyRunDays: 3,
    raceGoal: { distance: "10k", targetDate },
    currentDate: TUESDAY,
    existingState: MONDAY_PLAN,
    preserveHistory: true,
  }).programState;
}

const setsOf = (day: WorkoutDay) => day.exercises.map((ex) => ex.sets);
const baseOf = (day: WorkoutDay) =>
  day.exercises.map((ex) => ex.baseSets ?? ex.sets);
const half = (n: number) => Math.max(1, Math.ceil(n / 2));

describe("a race added in its own week", () => {
  // Sunday 17 May, five days out.
  const state = raceAdded("2026-05-17");

  it("makes the week race week", () => {
    expect(raceBlockWeek(state.runPlan)).not.toBeNull();
    expect(state.raceWeek).toBe("race");
    expect(state.currentPhase).toBe("deload");
  });

  it("keeps the lift done, and gives one short session of the days left", () => {
    const [done, next, last] = state.workouts;
    expect(done.completed).toBe(true);
    expect(setsOf(done)).toEqual(setsOf(MONDAY_PLAN.workouts[0]));
    expect(next.skipped).not.toBe(true);
    expect(setsOf(next)).toEqual(baseOf(next).map(half));
    expect(last.skipped).toBe(true);
  });

  it("puts nothing heavy on the legs in that session", () => {
    const before = MONDAY_PLAN.workouts[1].exercises;
    const legs = state.workouts[1].exercises.filter(
      (ex) => ex.preDeloadWeight !== undefined
    );
    expect(legs.length).toBeGreaterThan(0);
    for (const ex of legs) {
      const was = before.find((b) => b.instanceId === ex.instanceId)!;
      expect(ex.weight).toBeLessThan(was.weight);
      expect(ex.preDeloadWeight).toBe(was.weight);
    }
  });

  it("makes the week after it lighter too, and the one after that whole", () => {
    const finished: ProgramState = {
      ...state,
      workouts: state.workouts.map((day) => ({ ...day, completed: true })),
    };
    const after = advanceWeek(finished, "intermediate", "2026-05-18", null);
    expect(after.raceWeek).toBe("after");
    expect(after.currentPhase).toBe("deload");
    for (const day of after.workouts)
      expect(setsOf(day)).toEqual(baseOf(day).map(half));
    const whole = advanceWeek(
      {
        ...after,
        workouts: after.workouts.map((day) => ({ ...day, completed: true })),
      },
      "intermediate",
      "2026-05-25",
      null
    );
    expect(whole.raceWeek).toBeUndefined();
    for (const day of whole.workouts) expect(setsOf(day)).toEqual(baseOf(day));
  });
});

describe("a race added one or two weeks out", () => {
  it.each([
    ["2026-05-24", 12],
    ["2026-05-31", 19],
  ])("makes the week a lighter one, for a race on %s (%i days out)", (date) => {
    const state = raceAdded(date);
    expect(state.raceWeek).toBe("taper");
    expect(state.currentPhase).toBe("deload");
    const [done, ...left] = state.workouts;
    expect(setsOf(done)).toEqual(setsOf(MONDAY_PLAN.workouts[0]));
    for (const day of left) {
      expect(day.skipped).not.toBe(true);
      expect(setsOf(day)).toEqual(baseOf(day).map(half));
    }
  });
});

describe("a race added further out", () => {
  it("leaves the week as it was", () => {
    const state = raceAdded("2026-06-28");
    expect(state.raceWeek).toBeUndefined();
    expect(state.currentPhase).toBe("progression");
    for (const day of state.workouts) expect(setsOf(day)).toEqual(baseOf(day));
  });
});

describe("a first plan made late in the week", () => {
  // Friday 15 May: the lifts' first week runs on to Sunday 24 May
  // (`firstLiftWeekKey`), and the runs start on Monday 18 May.
  const made = (targetDate: string) =>
    buildPlan({
      ...lifting,
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceGoal: { distance: "10k", targetDate },
      currentDate: "2026-05-15",
    }).programState;

  it("reads the race from the week its lifts are in", () => {
    // Sunday 24 May closes the lifts' first week: it is race week.
    expect(made("2026-05-24").raceWeek).toBe("race");
    // Sunday 31 May is a week later: the first week is a lighter one.
    expect(made("2026-05-31").raceWeek).toBe("taper");
    // Five weeks out, nothing changes.
    expect(made("2026-06-21").raceWeek).toBeUndefined();
  });
});
