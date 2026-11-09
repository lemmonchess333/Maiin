/**
 * The widgets' snapshot says what Home says (Wid1). Each state the Today
 * widget draws (W8b: a session to do, done today, a rest day, tomorrow, no
 * plan) comes from the same `TodaySession` Home's hero draws, so these
 * build a session the way `todaySession` returns one and read the words.
 */
import { describe, it, expect } from "vitest";
import type { TodaySession } from "@/lib/todaySession";
import type { WorkoutDay } from "@/features/program/programTypes";
import type { WeekStripDay } from "@/lib/weekStripDays";
import {
  homeWidgetSnapshot,
  raceCountdown,
  servingLabel,
  widgetToday,
  widgetTomorrow,
  type HomeWidgetInput,
} from "@/lib/homeWidgetSnapshot";
import {
  DAY_KEYS,
  FOOD_KEYS,
  SNAPSHOT_KEYS,
  STREAK_KEYS,
  WATER_KEYS,
  WEEK_KEYS,
  widgetAccount,
} from "@/lib/homeWidgetContract";
import { widgetRoute } from "@/lib/widgetLinks";

// A Wednesday, with Thursday after it and Saturday three days on.
const WEDNESDAY = "2026-11-11";
const THURSDAY = "2026-11-12";
const SATURDAY = "2026-11-14";

const UPPER: WorkoutDay = {
  dayName: "Upper — Chest & Back",
  dayType: "upper",
  completed: false,
  exercises: [
    { exerciseId: "bench-press", name: "Bench Press", sets: 3, reps: 8 },
    { exerciseId: "barbell-row", name: "Barbell Row", sets: 3, reps: 8 },
  ] as WorkoutDay["exercises"],
};

function session(over: Partial<TodaySession> = {}): TodaySession {
  return {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: null,
    next: null,
    ...over,
  };
}

const liftToday = (status: "planned" | "completed" | "skipped" = "planned") =>
  session({
    type: "lift",
    lift: {
      workout: UPPER,
      index: 0,
      dayTarget: "/program?day=0",
      startTarget: "/program?day=0&start=1",
      name: "Upper A",
      isStartable: status === "planned",
      status,
      muscleGroups: "Chest · Back",
    },
  });

const runToday = (completed = false) =>
  session({
    type: "run",
    run: {
      runDay: {
        id: "r1",
        date: WEDNESDAY,
        dayIndex: 3,
        templateId: "long_15k",
        status: completed ? "completed_exact" : "planned",
      } as never,
      startTarget: "/run?template=long_15k",
      completed,
      isFirst: false,
      dose: "15 km · about 100 min",
      name: "Long 15K",
    },
  });

const TOMORROW_RUN = {
  label: "Long 18K",
  target: `/program?tab=run&rday=${THURSDAY}`,
  dateKey: THURSDAY,
  daysAhead: 1,
  sport: "run" as const,
};

const STRIP: WeekStripDay[] = [
  "lift-done",
  "missed",
  "planned",
  "planned",
  "rest",
  "planned",
  "rest",
].map((state, i) => ({
  key: `2026-11-${String(9 + i).padStart(2, "0")}`,
  sType: i === 3 ? "run" : i === 5 ? "both" : "lift",
  state: state as WeekStripDay["state"],
  isToday: i === 2,
  isPast: i < 2,
  liftCompleted: false,
  liftSkipped: false,
  liftLogged: false,
  runDone: false,
  runSkipped: false,
}));

function input(over: Partial<HomeWidgetInput> = {}): HomeWidgetInput {
  return {
    todayKey: WEDNESDAY,
    nowMs: 1_762_850_000_000,
    uid: "user-1",
    session: session(),
    freeRunLine: null,
    planPosition: null,
    strip: STRIP,
    week: { done: 1, of: 5 },
    hasPlan: true,
    freeRunner: false,
    raceGoal: null,
    distanceUnit: "km",
    streak: { days: 12, best: 20, loggedToday: true },
    food: { eaten: 1240.4, target: 2400, protein: 62, proteinTarget: 140 },
    water: { ml: 750, targetMl: 2000, servingMl: 250, drinkIds: ["d1"] },
    ...over,
  };
}

describe("the Today widget's day", () => {
  it("a lift to do: its name, its muscles in words and its minutes, as Home's hero says them", () => {
    const today = widgetToday(input({ session: liftToday() }));
    expect(today).toMatchObject({
      state: "planned",
      sport: "lift",
      kicker: "Today",
      title: "Upper A",
      focus: "Chest and back",
      line: "Today · Upper A",
      link: "/program?day=0",
    });
    expect(today.minutes).toMatch(/^about \d+ min$/);
  });

  it("a run to do: its distance and minutes from its dose", () => {
    const today = widgetToday(input({ session: runToday() }));
    expect(today).toMatchObject({
      state: "planned",
      sport: "run",
      title: "Long 15K",
      focus: "15 km",
      minutes: "about 100 min",
      line: "Today · Long 15K",
      link: `/program?tab=run&rday=${WEDNESDAY}`,
    });
  });

  it("done today: names what was done, and tomorrow's on the Lock Screen line", () => {
    const today = widgetToday(
      input({ session: { ...liftToday("completed"), next: TOMORROW_RUN } })
    );
    expect(today).toMatchObject({
      state: "done",
      kicker: "Done today",
      title: "Upper A",
      next: "Long 18K tomorrow",
      line: "Tomorrow · Long 18K",
      link: TOMORROW_RUN.target,
    });
  });

  it("a skipped session says so, in the same neutral register", () => {
    expect(widgetToday(input({ session: liftToday("skipped") }))).toMatchObject(
      { state: "done", kicker: "Skipped today", line: "Skipped today" }
    );
  });

  it("a day with two: the one still to do leads, with how many are done", () => {
    const both = session({
      type: "both",
      lift: liftToday("completed").lift,
      run: runToday().run,
    });
    expect(widgetToday(input({ session: both }))).toMatchObject({
      state: "planned",
      sport: "run",
      kicker: "1 of 2 done today",
      title: "Long 15K",
    });
  });

  it("a rest day names the next session, on another weekday by its name", () => {
    const today = widgetToday(
      input({
        session: session({
          rest: { kind: "rest", tomorrow: null },
          next: {
            label: "Pull B",
            target: "/program?day=1",
            dateKey: SATURDAY,
            daysAhead: 3,
            sport: "lift",
          },
        }),
      })
    );
    expect(today).toMatchObject({
      state: "rest",
      title: "Rest day",
      next: "Pull B on Saturday",
      line: "Saturday · Pull B",
      link: "/program?day=1",
    });
  });

  it("a new lifter's first workout and a free runner's day are named as Home names them", () => {
    const first = widgetToday(
      input({
        session: session({
          rest: {
            kind: "first-workout",
            workout: UPPER,
            index: 0,
            dayTarget: "/program?day=0",
            startTarget: "/program?day=0&start=1",
            name: "Upper A",
          },
        }),
      })
    );
    expect(first).toMatchObject({
      state: "planned",
      kicker: "Your first workout",
      title: "Upper A",
    });
    const free = widgetToday(
      input({
        session: session({
          rest: { kind: "free-run", startTarget: "/run?startOnArrival=1" },
        }),
        freeRunLine: {
          title: "12.4 km this week",
          detail: "18.2 km last week",
          mark: "run",
        },
      })
    );
    expect(free).toMatchObject({
      state: "planned",
      sport: "run",
      kicker: "Run when it suits you",
      title: "Free run",
      focus: "12.4 km this week",
    });
  });

  it("no plan, and a lifting day with no workout linked, say what to do in the app", () => {
    expect(widgetToday(input({ hasPlan: false }))).toMatchObject({
      state: "no-plan",
      title: "No plan yet",
      link: "/program",
    });
    expect(
      widgetToday(
        input({
          session: session({
            type: "lift",
            lift: { ...liftToday().lift!, workout: null },
          }),
        })
      )
    ).toMatchObject({ state: "no-plan", title: "Check your lifting plan" });
  });
});

describe("tomorrow, so the widget turns over at midnight with the app asleep", () => {
  it("names tomorrow's session as today's", () => {
    const tomorrow = widgetTomorrow(
      input({ session: { ...liftToday(), next: TOMORROW_RUN } })
    );
    expect(tomorrow).toMatchObject({
      date: THURSDAY,
      state: "planned",
      sport: "run",
      title: "Long 18K",
      line: "Today · Long 18K",
      link: TOMORROW_RUN.target,
    });
  });

  it("a rest tomorrow counts the next session from tomorrow", () => {
    const tomorrow = widgetTomorrow(
      input({
        session: session({
          next: {
            label: "Pull B",
            target: "/program?day=1",
            dateKey: SATURDAY,
            daysAhead: 3,
            sport: "lift",
          },
        }),
      })
    );
    expect(tomorrow).toMatchObject({
      state: "rest",
      next: "Pull B on Saturday",
      line: "Saturday · Pull B",
    });
    const dayBefore = widgetTomorrow(
      input({
        session: session({
          next: {
            label: "Pull B",
            target: "/program?day=1",
            dateKey: "2026-11-13",
            daysAhead: 2,
            sport: "lift",
          },
        }),
      })
    );
    expect(dayBefore).toMatchObject({
      next: "Pull B tomorrow",
      line: "Tomorrow · Pull B",
    });
  });
});

describe("a race goal's countdown folds into the day", () => {
  const marathon = { distance: "marathon", targetDate: "2026-12-07" };

  it("counts calendar days to race day, and stops after it", () => {
    expect(raceCountdown(marathon, WEDNESDAY)).toBe("26 days to your marathon");
    expect(raceCountdown(marathon, "2026-12-06")).toBe(
      "Your marathon is tomorrow"
    );
    expect(raceCountdown(marathon, "2026-12-07")).toBe(
      "Your marathon is today"
    );
    expect(raceCountdown(marathon, "2026-12-08")).toBe("");
    expect(raceCountdown(null, WEDNESDAY)).toBe("");
    expect(
      raceCountdown({ distance: "10k", targetDate: "2026-11-21" }, WEDNESDAY)
    ).toBe("10 days to your 10K");
  });

  it("is written for today and for tomorrow", () => {
    const snapshot = homeWidgetSnapshot(input({ raceGoal: marathon }));
    expect(snapshot.days.map((d) => d.race)).toEqual([
      "26 days to your marathon",
      "25 days to your marathon",
    ]);
  });
});

describe("the snapshot", () => {
  it("writes every key the contract names, and no other", () => {
    const snapshot = homeWidgetSnapshot(input({ session: liftToday() }));
    expect(Object.keys(snapshot).sort()).toEqual([...SNAPSHOT_KEYS].sort());
    for (const day of snapshot.days)
      expect(Object.keys(day).sort()).toEqual([...DAY_KEYS].sort());
    expect(Object.keys(snapshot.week!).sort()).toEqual([...WEEK_KEYS].sort());
    expect(Object.keys(snapshot.streak!).sort()).toEqual(
      [...STREAK_KEYS].sort()
    );
    expect(Object.keys(snapshot.food!).sort()).toEqual([...FOOD_KEYS].sort());
    expect(Object.keys(snapshot.water!).sort()).toEqual([...WATER_KEYS].sort());
  });

  it("writes each day's tap as the address that opens its page", () => {
    const snapshot = homeWidgetSnapshot(
      input({ session: { ...liftToday(), next: TOMORROW_RUN } })
    );
    expect(snapshot.days.map((d) => d.link)).toEqual([
      "https://troposfit.com/program?day=0&from=widget",
      `https://troposfit.com/program?tab=run&rday=${THURSDAY}&from=widget`,
    ]);
    for (const day of snapshot.days)
      expect(widgetRoute(day.link)).not.toBeNull();
  });

  it("carries the account as a tag, never the uid", () => {
    const snapshot = homeWidgetSnapshot(input());
    expect(snapshot.account).toBe(widgetAccount("user-1"));
    expect(snapshot.account).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(snapshot)).not.toContain("user-1");
    expect(widgetAccount("user-2")).not.toBe(snapshot.account);
  });

  it("draws the week as Home's strip does, a planned day carrying its sport", () => {
    expect(homeWidgetSnapshot(input()).week).toEqual({
      start: "2026-11-09",
      segments: [
        "lift-done",
        "missed",
        "planned-lift",
        "planned-run",
        "rest",
        "planned-both",
        "rest",
      ],
      done: 1,
      of: 5,
      summary: "1 of 5 sessions this week",
    });
    expect(
      homeWidgetSnapshot(input({ week: { done: 1, of: null } })).week?.summary
    ).toBe("1 session this week");
  });

  it("keeps a streak's next day only when today is logged (the today/yesterday rule)", () => {
    expect(homeWidgetSnapshot(input()).streak).toEqual({
      date: WEDNESDAY,
      days: 12,
      best: 20,
      loggedToday: true,
      nextDay: 12,
    });
    expect(
      homeWidgetSnapshot(
        input({ streak: { days: 12, best: 20, loggedToday: false } })
      ).streak?.nextDay
    ).toBeNull();
  });

  it("writes whole numbers for food and water, and names the water step", () => {
    const snapshot = homeWidgetSnapshot(input());
    expect(snapshot.food?.eaten).toBe(1240);
    expect(snapshot.water).toEqual({
      date: WEDNESDAY,
      ml: 750,
      targetMl: 2000,
      servingMl: 250,
      servingLabel: "Glass",
      drinkIds: ["d1"],
    });
    expect(servingLabel(500)).toBe("Bottle");
    expect(servingLabel(330)).toBe("330 ml");
  });

  it("leaves out what Home could not read, rather than write a zero", () => {
    const snapshot = homeWidgetSnapshot(
      input({ streak: null, food: null, water: null, strip: [] })
    );
    expect(snapshot.streak).toBeNull();
    expect(snapshot.food).toBeNull();
    expect(snapshot.water).toBeNull();
    expect(snapshot.week).toBeNull();
  });
});
