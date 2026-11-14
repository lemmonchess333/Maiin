/**
 * The streak with the plan's rest days (App1 Q32, 13 November 2026): "the
 * streak stays as days, with covered rest days".
 *
 * A planned rest day neither breaks the streak nor asks for a session: it
 * is a day of the streak, as a logged day is, and spends no grace. A day
 * the plan held a session and nothing was logged is what it was under
 * Streak1: one in any seven is forgiven, a second within the week ends the
 * streak. A person with no plan has no rest days, so every day asks for a
 * log, as before.
 *
 * The rest days come from the plan as the app reads it (`restDays.ts`), so
 * these walk the real plans, not hand-built sets.
 */
import { describe, expect, it } from "vitest";
import type { ProgramState } from "@/features/program/programTypes";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  keptThroughAfter,
  plannedRestDays,
  type StreakPlan,
} from "../restDays";
import {
  computeStreakSpan,
  computeStreakState,
  streakAcross,
} from "../useStreaks";

type Day = "rest" | "lift" | "run" | "both";
const week = (...types: Day[]) => types.map((type, day) => ({ day, type }));

/** Lifts on Monday, Wednesday and Friday. */
const THREE_DAY_LIFTER: StreakPlan = {
  profile: {
    weekSchedule: week("rest", "lift", "rest", "lift", "rest", "lift", "rest"),
  },
  startKey: "2026-09-01",
  programState: null,
};
const NO_PLAN: StreakPlan = {
  profile: null,
  startKey: null,
  programState: null,
};

/** Noon on a day, as the hook reads one (`parseLocalDate(todayKey)`). */
const at = (key: string) => {
  const d = parseLocalDate(key);
  d.setHours(12);
  return d;
};
const restDaysOn = (plan: StreakPlan, today: string) =>
  plannedRestDays(
    plan,
    localDateString(addLocalDays(parseLocalDate(today), -90)),
    today,
    today
  );
const streakOn = (plan: StreakPlan, logged: string[], today: string) =>
  computeStreakState(new Set(logged), null, at(today), restDaysOn(plan, today));

/** The lifter's lifts and nothing else, Monday 26 October to Wednesday 11
 *  November: no meal logged, no run. */
const LIFTS = [
  "2026-10-26",
  "2026-10-28",
  "2026-10-30",
  "2026-11-02",
  "2026-11-04",
  "2026-11-06",
  "2026-11-09",
  "2026-11-11",
];

describe("a rest day kept", () => {
  it("counts as a day of the streak and spends no grace", () => {
    // Monday lifted, Tuesday rested as planned, Wednesday lifted.
    const span = computeStreakSpan(
      new Set(["2026-11-09", "2026-11-11"]),
      at("2026-11-11"),
      undefined,
      new Set(["2026-11-10"])
    );
    expect(span.streak).toBe(3);
    expect(span.restDates).toEqual(["2026-11-10"]);
    expect(span.bridgedDates).toEqual([]);
  });

  it("keeps the streak the morning after, before anything is logged", () => {
    // Thursday morning after Wednesday's lift: Tuesday rested, Wednesday
    // lifted. Under Streak1 alone the morning after a rest read 0.
    const state = streakOn(THREE_DAY_LIFTER, LIFTS, "2026-11-12");
    // Today, Thursday, is a rest day too: it counts.
    expect(state.live.streak).toBe(18);
    expect(state.live.endDate).toBe("2026-11-12");
    // The stored pair ends on the last logged day, rest days after it walked
    // again from the plan.
    expect(state.anchor).toEqual({ streak: 17, lastActiveDate: "2026-11-11" });
    expect(state.endDate).toBe("2026-11-12");
  });

  it("is still named once the pair is saved and the walk stops at it", () => {
    // The pair saved this morning ends today: the walk credits it at once,
    // and the days it covered come from the walk over what it can see.
    const first = streakOn(THREE_DAY_LIFTER, LIFTS, "2026-11-11");
    const again = computeStreakState(
      new Set(LIFTS),
      first.anchor,
      at("2026-11-11"),
      restDaysOn(THREE_DAY_LIFTER, "2026-11-11")
    );
    expect(again.live.streak).toBe(17);
    expect(again.live.restDates).toEqual(first.live.restDates);
  });

  it("never starts a streak on its own", () => {
    // Nothing logged before Tuesday's rest: nothing to keep.
    const span = computeStreakSpan(
      new Set(["2026-10-01"]),
      at("2026-11-10"),
      undefined,
      new Set(["2026-11-10", "2026-11-09"])
    );
    expect(span.streak).toBe(0);
    expect(span.endDate).toBeNull();
  });

  it("is never more than a day: the stored pair walks back to the same streak", () => {
    // The next day's walk from the saved pair, with nothing older read.
    const thursday = streakOn(THREE_DAY_LIFTER, LIFTS, "2026-11-12");
    const friday = computeStreakState(
      new Set(["2026-11-11"]),
      thursday.anchor,
      at("2026-11-13"),
      restDaysOn(THREE_DAY_LIFTER, "2026-11-13")
    );
    // Friday is a lifting day, nothing logged yet: the streak ends on
    // Thursday's rest, 18 days.
    expect(friday.live.streak).toBe(18);
  });
});

describe("a missed training day", () => {
  it("is forgiven once in any seven, as Streak1 forgives a day", () => {
    // Wednesday's lift not done; Thursday is rest.
    const logged = LIFTS.filter((d) => d !== "2026-11-11");
    const state = streakOn(THREE_DAY_LIFTER, logged, "2026-11-12");
    expect(state.live.streak).toBe(18);
    expect(state.live.bridgedDates).toEqual(["2026-11-11"]);
  });

  it("a second within the week ends the streak, rest days or not", () => {
    // Monday's and Wednesday's lifts both missed, two days apart.
    const logged = LIFTS.filter(
      (d) => d !== "2026-11-11" && d !== "2026-11-09"
    );
    const state = streakOn(THREE_DAY_LIFTER, logged, "2026-11-12");
    expect(state.live.streak).toBe(0);
  });

  it("is answered by the next log, which keeps the streak", () => {
    // Lifts to Friday 6, then Monday's missed: on Tuesday, a rest day,
    // Monday is the one forgiven day and the streak stands.
    const logged = ["2026-11-02", "2026-11-04", "2026-11-06"];
    const tuesday = streakOn(THREE_DAY_LIFTER, logged, "2026-11-10");
    expect(tuesday.live.streak).toBe(9);
    expect(tuesday.live.bridgedDates).toEqual(["2026-11-09"]);
    // Wednesday's lift done: it goes on from there.
    const wednesday = streakOn(
      THREE_DAY_LIFTER,
      [...logged, "2026-11-11"],
      "2026-11-11"
    );
    expect(wednesday.live.streak).toBe(10);
  });

  it("two missed sessions end it, however many rest days lie between", () => {
    // One lift a week, on Mondays, logged on 2 November and then not again:
    // Monday 9 is forgiven; by Tuesday 17 Monday 16 is a second missed
    // session, a week after the first, with nothing logged between.
    const weekly: StreakPlan = {
      profile: {
        weekSchedule: week(
          "rest",
          "lift",
          "rest",
          "rest",
          "rest",
          "rest",
          "rest"
        ),
      },
      startKey: "2026-09-01",
      programState: null,
    };
    expect(streakOn(weekly, ["2026-11-02"], "2026-11-10").live.streak).toBe(9);
    expect(streakOn(weekly, ["2026-11-02"], "2026-11-17").live.streak).toBe(0);
  });
});

describe("a week of a three-day lifter", () => {
  it("logging only the lifts keeps a streak of every day", () => {
    const state = streakOn(THREE_DAY_LIFTER, LIFTS, "2026-11-11");
    // Monday 26 October to Wednesday 11 November: 17 days, 8 of them lifts.
    expect(state.live.streak).toBe(17);
    expect(state.live.restDates).toHaveLength(9);
    expect(state.live.bridgedDates).toEqual([]);
  });

  it("the streak a lift adds to is the one shown (a post's milestone)", () => {
    const logged = LIFTS.filter((d) => d !== "2026-11-11");
    const across = streakAcross(
      new Set(logged),
      null,
      "2026-11-11",
      at("2026-11-11"),
      restDaysOn(THREE_DAY_LIFTER, "2026-11-11")
    );
    expect(across).toEqual({ before: 16, after: 17 });
  });

  it("is kept through the weekend by Friday's lift", () => {
    expect(keptThroughAfter("2026-11-13", THREE_DAY_LIFTER, "2026-11-13")).toBe(
      "2026-11-15"
    );
  });
});

describe("a runner with a race taper", () => {
  const runDay = (date: string, dayIndex: number) => ({
    id: `run-${date}`,
    date,
    weekKey: "2026-11-09",
    dayIndex,
    templateId: "easy_run",
    type: "easy",
    status: "planned" as const,
  });
  /** Runs Tuesday, Thursday, Saturday and Sunday; the taper week before
   *  Sunday 15 November's 10K holds Tuesday's run and the race. */
  const RACER: StreakPlan = {
    profile: {
      weekSchedule: week("run", "rest", "run", "rest", "run", "rest", "run"),
    },
    startKey: "2026-09-01",
    programState: {
      runDays: [runDay("2026-11-10", 2), runDay("2026-11-15", 0)],
      runPlan: {
        mode: "race_prep",
        raceGoal: { distance: "10k", targetDate: "2026-11-15" },
      },
    } as unknown as ProgramState,
  };
  /** Last week's four runs and this week's Tuesday. */
  const RUNS = [
    "2026-11-03",
    "2026-11-05",
    "2026-11-07",
    "2026-11-08",
    "2026-11-10",
  ];

  it("rests through the days the taper dropped, up to the race", () => {
    // Saturday 14, the eve of the race, with nothing logged since Tuesday.
    const state = streakOn(RACER, RUNS, "2026-11-14");
    // Tuesday 3 to Saturday 14: 12 days, five of them runs.
    expect(state.live.streak).toBe(12);
    expect(state.live.bridgedDates).toEqual([]);
    expect(keptThroughAfter("2026-11-10", RACER, "2026-11-14")).toBe(
      "2026-11-14"
    );
    // Race morning, before the race is logged: still 12.
    expect(streakOn(RACER, RUNS, "2026-11-15").live.streak).toBe(12);
  });

  it("read from the pattern alone, the dropped runs would have been days missed", () => {
    // Thursday 12 and Saturday 14 hold runs in the pattern: the first is
    // forgiven, the second ends the streak by race morning.
    const pattern: StreakPlan = { ...RACER, programState: null };
    expect(streakOn(pattern, RUNS, "2026-11-15").live.streak).toBe(0);
  });
});

describe("an account with no plan", () => {
  it("has no rest days: the lifts alone hold three days, as under Streak1", () => {
    const state = streakOn(NO_PLAN, LIFTS, "2026-11-11");
    // Wednesday, Tuesday forgiven, Monday; Sunday a second gap in the week.
    expect(state.live.streak).toBe(3);
    expect(state.live.restDates).toEqual([]);
  });

  it("is the walk without rest days, day for day", () => {
    const logged = new Set(LIFTS);
    expect(streakOn(NO_PLAN, LIFTS, "2026-11-12").live).toEqual(
      computeStreakSpan(logged, at("2026-11-12"))
    );
  });
});
