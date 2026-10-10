/**
 * The weekly rollover as pure functions (`weekRollover.ts`): what the two
 * rollover effects in `useProgram` call, and what the simulator calls to
 * step a plan through weeks without React. Phase 1, item 1 of the
 * training-engine pass.
 *
 * The traces were taken from the rollover loops as they stood inside the
 * effects, on these plans, before the move; the move kept every one. A
 * byte-for-byte comparison of the old loops and these functions over 1,512
 * plans (7 people × 9 plan states × 8 gaps × 3 layoff readings) found no
 * difference either.
 *
 * Each case runs the passes the app makes: the run-side effect, then the
 * lift-side one, each running again on the plan the last one saved, until
 * neither moves.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { migrateProgramState } from "../migrations";
import { advanceWeek } from "../programEngine";
import type { LayoffClass } from "../layoffDetection";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import {
  MAX_ROLLOVER_WEEKS,
  nextRunWeek,
  regenerateRacePlan,
  rollLiftWeeks,
  rollRunWeeks,
  type RolledOver,
} from "../weekRollover";

/** A Monday. Weeks from here cross Auckland's change to summer time. */
const START = "2026-09-07";
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
const weekOf = (date: string) => localWeekKey(parseLocalDate(date));

afterEach(() => {
  vi.useRealTimers();
});

/** Runs `run` with the clock at noon on `day`. */
function onDay<T>(day: string, run: () => T): T {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(parseLocalDate(day).getTime() + 12 * 3600 * 1000);
  try {
    return run();
  } finally {
    vi.useRealTimers();
  }
}

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "hypertrophy",
  daysPerWeek: 4,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "25-34",
  heightCm: 175,
  weightKg: 81.5,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

/** The plan setup builds on START, as the loader reads it back. */
function build(answers: Partial<OnboardingDraft>) {
  return onDay(START, () => {
    const plan = buildOnboardingPlan({ ...draft, ...answers }, "recomp", START);
    return {
      state: migrateProgramState(
        normalizeProgramState(plan.programState),
        weekOf(START)
      ),
      profile: { uid: "u", ...plan.profileUpdates } as unknown as UserProfile,
    };
  });
}

/** One line per move: what a week moving on changes, without its ids. */
function trace(r: RolledOver): string {
  const s = r.state;
  let sets = 0;
  let load = 0;
  for (const day of s.workouts)
    for (const e of day.exercises) {
      sets += e.sets ?? 0;
      load += (e.weight ?? 0) * (e.sets ?? 0);
    }
  const runs = s.runDays ?? [];
  const plan = s.runPlan;
  return [
    `moved ${String(r.weeks)}`,
    `week ${String(s.weekNumber)} ${s.currentPhase}`,
    `lifts ${s.liftWeekKey ?? "-"}`,
    `history ${String(s.weekHistory?.length ?? 0)}`,
    `sets ${String(sets)} load ${load.toFixed(1)}`,
    `runs ${runs[0]?.weekKey ?? "-"} ${runs.map((d) => d.templateId).join(",")}`,
    `plan ${
      plan
        ? `${plan.mode} ${String(plan.currentWeek)}/${String(plan.totalWeeks)}${plan.phase ? ` ${plan.phase}` : ""}`
        : "-"
    }`,
  ].join(" | ");
}

/** The app's passes: run side, then lift side, again on what was saved. */
function catchUp(
  state: ProgramState,
  profile: UserProfile,
  today: string,
  layoff: LayoffClass
): string[] {
  const todayKey = weekOf(today);
  const lines: string[] = [];
  let s = state;
  for (let pass = 0; pass < 6; pass++) {
    const run = onDay(today, () => rollRunWeeks(s, profile, todayKey, layoff));
    if (run.weeks > 0) {
      lines.push(`run  ${trace(run)}`);
      s = run.state;
      continue;
    }
    const lift = onDay(today, () => rollLiftWeeks(s, profile, todayKey));
    if (lift.weeks > 0) {
      lines.push(`lift ${trace(lift)}`);
      s = lift.state;
      continue;
    }
    break;
  }
  return lines;
}

const allDone = (s: ProgramState): ProgramState => ({
  ...s,
  workouts: s.workouts.map((d) => ({ ...d, completed: true })),
});

const race10k: Partial<OnboardingDraft> = {
  daysPerWeek: 3,
  runFrequency: "regular",
  runMode: "race_prep",
  weeklyRunDays: 3,
  raceDistance: "10k",
  raceTargetDate: shift(START, 12 * 7 + 5),
};

const cases: {
  name: string;
  answers: Partial<OnboardingDraft>;
  edit?: (s: ProgramState) => ProgramState;
  weeksBehind: number;
  layoff?: LayoffClass;
  expected: string[];
}[] = [
  {
    name: "a lifter three weeks behind, the week left trained",
    answers: {},
    edit: allDone,
    weeksBehind: 3,
    expected: [
      "lift moved 3 | week 2 progression | lifts 2026-09-28 | history 1 | sets 59 load 2642.5 | runs -  | plan -",
    ],
  },
  {
    name: "a lifter twenty weeks behind, in two moves",
    answers: { daysPerWeek: 3, experience: "beginner", primaryGoal: "general" },
    weeksBehind: 20,
    expected: [
      "lift moved 12 | week 1 progression | lifts 2026-11-30 | history 0 | sets 37 load 1570.0 | runs -  | plan -",
      "lift moved 8 | week 1 progression | lifts 2027-01-25 | history 0 | sets 37 load 1570.0 | runs -  | plan -",
    ],
  },
  {
    name: "a 10K plan two weeks behind, the week left trained",
    answers: race10k,
    edit: allDone,
    weeksBehind: 2,
    expected: [
      "run  moved 2 | week 2 progression | lifts 2026-09-21 | history 1 | sets 40 load 2085.0 | runs 2026-09-21 easy_30,easy_30_strides,long_6k | plan race_prep 2/13",
    ],
  },
  {
    name: "a 10K plan two weeks behind, after a long layoff",
    answers: race10k,
    weeksBehind: 2,
    layoff: "detrained",
    expected: [
      "run  moved 2 | week 1 progression | lifts 2026-09-21 | history 0 | sets 40 load 2085.0 | runs 2026-09-21 easy_30,easy_30,long_6k | plan race_prep 2/13",
    ],
  },
  {
    name: "a marathon plan trimming leg work, five weeks behind",
    answers: {
      ...race10k,
      weeklyRunDays: 4,
      raceDistance: "marathon",
      raceTargetDate: shift(START, 16 * 7 + 6),
      raceLegTrim: true,
    },
    edit: allDone,
    weeksBehind: 5,
    expected: [
      "run  moved 5 | week 2 progression | lifts 2026-10-12 | history 1 | sets 40 load 2085.0 | runs 2026-10-12 easy_50,easy_30_strides,easy_30,long_15k | plan race_prep 5/17",
    ],
  },
  {
    name: "a half marathon plan rolled past race day, then the lifts on",
    answers: {
      ...race10k,
      daysPerWeek: 2,
      experience: "beginner",
      runFrequency: "occasional",
      raceDistance: "half",
      raceTargetDate: shift(START, 2 * 7 + 6),
    },
    weeksBehind: 4,
    // F6: the runs stop at race week and the plan stays, for the race's
    // own ending; the lifts carry the calendar on, to the same place.
    expected: [
      "run  moved 2 | week 1 deload | lifts 2026-09-21 | history 0 | sets 16 load 547.5 | runs 2026-09-21 easy_30,easy_30,easy_30,half_race | plan race_prep 2/3",
      "lift moved 2 | week 4 progression | lifts 2026-10-05 | history 0 | sets 28 load 1115.0 | runs 2026-09-21 easy_30,easy_30,easy_30,half_race | plan race_prep 2/3",
    ],
  },
  {
    name: "a 10K plan in a recovery that ends on the way",
    answers: race10k,
    edit: (s) => ({
      ...s,
      runPlan: {
        ...s.runPlan!,
        phase: "recovery",
        recoveryEndDate: shift(START, 10),
      },
    }),
    weeksBehind: 2,
    expected: [
      "run  moved 2 | week 1 progression | lifts 2026-09-21 | history 0 | sets 40 load 2085.0 | runs 2026-09-21 easy_30,easy_30_strides,long_6k | plan race_prep 1/13",
    ],
  },
  {
    name: "a 10K plan whose lifts are a week ahead",
    answers: race10k,
    edit: (s) => ({ ...s, liftWeekKey: shift(s.liftWeekKey ?? START, 7) }),
    weeksBehind: 2,
    expected: [
      "run  moved 2 | week 1 progression | lifts 2026-09-21 | history 0 | sets 40 load 2085.0 | runs 2026-09-21 easy_30,easy_30_strides,long_6k | plan race_prep 2/13",
    ],
  },
];

describe("a plan behind the calendar", () => {
  it.each(cases)("$name", (c) => {
    const built = build(c.answers);
    const state = c.edit ? c.edit(built.state) : built.state;
    const today = shift(START, c.weeksBehind * 7 + 2);
    expect(catchUp(state, built.profile, today, c.layoff ?? "none")).toEqual(
      c.expected
    );
  });
});

describe("the rollover functions", () => {
  const lifter = () => build({});
  const runner = () => build(race10k);
  const later = shift(START, 3 * 7 + 2);

  it("move only the side the plan follows", () => {
    const lift = lifter();
    const run = runner();
    expect(
      onDay(later, () =>
        rollRunWeeks(lift.state, lift.profile, weekOf(later), "none")
      ).weeks
    ).toBe(0);
    expect(
      onDay(later, () => rollLiftWeeks(run.state, run.profile, weekOf(later)))
        .weeks
    ).toBe(0);
  });

  it("leave a plan in this week's calendar alone", () => {
    const lift = lifter();
    const run = runner();
    const today = shift(START, 4);
    const sameLift = rollLiftWeeks(lift.state, lift.profile, weekOf(today));
    const sameRun = rollRunWeeks(run.state, run.profile, weekOf(today), "none");
    expect(sameLift).toEqual({ state: lift.state, weeks: 0 });
    expect(sameRun).toEqual({ state: run.state, weeks: 0 });
  });

  it(`move at most ${String(MAX_ROLLOVER_WEEKS)} weeks at a time`, () => {
    const lift = lifter();
    const far = shift(START, 30 * 7);
    const first = onDay(far, () =>
      rollLiftWeeks(lift.state, lift.profile, weekOf(far))
    );
    expect(first.weeks).toBe(MAX_ROLLOVER_WEEKS);
    expect(first.state.liftWeekKey).toBe(shift(START, MAX_ROLLOVER_WEEKS * 7));
  });

  it("never change the plan they are given", () => {
    for (const { state, profile } of [lifter(), runner()]) {
      const before = JSON.stringify(state);
      onDay(later, () => {
        rollRunWeeks(state, profile, weekOf(later), "none");
        rollLiftWeeks(state, profile, weekOf(later));
      });
      expect(JSON.stringify(state)).toBe(before);
    }
  });

  it("move a plan the same way every time, reading the clock only for updatedAt", () => {
    /* No ids are drawn and nothing else reads the clock, so the simulator
       needs no fake ids and only a pinned week key. */
    const withoutUpdatedAt = (r: RolledOver) =>
      JSON.stringify(r, (key, value: unknown) =>
        key === "updatedAt" ? 0 : value
      );
    for (const { state, profile } of [lifter(), runner()]) {
      const move = () =>
        profile.runMode === "race_prep"
          ? rollRunWeeks(state, profile, weekOf(later), "none")
          : rollLiftWeeks(state, profile, weekOf(later));
      const first = onDay(later, move);
      expect(first.weeks).toBe(3);
      expect(JSON.stringify(onDay(later, move))).toBe(JSON.stringify(first));
      expect(withoutUpdatedAt(onDay("2031-01-01", move))).toBe(
        withoutUpdatedAt(first)
      );
    }
  });
});

describe("a race week built mid-week (Run19, R21)", () => {
  /* The load-time rebuild of a stale race week and "Re-plan from today"
     rebuild this week through regenerateRacePlan. Built from the week's
     Monday, a rebuild on Saturday dated runs on days already gone, which
     then read as missed. */
  const saturday = shift(START, 5);
  const runner = () => build(race10k);
  const rebuild = (
    plan: ReturnType<typeof runner>,
    extra: Partial<Parameters<typeof regenerateRacePlan>[0]> = {}
  ) =>
    onDay(saturday, () =>
      regenerateRacePlan({
        profile: plan.profile,
        raceGoal: plan.profile.raceGoal!,
        weekSchedule: plan.profile.weekSchedule ?? [],
        weeklyRunDays: getWeeklyRunTarget(plan.profile) || 3,
        currentDate: saturday,
        weekStart: weekOf(saturday),
        recentLayoff: "none",
        ...extra,
      })
    );

  it("plans no run before the day it is built", () => {
    const plan = runner();
    // From the week's Monday, the week holds runs before Saturday.
    const fromMonday = rebuild(plan).runDays;
    expect(fromMonday.some((d) => (d.date ?? "") < saturday)).toBe(true);
    const fromToday = rebuild(plan, { plannedFrom: saturday }).runDays;
    expect(fromToday.filter((d) => (d.date ?? "") < saturday)).toEqual([]);
    // From today on, the week is the one built from Monday.
    expect(fromToday).toEqual(
      fromMonday.filter((d) => (d.date ?? "") >= saturday)
    );
  });

  it("keeps the plan's own days before today as they were", () => {
    const plan = runner();
    const week = rebuild(plan).runDays;
    const [first, second] = week.filter((d) => (d.date ?? "") < saturday);
    expect(second).toBeDefined();
    // The plan's own days differ from what a rebuild would make there: a
    // run done and a run missed, each on its own session.
    const doneDay = {
      ...first,
      id: "runday_done",
      templateId: "easy_20",
      status: "completed_exact" as const,
    };
    const missedDay = { ...second, id: "runday_missed", templateId: "easy_20" };
    const lastWeek = {
      ...second,
      id: "runday_last_week",
      date: shift(START, -3),
      weekKey: weekOf(shift(START, -3)),
    };
    const manualCompletions = { [doneDay.id]: { completedAt: 1 } };
    const rebuilt = rebuild(plan, {
      plannedFrom: saturday,
      prior: { runDays: [lastWeek, doneDay, missedDay], manualCompletions },
    });
    // The days already gone are the plan's: the done run and the missed
    // one, as they were. Last week's day isn't this week's.
    expect(rebuilt.runDays.filter((d) => (d.date ?? "") < saturday)).toEqual([
      doneDay,
      missedDay,
    ]);
    expect(rebuilt.runDays.some((d) => d.id === lastWeek.id)).toBe(false);
    expect(rebuilt.manualCompletions).toEqual(manualCompletions);
  });
});

/* F6 (the training-engine simulator): rolling into the week after race day
   dropped the race plan and race week's days before the server could read
   them. The server ends race prep from them (a no-show, the recovery exit,
   the return to free running) and starts recovery for a race logged late,
   so it never did: race prep went on for a race that was over, and the
   Monday check said "fell behind" every week. */
describe("after race day, the race plan waits for the race's own ending", () => {
  const raceDay = shift(START, 13); // a Sunday
  const mondayAfter = shift(START, 14);
  const racer = () =>
    build({
      runFrequency: "regular",
      runMode: "race_prep",
      weeklyRunDays: 3,
      raceDistance: "10k",
      raceTargetDate: raceDay,
    });

  /** The plan in race week: its runs built for the week holding the race. */
  const inRaceWeek = () => {
    const { state, profile } = racer();
    const raceWeek = onDay(shift(raceDay, -6), () =>
      rollRunWeeks(state, profile, weekOf(raceDay), "none")
    ).state;
    return { state: raceWeek, profile };
  };

  it("keeps the race plan and its run days, and plans no new runs", () => {
    const { state, profile } = racer();
    expect(state.runPlan?.raceGoal?.targetDate).toBe(raceDay);
    const next = onDay(mondayAfter, () =>
      nextRunWeek(
        state,
        { weekStart: weekOf(mondayAfter), date: mondayAfter },
        profile,
        "none"
      )
    );
    expect(next.runPlan?.raceGoal?.targetDate).toBe(raceDay);
    expect(next.runDays).toEqual(state.runDays);
  });

  it("leaves race week where it is and lets the lifts carry the calendar", () => {
    const { state, profile } = inRaceWeek();
    expect(state.runDays?.some((rd) => rd.date === raceDay)).toBe(true);
    const later = shift(mondayAfter, 14);
    const runs = onDay(later, () =>
      rollRunWeeks(state, profile, weekOf(later), "none")
    );
    expect(runs.weeks).toBe(0);
    const lifts = onDay(later, () =>
      rollLiftWeeks(state, profile, weekOf(later))
    );
    expect(lifts.weeks).toBe(3);
    expect(lifts.state.liftWeekKey).toBe(weekOf(later));
    expect(lifts.state.runDays).toEqual(state.runDays);
    expect(lifts.state.runPlan?.raceGoal?.targetDate).toBe(raceDay);
  });

  it("moves the lifts into the week after the race, not into race week again", () => {
    // "Start next week" moves the lifts with this step's race block. The
    // plan kept for the race's ending still sits at its race week, which
    // read as the week moved into made it race week again for the lifts.
    const { state, profile } = inRaceWeek();
    expect(state.raceWeek).toBe("race");
    const next = onDay(shift(raceDay, -1), () =>
      nextRunWeek(
        state,
        { weekStart: weekOf(mondayAfter), date: mondayAfter },
        profile,
        "none"
      )
    );
    expect(next.runDays).toEqual(state.runDays);
    expect(next.raceBlock).toBeNull();
    const lifts = advanceWeek(
      state,
      profile.experience,
      weekOf(mondayAfter),
      next.raceBlock
    );
    expect(lifts.raceWeek).toBe("after");
  });

  it("keeps a recovery that has ended, for the server's recovery exit", () => {
    const { state, profile } = racer();
    const recovered: ProgramState = {
      ...state,
      runPlan: {
        ...state.runPlan!,
        phase: "recovery",
        recoveryEndDate: shift(raceDay, 7),
      },
    };
    const weekAfter = shift(mondayAfter, 7);
    const next = onDay(weekAfter, () =>
      nextRunWeek(
        recovered,
        { weekStart: weekOf(weekAfter), date: weekAfter },
        profile,
        "none"
      )
    );
    expect(next.runPlan?.phase).toBe("recovery");
    expect(next.runPlan?.recoveryEndDate).toBe(shift(raceDay, 7));
  });

  it("is free running once race prep has ended", () => {
    const { state, profile } = racer();
    const ended = { ...profile, runMode: "freeform" } as UserProfile;
    const next = onDay(mondayAfter, () =>
      nextRunWeek(
        state,
        { weekStart: weekOf(mondayAfter), date: mondayAfter },
        ended,
        "none"
      )
    );
    expect(next.runPlan).toBeUndefined();
    expect(next.runDays).toEqual([]);
  });
});
