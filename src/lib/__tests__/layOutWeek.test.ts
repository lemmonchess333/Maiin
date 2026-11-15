import { describe, expect, it } from "vitest";
import {
  layOutWeek,
  type LayOutWeekInput,
  type LayoutLift,
  type LayoutRun,
  type WeekLayout,
} from "../layOutWeek";
import { todaySession } from "../todaySession";
import { weekDays } from "../trainingWeek";
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
/** Each day's lifts, by name and state: "A to-do". */
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

describe("lifts on days", () => {
  it("lays the week's lifts on its lift days in order, with nothing done", () => {
    const w = week();
    expect(lifts(w)).toEqual({
      [MON]: ["A to-do"],
      [TUE]: [],
      [WED]: ["B to-do"],
      [THU]: [],
      [FRI]: ["C to-do"],
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
  });

  it("slides a lift whose day passed to the next lift day, never missed", () => {
    // Nothing on Monday; Tuesday reads the week.
    const w = week({ today: TUE });
    expect(lifts(w)[MON]).toEqual([]);
    expect(lifts(w)[WED]).toEqual(["A to-do"]);
    expect(lifts(w)[FRI]).toEqual(["B to-do"]);
    expect(liftsOn(w, WED)[0].movedFrom).toBe(MON);
    expect(liftsOn(w, FRI)[0].movedFrom).toBe(WED);
    // More lifts than lift days left: C waits, in order, on no rest day.
    expect(names(w.stillToDo)).toEqual(["C"]);
    expect(w.stillToDo[0].plannedOn).toBe(FRI);
    const states = w.days.flatMap((d) => d.sessions.map((s) => s.state));
    expect(states).not.toContain("missed");
  });

  it("keeps a lift done on the day its session was saved, and lays the rest from today", () => {
    const w = week({
      today: WED,
      programState: plan([doneOn(A, MON), B, C]),
      workouts: [saved(MON)],
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["A done"],
      [WED]: ["B to-do"],
      [FRI]: ["C to-do"],
    });
    expect(liftsOn(w, MON)[0].savedId).toBe(`w-${MON}`);
    expect(w.next?.workout).toBe(B);
  });

  it("brings the rest forward when one is done early, on a rest day", () => {
    // A on Monday, B on Tuesday from Train: C is next on Wednesday's lift
    // day, as Home's card offers it there.
    const w = week({
      today: TUE,
      programState: plan([doneOn(A, MON), doneOn(B, TUE), C]),
      workouts: [saved(MON), saved(TUE)],
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["A done"],
      [TUE]: ["B done"],
      [WED]: ["C to-do"],
      [FRI]: [],
    });
    expect(liftsOn(w, WED)[0]).toMatchObject({
      plannedOn: FRI,
      movedFrom: null,
    });
  });

  it("follows Make this next, and says where the lifts it pushed moved from", () => {
    const w = week({
      programState: plan([A, B, C], { nextWorkoutOverride: 2 }),
    });
    expect(lifts(w)).toMatchObject({
      [MON]: ["C to-do"],
      [WED]: ["A to-do"],
      [FRI]: ["B to-do"],
    });
    expect(liftsOn(w, MON)[0].movedFrom).toBeNull();
    expect(liftsOn(w, WED)[0].movedFrom).toBe(MON);
    expect(liftsOn(w, FRI)[0].movedFrom).toBe(WED);
    expect(w.next?.workout).toBe(C);
  });

  it("takes a skipped lift off the days, into its own group", () => {
    const w = week({ programState: plan([A, { ...B, skipped: true }, C]) });
    expect(lifts(w)).toMatchObject({
      [MON]: ["A to-do"],
      [WED]: ["C to-do"],
      [FRI]: [],
    });
    expect(names(w.skipped)).toEqual(["B"]);
    expect(w.skipped[0].restBeforeRace).toBe(false);
  });

  it("holds every lift once: on a day, still to do, skipped or done off the week", () => {
    const programState = plan([
      doneOn(A, MON),
      { ...B, skipped: true },
      C,
      session("Full Body D"),
      session("Full Body E"),
    ]);
    const w = week({ today: FRI, programState, workouts: [saved(MON)] });
    const held = [
      ...w.days.flatMap((d) =>
        d.sessions.filter((s): s is LayoutLift => s.sport === "lift")
      ),
      ...w.stillToDo,
      ...w.skipped,
      ...w.doneOffWeek,
    ].map((l) => l.index);
    expect(held.sort()).toEqual([0, 1, 2, 3, 4]);
    expect(lifts(w)[FRI]).toEqual(["C to-do"]);
    expect(names(w.stillToDo)).toEqual(["D", "E"]);
  });

  it("says the week's lifts are done, and offers none", () => {
    const w = week({
      today: WED,
      programState: plan([doneOn(A, MON), doneOn(B, TUE), doneOn(C, WED)]),
      workouts: [saved(MON), saved(TUE), saved(WED)],
    });
    expect(w.liftsDone).toBe(true);
    expect(w.next).toBeNull();
    expect(lifts(w)[FRI]).toEqual([]);
  });
});

describe("a session outside the plan", () => {
  it("sits on its day, and leaves the lift day to the plan's lift", () => {
    const w = week({
      workouts: [saved(MON, "empty-1"), saved(SAT, "routine-1")],
    });
    expect(lifts(w)[MON]).toEqual(["saved empty-1 done", "A to-do"]);
    expect(lifts(w)[SAT]).toEqual(["saved routine-1 done"]);
    expect(liftsOn(w, MON)[0].index).toBeNull();
    expect(w.count.lifts.done).toBe(2);
  });

  it("is a free run on the day it was run", () => {
    const w = week({
      today: WED,
      runs: [savedRun(shift(MON, -2)), savedRun(MON)],
    });
    expect(runsOn(w, MON)).toEqual([
      expect.objectContaining({ runDay: null, state: "done", counts: true }),
    ]);
  });

  it("shows a run saved anyway, counted in no total", () => {
    const w = week({
      today: WED,
      runs: [savedRun(MON, { savedAnyway: true } as Partial<SavedRun>)],
    });
    expect(runsOn(w, MON)[0].counts).toBe(false);
    expect(w.count.runs.done).toBe(0);
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
    expect(runsOn(w, THU)[0].state).toBe("to-do");
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

  it("names a run skipped, a race not recorded, and where a moved run came from", () => {
    const w = week({
      today: SAT,
      programState: plan([A, B, C], {
        runDays: [
          runDay(TUE, { status: "skipped" }),
          runDay(THU, { movedFromDate: WED }),
          runDay(SAT, {
            templateId: "10k_race",
            type: "race",
            status: "race_no_show",
          }),
        ],
      }),
    });
    expect(runsOn(w, TUE)[0].state).toBe("skipped");
    expect(runsOn(w, THU)[0]).toMatchObject({
      state: "missed",
      movedFrom: WED,
    });
    expect(runsOn(w, SAT)[0].state).toBe("not-recorded");
  });

  it("plans the runs the count plans", () => {
    const w = week({
      today: WED,
      programState: plan([A, B, C], { runDays: runs }),
    });
    expect(w.count.runs.planned).toBe(2);
    expect(
      w.days.filter((d) => runsOn(w, d.date).some((r) => r.runDay))
    ).toHaveLength(2);
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
      expect.objectContaining({ runDay: null, state: "done" }),
    ]);
    // Home's rest day offers a run on the same test.
    const home = todaySession({
      today: THU,
      profile: p,
      programState,
      claimMap: new Map(),
      workouts: [],
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

  it("a new account: the days before it began are blank, the lifts from its first day", () => {
    const w = week({
      today: WED,
      profile: profile({ createdAt: createdOn(WED) }),
      programState: plan([A, B, C], { runDays: [runDay(TUE), runDay(THU)] }),
      runs: [],
    });
    expect(dayOf(w, MON)).toMatchObject({ beforeStart: true, sessions: [] });
    expect(dayOf(w, TUE)).toMatchObject({ beforeStart: true, sessions: [] });
    expect(lifts(w)).toMatchObject({ [WED]: ["A to-do"], [FRI]: ["B to-do"] });
    expect(liftsOn(w, WED)[0]).toMatchObject({
      plannedOn: WED,
      movedFrom: null,
    });
    expect(names(w.stillToDo)).toEqual(["C"]);
    expect(w.count.lifts.planned).toBe(2);
    expect(w.count.runs.planned).toBe(1);
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
    expect(lifts(w)[WED]).toEqual(["B to-do"]);
    expect(lifts(w)[FRI]).toEqual([]);
    expect(names(w.stillToDo)).toEqual(["C"]);
  });

  it("reads race week's skipped lifts as rest before the race", () => {
    const w = week({
      today: TUE,
      programState: racePlan(
        [A, { ...B, skipped: true }, { ...C, skipped: true }],
        {
          raceWeek: "race",
        }
      ),
    });
    expect(w.skipped.map((l) => l.restBeforeRace)).toEqual([true, true]);
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
    expect(lifts(w)[WED]).toEqual([`saved w-${WED} done`, "A to-do"]);
    expect(lifts(w)[FRI]).toEqual(["B to-do"]);
    expect(names(w.stillToDo)).toEqual(["C"]);
    // Next week's: no day of this one was planned for them.
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
    expect(lifts(w)).toMatchObject({ [MON]: ["B to-do"], [WED]: ["C to-do"] });
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
    expect(lifts(w)[MON]).toEqual(["B to-do"]);
    expect(liftsOn(w, MON)[0].plannedOn).toBeNull();
  });

  it("another week shows what was saved in it, and none of the plan's lifts", () => {
    const w = week({
      weekKey: LAST_WEEK,
      today: WED,
      workouts: [saved(LAST_WEEK), saved(MON)],
    });
    expect(lifts(w)[LAST_WEEK]).toEqual([`saved w-${LAST_WEEK} done`]);
    expect(w.next).toBeNull();
    expect(w.stillToDo).toEqual([]);
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
      state: "to-do",
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
      const laid = liftsOn(w, today).find((l) => l.state === "to-do");
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
