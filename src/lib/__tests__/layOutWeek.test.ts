import { describe, expect, it } from "vitest";
import {
  layOutWeek,
  type LayOutWeekInput,
  type LayoutLift,
  type LayoutRun,
  type WeekLayout,
} from "../layOutWeek";
import { todaySession } from "../todaySession";
import { trainingWeek, weekDays } from "../trainingWeek";
import { claimableRuns, claimMapFor } from "../runClaims";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import type { UserProfile } from "../auth";
import type { SavedRun } from "../savedRuns";
import { advanceWeek } from "@/features/program/programEngine";
import type {
  ProgramState,
  ScheduledRunDay,
  WorkoutDay,
} from "@/features/program/programTypes";

/**
 * The week laid out (TrainWk1 step 1). The module reads no clock: every
 * case passes its own day. The week is still taken from the clock, so
 * each run of the suite lays out the week its clock is in (ninety days on,
 * or in Auckland or Kiritimati, in CI's runs), and no literal date has to
 * sit inside a window.
 */
const WEEK = localWeekKey(new Date());
const [MON, TUE, WED, THU, FRI, SAT, SUN] = weekDays(WEEK);
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
const LAST_WEEK = shift(WEEK, -7);
const NEXT_WEEK = shift(WEEK, 7);

type Kind = "lift" | "run" | "both" | "rest";
/** A usual weekly layout, Sunday first, as `weekSchedule` stores it. */
const layoutOf = (...kinds: Kind[]) =>
  kinds.map((type, day) => ({ day, type }));
/** Lifts Monday, Wednesday and Friday; runs Tuesday and Thursday. */
const MWF = layoutOf("rest", "lift", "run", "lift", "run", "lift", "rest");

/** A profile's `createdAt` as Firestore returns it: noon on that day. */
const createdOn = (date: string) => ({
  toMillis: () => parseLocalDate(date).getTime() + 12 * 3_600_000,
});

function profile(extra: Record<string, unknown> = {}): UserProfile {
  return {
    uid: "u1",
    weekSchedule: MWF,
    createdAt: createdOn(shift(MON, -60)),
    primaryGoal: "general",
    ...extra,
  } as unknown as UserProfile;
}

/** A plan session. A leg day loads the legs (`isLowerBodyDay`). */
function session(
  dayName: string,
  extra: Partial<WorkoutDay> = {},
  legs = false
): WorkoutDay {
  return {
    dayName,
    dayType: "full",
    exercises: [
      {
        exerciseId: legs ? "squat" : "bench-press",
        name: legs ? "Squat" : "Bench press",
        movementCategory: legs ? "knee_dominant" : "horizontal_push",
        sets: 3,
        reps: 8,
        weight: 60,
      },
    ],
    completed: false,
    ...extra,
  } as WorkoutDay;
}

const A = session("Full Body A");
const B = session("Full Body B");
const C = session("Full Body C");
/** Done, its saved session `w-<date>`. */
const doneOn = (s: WorkoutDay, date: string): WorkoutDay => ({
  ...s,
  completed: true,
  completedWorkoutId: `w-${date}`,
});
const saved = (date: string, id = `w-${date}`) => ({ id, date });

function plan(
  workouts: WorkoutDay[],
  extra: Partial<ProgramState> = {}
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 3,
    splitType: "full_body",
    workouts,
    updatedAt: 0,
    settings: { autoProgression: true, smallPlates: false },
    weekHistory: [],
    runDays: [],
    liftWeekKey: WEEK,
    ...extra,
  } as unknown as ProgramState;
}

function runDay(
  date: string,
  extra: Partial<ScheduledRunDay> = {}
): ScheduledRunDay {
  return {
    id: `rd-${date}`,
    dayIndex: parseLocalDate(date).getDay(),
    date,
    weekKey: localWeekKey(parseLocalDate(date)),
    templateId: "easy_30",
    type: "easy",
    status: "planned",
    ...extra,
  } as ScheduledRunDay;
}

function savedRun(date: string, extra: Partial<SavedRun> = {}): SavedRun {
  return {
    id: `run-${date}`,
    day: date,
    date,
    distance: 5000,
    duration: 1800,
    avgPace: 360,
    activityType: "outdoor",
    savedAtSeconds: parseLocalDate(date).getTime() / 1000 + 43_200,
    ...extra,
  } as unknown as SavedRun;
}

/** The week as `today` reads it, the claim map built from the runs as
 *  Home builds it (`claimMapFor`). */
function week(extra: Partial<LayOutWeekInput> = {}): WeekLayout {
  const base: LayOutWeekInput = {
    weekKey: WEEK,
    today: MON,
    profile: profile(),
    programState: plan([A, B, C]),
    workouts: [],
    runs: [],
    claimMap: new Map(),
    ...extra,
  };
  const state = base.programState;
  return layOutWeek({
    ...base,
    claimMap:
      extra.claimMap ??
      claimMapFor(
        state?.runDays ?? [],
        claimableRuns(base.runs as SavedRun[]),
        state?.manualCompletions ?? {},
        base.today
      ),
  });
}

const dayOf = (w: WeekLayout, date: string) =>
  w.days.find((d) => d.date === date)!;
const liftsOn = (w: WeekLayout, date: string) =>
  dayOf(w, date).sessions.filter((s): s is LayoutLift => s.sport === "lift");
const runsOn = (w: WeekLayout, date: string) =>
  dayOf(w, date).sessions.filter((s): s is LayoutRun => s.sport === "run");
/** Each day's lifts, by name and state: "A today", "saved w-… done". */
const lifts = (w: WeekLayout) =>
  Object.fromEntries(
    w.days.map((d) => [
      d.date,
      liftsOn(w, d.date).map(
        (l) =>
          `${l.workout?.dayName.slice(-1) ?? `saved ${l.savedId ?? ""}`} ${l.state}`
      ),
    ])
  );
const names = (ls: readonly LayoutLift[]) =>
  ls.map((l) => l.workout?.dayName.slice(-1));
/** Every plan lift's index, wherever the layout holds it. */
const planIndices = (w: WeekLayout) =>
  w.entries
    .filter((s): s is LayoutLift => s.sport === "lift" && s.plan)
    .map((l) => l.index)
    .sort((a, b) => (a ?? 0) - (b ?? 0));

describe("lifts on days", () => {
  it("lays the week's lifts on its lift days in order, with nothing done", () => {
    const w = week();
    expect(lifts(w)).toEqual({
      [MON]: ["A today"],
      [TUE]: [],
      [WED]: ["B planned"],
      [THU]: [],
      [FRI]: ["C planned"],
      [SAT]: [],
      [SUN]: [],
    });
    expect(w.next?.workout).toBe(A);
    expect(liftsOn(w, MON)[0]).toMatchObject({
      index: 0,
      plannedOn: MON,
      movedFrom: null,
      isNext: true,
    });
    expect(w.stillToDo).toEqual([]);
    expect(w.freeLiftDays).toEqual([MON, WED, FRI]);
  });

  it("slides a lift whose day passed to the next lift day, never missed", () => {
    // Nothing on Monday; Tuesday reads the week.
    const w = week({ today: TUE });
    expect(lifts(w)).toMatchObject({
      [MON]: [],
      [WED]: ["A planned"],
      [FRI]: ["B planned"],
    });
    expect(liftsOn(w, WED)[0].movedFrom).toBe(MON);
    expect(liftsOn(w, FRI)[0].movedFrom).toBe(WED);
    // More lifts than lift days left: C waits, in order, on no rest day.
    expect(names(w.stillToDo)).toEqual(["C"]);
    expect(w.stillToDo[0]).toMatchObject({
      group: "still-to-do",
      state: "still-to-do",
      plannedOn: FRI,
      movedFrom: null,
    });
    const states = w.entries.map((s) => s.state);
    expect(states).not.toContain("missed");
    // Monday says where its lift went (the prototype's 5).
    expect(dayOf(w, MON)).toMatchObject({ rest: "moved" });
    expect(dayOf(w, MON).slidOut.map((s) => [s.lift.index, s.to])).toEqual([
      [0, WED],
    ]);
  });

  it("keeps a lift done on the day its session was saved, and lays the rest from today", () => {
    const w = week({
      today: WED,
      programState: plan([doneOn(A, MON), B, C]),
      workouts: [saved(MON)],
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["A done"],
      [WED]: ["B today"],
      [FRI]: ["C planned"],
    });
    expect(liftsOn(w, MON)[0].savedId).toBe(`w-${MON}`);
    expect(w.next?.workout).toBe(B);
    expect(dayOf(w, MON).lanes.lift).toBe("done");
    expect(dayOf(w, FRI).lanes.lift).toBe("planned");
  });

  it("brings the rest forward when one is done early, on a rest day, and says so", () => {
    // A on Monday, B on Tuesday from Train: C is next on Wednesday's lift
    // day, as Home's card offers it there (the prototype's 3 and 4).
    const w = week({
      today: TUE,
      programState: plan([doneOn(A, MON), doneOn(B, TUE), C]),
      workouts: [saved(MON), saved(TUE)],
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["A done"],
      [TUE]: ["B done"],
      [WED]: ["C planned"],
      [FRI]: [],
    });
    expect(liftsOn(w, WED)[0]).toMatchObject({
      plannedOn: FRI,
      movedFrom: FRI,
    });
    expect(dayOf(w, FRI).rest).toBe("rest");
  });

  it("follows Make this next, and says where each lift moved from", () => {
    const w = week({
      programState: plan([A, B, C], { nextWorkoutOverride: 2 }),
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["C today"],
      [WED]: ["A planned"],
      [FRI]: ["B planned"],
    });
    expect(liftsOn(w, MON)[0].movedFrom).toBe(FRI);
    expect(liftsOn(w, WED)[0].movedFrom).toBe(MON);
    expect(liftsOn(w, FRI)[0].movedFrom).toBe(WED);
    expect(w.next?.workout).toBe(C);
  });

  it("takes a skipped lift off the days, into its own group", () => {
    const w = week({
      today: TUE,
      programState: plan([A, { ...B, skipped: true }, C]),
    });
    expect(lifts(w)).toMatchObject({
      [WED]: ["A planned"],
      [FRI]: ["C planned"],
    });
    expect(names(w.skipped)).toEqual(["B"]);
    expect(w.skipped[0]).toMatchObject({ group: "skipped", plannedOn: WED });
    expect(w.raceRest).toEqual([]);
  });

  it("holds every lift once: on a day, still to do, skipped or done off the week", () => {
    const programState = plan([
      doneOn(A, MON),
      { ...B, skipped: true },
      C,
      session("Full Body D"),
      doneOn(session("Full Body E"), LAST_WEEK),
    ]);
    const w = week({
      today: FRI,
      programState,
      workouts: [saved(MON), saved(LAST_WEEK)],
    });
    expect(planIndices(w)).toEqual([0, 1, 2, 3, 4]);
    expect(lifts(w)[FRI]).toEqual(["C today"]);
    expect(names(w.stillToDo)).toEqual(["D"]);
    expect(names(w.doneOffWeek)).toEqual(["E"]);
    expect(w.liftsDone).toBe(false);
  });

  it("offers Start next week once every lift is done, not skipped", () => {
    const allDone = week({
      today: WED,
      programState: plan([doneOn(A, MON), doneOn(B, TUE), doneOn(C, WED)]),
      workouts: [saved(MON), saved(TUE), saved(WED)],
    });
    expect(allDone.liftsDone).toBe(true);
    expect(allDone.next).toBeNull();
    expect(lifts(allDone)[FRI]).toEqual([]);
    const oneSkipped = week({
      today: WED,
      programState: plan([
        doneOn(A, MON),
        doneOn(B, TUE),
        { ...C, skipped: true },
      ]),
      workouts: [saved(MON), saved(TUE)],
    });
    expect(oneSkipped.liftsDone).toBe(false);
  });

  it("holds today for a lift under way, and the rest go round it", () => {
    const w = week({
      today: WED,
      programState: plan([doneOn(A, MON), B, C]),
      workouts: [saved(MON)],
      inProgress: [{ sport: "lift", index: 2 }],
    });
    expect(lifts(w)).toMatchObject({
      [WED]: ["C in-progress"],
      [FRI]: ["B planned"],
    });
    expect(w.next?.workout).toBe(C);
    expect(dayOf(w, WED).lanes.lift).toBe("active");
    expect(planIndices(w)).toEqual([0, 1, 2]);
  });
});

describe("the day after today", () => {
  it("names the next session when today holds nothing to do", () => {
    // Tuesday is a run day with its run done; Wednesday's lift is next.
    const w = week({
      today: TUE,
      programState: plan([doneOn(A, MON), B, C], {
        runDays: [runDay(TUE), runDay(THU)],
      }),
      workouts: [saved(MON)],
      runs: [savedRun(TUE)],
    });
    expect(w.nextSession).toMatchObject({ sport: "lift", index: 1 });
  });

  it("names none while today has something to do", () => {
    expect(week().nextSession).toBeNull();
  });
});

describe("a session outside the plan", () => {
  it("sits on its day after the plan's, and leaves the lift day to the plan's lift", () => {
    const w = week({
      workouts: [saved(MON, "empty-1"), saved(SAT, "routine-1")],
    });
    expect(lifts(w)[MON]).toEqual(["A today", "saved empty-1 done"]);
    expect(lifts(w)[SAT]).toEqual(["saved routine-1 done"]);
    expect(liftsOn(w, MON)[1]).toMatchObject({ plan: false, index: null });
    expect(w.count.lifts.done).toBe(2);
  });

  it("is a free run on the day it was run", () => {
    const w = week({
      today: WED,
      runs: [savedRun(shift(MON, -2)), savedRun(MON)],
    });
    expect(runsOn(w, MON)).toEqual([
      expect.objectContaining({ plan: false, state: "done", counts: true }),
    ]);
    expect(w.entries.filter((s) => s.sport === "run")).toHaveLength(1);
  });

  it("shows a run saved anyway, counted in no total", () => {
    const w = week({
      today: WED,
      runs: [savedRun(MON, { savedAnyway: true } as Partial<SavedRun>)],
    });
    expect(runsOn(w, MON)[0].counts).toBe(false);
    expect(w.count.runs.done).toBe(0);
  });

  it("holds today while one is under way", () => {
    const w = week({
      today: TUE,
      inProgress: [
        { sport: "lift", index: null },
        { sport: "run", runDayId: null },
      ],
    });
    expect(
      dayOf(w, TUE).sessions.map((s) => [s.sport, s.plan, s.state])
    ).toEqual([
      ["lift", false, "in-progress"],
      ["run", false, "in-progress"],
    ]);
  });
});

describe("runs keep their dates", () => {
  const runs = [runDay(TUE), runDay(THU)];

  it("calls a run missed once its day has passed, and leaves it there", () => {
    const w = week({
      today: WED,
      programState: plan([A, B, C], { runDays: runs }),
    });
    expect(runsOn(w, TUE)).toEqual([
      expect.objectContaining({ state: "missed", runDay: runs[0] }),
    ]);
    expect(dayOf(w, TUE).lanes.run).toBe("missed");
    expect(runsOn(w, THU)[0].state).toBe("planned");
    const thursday = week({
      today: THU,
      programState: plan([A, B, C], { runDays: runs }),
    });
    expect(runsOn(thursday, THU)[0].state).toBe("today");
  });

  it("marks one done by the run that filled it, a day late included, and shows that run once", () => {
    const w = week({
      today: FRI,
      programState: plan([A, B, C], { runDays: runs }),
      runs: [savedRun(WED)],
    });
    expect(runsOn(w, TUE)[0]).toMatchObject({
      state: "done",
      savedRunId: `run-${WED}`,
      doneOn: WED,
    });
    expect(runsOn(w, WED)).toEqual([]);
    expect(runsOn(w, THU)[0].state).toBe("missed");
    expect(w.count.runs.done).toBe(1);
  });

  it("names a run skipped, a race not recorded, one under way, and where a moved run came from", () => {
    const w = week({
      today: SAT,
      programState: plan([A, B, C], {
        runDays: [
          runDay(TUE, { status: "skipped" }),
          runDay(THU, { movedFromDate: WED }),
          runDay(FRI, {
            templateId: "10k_race",
            type: "race",
            status: "race_no_show",
          }),
          runDay(SAT),
        ],
      }),
      inProgress: [{ sport: "run", runDayId: `rd-${SAT}` }],
    });
    expect(runsOn(w, TUE)[0].state).toBe("skipped");
    expect(runsOn(w, THU)[0]).toMatchObject({
      state: "missed",
      movedFrom: WED,
    });
    expect(runsOn(w, FRI)[0].state).toBe("not-recorded");
    expect(runsOn(w, SAT)[0].state).toBe("in-progress");
    expect(dayOf(w, SAT).lanes.run).toBe("active");
  });

  it("plans the runs the count plans, and keeps one dated before the start out of the days", () => {
    const w = week({
      today: WED,
      profile: profile({ createdAt: createdOn(WED) }),
      programState: plan([A, B, C], { runDays: runs }),
    });
    expect(w.count.runs.planned).toBe(1);
    expect(runsOn(w, TUE)).toEqual([]);
    expect(
      w.entries.find((s) => s.sport === "run" && s.date === TUE)
    ).toMatchObject({ group: "before-start", state: "before-start" });
  });
});

describe("a day with a lift and a run", () => {
  /** Lifts Monday to Saturday with a run on Wednesday and Saturday. */
  const DOUBLES = layoutOf(
    "rest",
    "lift",
    "lift",
    "both",
    "lift",
    "lift",
    "both"
  );
  const six = [A, B, C, session("D"), session("E"), session("F", {}, true)];

  it("holds both, the lift first, or the run first when running is the aim (Home's order)", () => {
    for (const primaryGoal of ["general", "running"]) {
      const p = profile({ weekSchedule: DOUBLES, primaryGoal });
      const programState = plan(six, { runDays: [runDay(WED)] });
      const w = week({ profile: p, programState });
      const order = dayOf(w, WED).sessions.map((s) => s.sport);
      const home = todaySession({
        today: WED,
        profile: p,
        programState,
        claimMap: new Map(),
        workouts: [],
        week: w,
        createdAtMs: 0,
        nowMs: parseLocalDate(WED).getTime(),
        lifetimeRuns: 3,
        lifetimeMeals: 3,
      });
      expect(w.runFirst).toBe(home.runFirst === true);
      expect(order).toEqual(
        primaryGoal === "running" ? ["run", "lift"] : ["lift", "run"]
      );
    }
  });

  it("notes a hard run beside a lift that loads the legs", () => {
    const p = profile({ weekSchedule: DOUBLES });
    const long = runDay(SAT, { templateId: "long_10k", type: "long" });
    const legs = week({
      profile: p,
      programState: plan(six, { runDays: [long] }),
    });
    expect(liftsOn(legs, SAT)[0].workout?.dayName).toBe("F");
    expect(dayOf(legs, SAT).clash).toBe(true);
    const upper = week({
      profile: p,
      programState: plan(six.slice(0, 5).concat(session("F")), {
        runDays: [long],
      }),
    });
    expect(dayOf(upper, SAT).clash).toBe(false);
    const easy = week({
      profile: p,
      programState: plan(six, { runDays: [runDay(SAT)] }),
    });
    expect(dayOf(easy, SAT).clash).toBe(false);
  });
});

describe("who the week is for", () => {
  it("a free runner: no planned runs, a standing run, the runs done on their days", () => {
    const p = profile({
      weekSchedule: layoutOf(
        "rest",
        "rest",
        "rest",
        "rest",
        "rest",
        "rest",
        "rest"
      ),
      runMode: "freeform",
      runFrequency: "regular",
    });
    const programState = plan([], { runDays: [] });
    const w = week({
      today: THU,
      profile: p,
      programState,
      runs: [savedRun(TUE), savedRun(shift(MON, -1))],
    });
    expect(w.freeRunning).toBe(true);
    expect(w.kind).toEqual({ lifts: false, runs: true });
    expect(w.count.runs).toMatchObject({ done: 1, planned: null });
    expect(runsOn(w, TUE)).toEqual([
      expect.objectContaining({ plan: false, state: "done" }),
    ]);
    // Home's rest day offers a run on the same test.
    const home = todaySession({
      today: THU,
      profile: p,
      programState,
      claimMap: new Map(),
      workouts: [],
      week: w,
      createdAtMs: 0,
      nowMs: parseLocalDate(THU).getTime(),
      lifetimeRuns: 3,
      lifetimeMeals: 3,
    });
    expect(home.rest?.kind).toBe("free-run");
  });

  it("someone on a run plan is not running freely", () => {
    const w = week({
      profile: profile({ runMode: "race_prep" }),
      programState: plan([A, B, C], { runDays: [runDay(TUE)] }),
    });
    expect(w.freeRunning).toBe(false);
  });

  it("a new account begun mid-week gets its full plan from day one (the owner's call)", () => {
    const w = week({
      today: WED,
      profile: profile({ createdAt: createdOn(WED) }),
      programState: plan([A, B, C], { runDays: [runDay(TUE), runDay(THU)] }),
    });
    expect(dayOf(w, MON)).toMatchObject({
      beforeStart: true,
      sessions: [],
      rest: null,
    });
    expect(dayOf(w, TUE)).toMatchObject({ beforeStart: true, sessions: [] });
    expect(lifts(w)).toMatchObject({
      [WED]: ["A today"],
      [FRI]: ["B planned"],
    });
    expect(liftsOn(w, WED)[0]).toMatchObject({
      plannedOn: WED,
      movedFrom: null,
    });
    // Every lift of the first week, from today: the one the days left
    // cannot hold waits in order, held back to no Monday.
    expect(names(w.stillToDo)).toEqual(["C"]);
    expect(w.stillToDo[0].plannedOn).toBeNull();
    expect(w.count.lifts.planned).toBe(2);
    expect(w.count.runs.planned).toBe(1);
    // Nothing done by Friday: A moves on, B and C wait, in order.
    const friday = week({
      today: FRI,
      profile: profile({ createdAt: createdOn(WED) }),
      programState: plan([A, B, C]),
    });
    expect(lifts(friday)[FRI]).toEqual(["A today"]);
    expect(liftsOn(friday, FRI)[0].movedFrom).toBe(WED);
    expect(names(friday.stillToDo)).toEqual(["B", "C"]);
  });
});

describe("a race", () => {
  /** A race plan whose race is this Sunday: Friday, Saturday and Sunday
   *  are its rest days. */
  const racePlan = (
    workouts: WorkoutDay[],
    extra: Partial<ProgramState> = {}
  ) =>
    plan(workouts, {
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: SUN },
      } as ProgramState["runPlan"],
      ...extra,
    });

  it("lays no lift on its rest days", () => {
    const w = week({
      today: WED,
      programState: racePlan([doneOn(A, MON), B, C]),
      workouts: [saved(MON)],
    });
    expect(dayOf(w, FRI).raceRest).toBe(true);
    expect(lifts(w)[WED]).toEqual(["B today"]);
    expect(lifts(w)[FRI]).toEqual([]);
    expect(names(w.stillToDo)).toEqual(["C"]);
  });

  it("race week: the lifts the app rests and the lift days they leave read rest before the race", () => {
    const w = week({
      today: TUE,
      programState: racePlan(
        [doneOn(A, MON), { ...B, skipped: true }, { ...C, skipped: true }],
        { raceWeek: "race" }
      ),
      workouts: [saved(MON)],
    });
    expect(names(w.raceRest)).toEqual(["B", "C"]);
    expect(w.raceRest[0]).toMatchObject({
      group: "race-rest",
      state: "race-rest",
      plannedOn: null,
    });
    expect(w.skipped).toEqual([]);
    expect(dayOf(w, WED).rest).toBe("race");
    expect(dayOf(w, FRI).rest).toBe("race");
    expect(w.liftsDone).toBe(false);
  });

  it("race week counts only the lifts it asks for (the owner's call)", () => {
    const input = {
      today: TUE,
      programState: racePlan(
        [doneOn(A, MON), { ...B, skipped: true }, { ...C, skipped: true }],
        { raceWeek: "race" }
      ),
      workouts: [saved(MON)],
    };
    const w = week(input);
    expect(w.count.lifts).toEqual({ done: 1, planned: 1 });
    // The count is trainingWeek's, which counts race week the same way.
    expect(
      trainingWeek({
        weekKey: WEEK,
        profile: profile(),
        programState: input.programState,
        workouts: input.workouts,
        runs: [],
        now: parseLocalDate(TUE),
      }).lifts.planned
    ).toBe(1);
    // Rested to the last one: nothing is planned.
    const allRested = week({
      today: FRI,
      programState: racePlan(
        [
          { ...A, skipped: true },
          { ...B, skipped: true },
          { ...C, skipped: true },
        ],
        { raceWeek: "race" }
      ),
    });
    expect(allRested.count.lifts.planned).toBeNull();
    // An ordinary week's skip is the person's, and still planned.
    const ordinary = week({
      today: TUE,
      programState: plan([A, { ...B, skipped: true }, C]),
    });
    expect(ordinary.count.lifts.planned).toBe(3);
  });

  it("never offers Start next week in race week", () => {
    const w = week({
      today: TUE,
      programState: racePlan([doneOn(A, MON)], { raceWeek: "race" }),
      workouts: [saved(MON)],
    });
    expect(w.liftsDone).toBe(false);
  });
});

describe("a plan made for another week", () => {
  it("after Start next week, lays the new week's lifts from today, and the old week's sessions as saved", () => {
    const finished = plan([doneOn(A, MON), doneOn(B, TUE), doneOn(C, WED)]);
    const started = advanceWeek(finished, "beginner", NEXT_WEEK);
    const w = week({
      today: WED,
      programState: started,
      workouts: [saved(MON), saved(TUE), saved(WED)],
    });
    expect(lifts(w)[MON]).toEqual([`saved w-${MON} done`]);
    expect(lifts(w)[WED]).toEqual(["A today", `saved w-${WED} done`]);
    expect(lifts(w)[FRI]).toEqual(["B planned"]);
    expect(names(w.stillToDo)).toEqual(["C"]);
    // Next week's: no day of this one was first given them.
    expect(liftsOn(w, FRI)[0]).toMatchObject({
      plannedOn: null,
      movedFrom: null,
    });
  });

  it("the week after, holds a lift done before it began as done, off the week", () => {
    const early = plan([doneOn(A, LAST_WEEK), B, C], { liftWeekKey: WEEK });
    const w = week({
      today: MON,
      programState: early,
      workouts: [saved(LAST_WEEK)],
    });
    expect(names(w.doneOffWeek)).toEqual(["A"]);
    expect(w.doneOffWeek[0]).toMatchObject({
      group: "done-off-week",
      state: "done",
      savedId: `w-${LAST_WEEK}`,
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["B today"],
      [WED]: ["C planned"],
    });
    // Drawn done; the count counts the saved session in its own week.
    expect(w.count.lifts.done).toBe(0);
  });

  it("a plan the rollover has not reached is laid as it stands, as Home reads it", () => {
    const stale = plan([doneOn(A, LAST_WEEK), B, C], {
      liftWeekKey: LAST_WEEK,
    });
    const w = week({
      today: MON,
      programState: stale,
      workouts: [saved(LAST_WEEK)],
    });
    expect(lifts(w)[MON]).toEqual(["B today"]);
    expect(liftsOn(w, MON)[0].plannedOn).toBeNull();
  });

  it("another week shows what was saved in it, and none of the plan's lifts", () => {
    const w = week({
      weekKey: LAST_WEEK,
      today: WED,
      workouts: [saved(LAST_WEEK), saved(MON)],
      inProgress: [{ sport: "lift", index: 0 }],
    });
    expect(lifts(w)[LAST_WEEK]).toEqual([`saved w-${LAST_WEEK} done`]);
    expect(w.entries).toHaveLength(1);
    expect(w.next).toBeNull();
    expect(w.nextSession).toBeNull();
    expect(w.liftsDone).toBe(false);
  });
});

describe("the counts are trainingWeek's", () => {
  it("draws as many sessions done as it counts, in an ordinary week", () => {
    const w = week({
      today: SUN,
      programState: plan([doneOn(A, MON), doneOn(B, WED), C], {
        runDays: [runDay(TUE), runDay(THU)],
      }),
      workouts: [saved(MON), saved(WED), saved(SAT, "routine")],
      runs: [savedRun(TUE), savedRun(SUN)],
    });
    const drawn = w.days.flatMap((d) => d.sessions);
    expect(
      drawn.filter((s) => s.sport === "lift" && s.state === "done")
    ).toHaveLength(w.count.lifts.done);
    expect(
      drawn.filter((s) => s.sport === "run" && s.state === "done" && s.counts)
    ).toHaveLength(w.count.runs.done);
    expect(w.count.lifts).toEqual({ done: 3, planned: 3 });
    expect(w.count.runs).toMatchObject({ done: 2, planned: 2 });
  });

  it("draws a mark by hand beside a run that filled the day before's: two done, one counted", () => {
    // Monday's easy run is filled a day late by Tuesday's 5 km, too short
    // for Tuesday's 10 km long run, which is then marked done by hand.
    const programState = plan([A, B, C], {
      runDays: [
        runDay(MON),
        runDay(TUE, { templateId: "long_10k", type: "long" }),
      ],
      manualCompletions: { [`rd-${TUE}`]: { completedAt: 0 } },
    });
    const w = week({ today: WED, programState, runs: [savedRun(TUE)] });
    expect(runsOn(w, MON)[0]).toMatchObject({ state: "done", doneOn: TUE });
    expect(runsOn(w, TUE)[0]).toMatchObject({
      state: "done",
      savedRunId: null,
    });
    expect(w.count.runs.done).toBe(1);
  });
});

describe("Home's card names the lift the week lays on today", () => {
  /** Home's card on `today`, from the same plan and sessions. */
  const homeLift = (input: LayOutWeekInput) =>
    todaySession({
      today: input.today,
      profile: input.profile,
      programState: input.programState,
      claimMap: input.claimMap,
      workouts: input.workouts,
      week: layOutWeek(input),
      createdAtMs: 0,
      nowMs: parseLocalDate(input.today).getTime(),
      lifetimeRuns: 3,
      lifetimeMeals: 3,
    }).lift;

  it("on a first week begun on a Friday, where the slot named the third lift", () => {
    const input: LayOutWeekInput = {
      weekKey: WEEK,
      today: FRI,
      profile: profile({ createdAt: createdOn(FRI) }),
      programState: plan([A, B, C]),
      workouts: [],
      runs: [],
      claimMap: new Map(),
    };
    const w = layOutWeek(input);
    const card = homeLift(input);
    expect(card?.index).toBe(0);
    expect(liftsOn(w, FRI)[0]).toMatchObject({
      index: 0,
      state: "today",
      isNext: true,
    });
  });

  it("on every day of a week with misses, an early lift and a skip", () => {
    const programState = plan([
      doneOn(A, TUE),
      { ...B, skipped: true },
      C,
      session("D"),
    ]);
    for (const today of [WED, THU, FRI, SAT, SUN]) {
      const input: LayOutWeekInput = {
        weekKey: WEEK,
        today,
        profile: profile(),
        programState,
        workouts: [saved(TUE)],
        runs: [],
        claimMap: new Map(),
      };
      const w = layOutWeek(input);
      const card = homeLift(input);
      const laid = liftsOn(w, today).find((l) => l.state === "today");
      if (card?.status === "planned") expect(laid?.index).toBe(card.index);
      else expect(laid).toBeUndefined();
      expect(w.next?.index).toBe(2);
    }
  });
});

describe("a week across a change of clocks", () => {
  // The week Auckland's clocks go back (5 April 2026): CI's Auckland run
  // lays it out with a 25-hour Sunday. A literal, as no window has to hold
  // it: the module reads no clock.
  it("still has seven days and lays the lifts on them", () => {
    const week0 = "2026-03-30";
    const days = weekDays(week0);
    const w = layOutWeek({
      weekKey: week0,
      today: days[0],
      profile: profile({ createdAt: createdOn("2026-01-01") }),
      programState: plan([A, B, C], { liftWeekKey: week0 }),
      workouts: [],
      runs: [],
      claimMap: new Map(),
    });
    expect(w.days.map((d) => d.date)).toEqual(days);
    expect(names(w.days.flatMap((d) => liftsOn(w, d.date)))).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(dayOf(w, days[6]).date).toBe("2026-04-05");
  });
});
