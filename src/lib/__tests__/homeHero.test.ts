import { describe, expect, it } from "vitest";
import {
  FIRST_BODYWEIGHT_STEP,
  FIRST_LIFT_STEP,
  focusPhrase,
  freeRunHeroLine,
  heroIsFreeRun,
  heroKicker,
  heroLead,
  heroLeadExercise,
  liftHeroLine,
  nextSessionLine,
  planPosition,
  runHeroLine,
  weekSessions,
  type HeroExercise,
} from "../homeHero";
import {
  liftTargets,
  runStartTarget,
  type TodayLift,
  type TodayRun,
  type TodaySession,
} from "../todaySession";
import { sessionLeadArt } from "../formArtCutouts";
import { liftPlanWeek } from "../liftWeekLabel";
import { RUN_TEMPLATES } from "../workoutTemplates";
import type { ProgramState } from "@/features/program/programTypes";

/**
 * Home's hero, decided without the page. Every date is a key passed in;
 * the module reads no clock. 27 September 2026 is a Sunday.
 */
const TODAY = "2026-09-27";

const WORKOUT = {
  dayName: "Pull A",
  dayType: "pull",
  exercises: [],
  completed: false,
} as unknown as NonNullable<TodayLift["workout"]>;

function lift(extra: Partial<TodayLift> = {}): TodayLift {
  return {
    workout: WORKOUT,
    index: 0,
    ...liftTargets(0),
    isStartable: true,
    status: "planned",
    muscleGroups: "",
    ...extra,
  };
}

function run(extra: Partial<TodayRun> = {}): TodayRun {
  return {
    runDay: null,
    startTarget: runStartTarget(null),
    completed: false,
    isFirst: false,
    dose: null,
    ...extra,
  };
}

function day(extra: Partial<TodaySession>): TodaySession {
  return {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: null,
    ...extra,
  };
}

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;

describe("which session the hero draws", () => {
  it("the lift on a day with both, the run when running is the aim", () => {
    const both = day({ type: "both", lift: lift(), run: run() });
    expect(heroLead(both)).toBe("lift");
    expect(heroLead({ ...both, runFirst: true })).toBe("run");
  });

  it("the run when the lifting day has no workout to draw", () => {
    expect(
      heroLead(day({ type: "both", lift: lift({ workout: null }), run: run() }))
    ).toBe("run");
    expect(heroLead(day({ type: "lift", lift: lift({ workout: null }) }))).toBe(
      null
    );
  });

  it("a rest day's offer by its kind", () => {
    expect(heroLead(day({ rest: { kind: "rest", tomorrow: null } }))).toBe(
      "rest"
    );
    expect(heroLead(day({ rest: { kind: "first-meal" } }))).toBe("first-meal");
    expect(
      heroLead(
        day({
          rest: { kind: "free-run", startTarget: runStartTarget(null) },
        })
      )
    ).toBe("run");
    expect(
      heroLead(
        day({
          rest: {
            kind: "first-workout",
            workout: WORKOUT,
            index: 0,
            ...liftTargets(0),
          },
        })
      )
    ).toBe("lift");
  });
});

describe("the plan's position, beside the date", () => {
  it("a training block's week", () => {
    const state = {
      weekNumber: 9,
      trainingBlock: { startDate: "2026-09-07", durationWeeks: 12 },
    } as unknown as ProgramState;
    expect(planPosition(state, TODAY)).toBe("Week 3 of 12");
    expect(liftPlanWeek(state, TODAY)).toMatchObject({ week: 3, weeks: 12 });
  });

  it("a race plan's week", () => {
    const state = {
      runPlan: {
        mode: "race_prep",
        currentWeek: 8,
        totalWeeks: 12,
        raceGoal: { distance: "half", targetDate: "2026-11-29" },
      },
    } as unknown as ProgramState;
    expect(planPosition(state, TODAY)).toBe("Week 9 of 12");
    // The week Train's lifting counts during the race plan, so the two
    // screens say one number.
    const lifting = liftPlanWeek(state, TODAY);
    expect(lifting).not.toBeNull();
    expect(planPosition(state, TODAY)).toBe(
      `Week ${lifting!.week} of ${lifting!.weeks}`
    );
  });

  it("nothing for a plan with no length, or no plan", () => {
    // "Week 7" alone says nothing about where the plan ends.
    expect(
      planPosition({ weekNumber: 7 } as unknown as ProgramState, TODAY)
    ).toBeNull();
    expect(planPosition(null, TODAY)).toBeNull();
  });

  it("nothing once race day has passed with no recovery", () => {
    const state = {
      runPlan: {
        mode: "race_prep",
        currentWeek: 11,
        totalWeeks: 12,
        raceGoal: { distance: "half", targetDate: "2026-09-20" },
      },
    } as unknown as ProgramState;
    expect(planPosition(state, TODAY)).toBeNull();
  });
});

describe("the kicker beside the date", () => {
  it("is the plan's position on an ordinary day", () => {
    expect(
      heroKicker(day({ type: "lift", lift: lift() }), "Week 9 of 12")
    ).toBe("Week 9 of 12");
    expect(heroKicker(day({ type: "lift", lift: lift() }), null)).toBeNull();
  });

  it("names a new person's first session in its place", () => {
    const firstWorkout = day({
      rest: {
        kind: "first-workout",
        workout: WORKOUT,
        index: 0,
        ...liftTargets(0),
      },
    });
    expect(heroKicker(firstWorkout, "Week 1 of 8")).toBe("Your first workout");
    expect(
      heroKicker(day({ type: "run", run: run({ isFirst: true }) }), null)
    ).toBe("Your first run");
  });

  it("never calls a lifting day's workout the first (ADR-0002)", () => {
    // Only the run's first is named: a lift's is the rotation's call, and
    // Home resolves it by weekday.
    expect(
      heroKicker(
        day({ type: "both", lift: lift(), run: run({ isFirst: true }) }),
        null
      )
    ).toBeNull();
  });

  it("tells a free runner the day's run is theirs to place", () => {
    expect(
      heroKicker(
        day({
          rest: { kind: "free-run", startTarget: runStartTarget(null) },
        }),
        "Week 2 of 8"
      )
    ).toBe("Run when it suits you");
  });
});

describe("the lift line: today's lead lift against last time", () => {
  const row = (extra: Partial<HeroExercise> = {}): HeroExercise => ({
    name: "Barbell row",
    exerciseId: "barbell-row",
    sets: 3,
    reps: 8,
    weight: 35,
    lastPerformance: { sets: 3, reps: 8, weight: 32.5, completed: true },
    ...extra,
  });

  it("says how much heavier, in the lifter's unit", () => {
    expect(liftHeroLine([row()], "kg")).toEqual({
      title: "Barbell row 35 kg × 8",
      detail: "2.5 kg more than last time",
      mark: "up",
    });
    expect(liftHeroLine([row()], "lbs")).toEqual({
      title: "Barbell row 77.2 lb × 8",
      detail: "5.5 lb more than last time",
      mark: "up",
    });
  });

  it("says a lighter weight plainly", () => {
    expect(
      liftHeroLine(
        [
          row({
            weight: 30,
            lastPerformance: { sets: 3, reps: 8, weight: 35, completed: false },
          }),
        ],
        "kg"
      )
    ).toMatchObject({ detail: "5 kg less than last time", mark: "down" });
  });

  it("compares the reps at the same weight", () => {
    const at = (reps: number, lastReps: number) =>
      liftHeroLine(
        [
          row({
            reps,
            weight: 35,
            lastPerformance: {
              sets: 3,
              reps: lastReps,
              weight: 35,
              completed: true,
            },
          }),
        ],
        "kg"
      );
    expect(at(9, 8)).toMatchObject({
      detail: "1 rep more than last time",
      mark: "up",
    });
    expect(at(8, 10)).toMatchObject({
      detail: "2 reps fewer than last time",
      mark: "down",
    });
    expect(at(8, 8)).toMatchObject({
      detail: "Same as last time",
      mark: "same",
    });
  });

  it("counts a bodyweight lift's reps and a hold's seconds", () => {
    expect(
      liftHeroLine(
        [
          row({
            name: "Pull-up",
            exerciseId: "pull-up",
            weight: 0,
            reps: 7,
            lastPerformance: { sets: 3, reps: 6, weight: 0, completed: true },
          }),
        ],
        "kg"
      )
    ).toEqual({
      title: "Pull-up × 7",
      detail: "1 rep more than last time",
      mark: "up",
    });
    expect(
      liftHeroLine(
        [
          row({
            name: "Plank",
            exerciseId: "plank",
            weight: 0,
            reps: 40,
            repUnit: "seconds",
            lastPerformance: { sets: 3, reps: 30, weight: 0, completed: true },
          }),
        ],
        "kg"
      )
    ).toEqual({
      title: "Plank 40 s",
      detail: "10 s longer than last time",
      mark: "up",
    });
  });

  it("with no last time, the day's size and the first session's step", () => {
    expect(
      liftHeroLine(
        [
          row({ lastPerformance: null }),
          row({ name: "Lat pulldown", lastPerformance: null, sets: 3 }),
          row({ name: "Curl", lastPerformance: null, sets: 2 }),
        ],
        "kg"
      )
    ).toEqual({
      title: "3 exercises · 8 sets",
      detail: FIRST_LIFT_STEP,
      mark: "lift",
    });
    expect(FIRST_LIFT_STEP).toBe(
      "Pick a weight you could lift 3 more times than the reps ask."
    );
    expect(liftHeroLine([], "kg")).toBeNull();
  });

  it("with nothing to load, asks for the reps in reserve, not a weight", () => {
    // A no-equipment day: push-ups, the inverted row, a pike push-up.
    const bodyweight = (name: string, exerciseId: string) =>
      row({ name, exerciseId, weight: 0, lastPerformance: null });
    const day = [
      bodyweight("Push-Ups", "push-ups"),
      bodyweight("Inverted Row", "inverted-row"),
      bodyweight("Pike Push-Up", "pike-push-up"),
    ];
    expect(liftHeroLine(day, "kg")?.detail).toBe(FIRST_BODYWEIGHT_STEP);
    expect(FIRST_BODYWEIGHT_STEP).toBe(
      "Stop each set when you could do 3 more reps."
    );
    // One lift with a weight to pick, and the step is the weight's.
    expect(
      liftHeroLine([...day, row({ lastPerformance: null })], "kg")?.detail
    ).toBe(FIRST_LIFT_STEP);
  });

  it("is about the lift the picture shows", () => {
    const exercises: HeroExercise[] = [
      { name: "No art", exerciseId: "not-a-real-exercise" },
      row(),
    ];
    const art = sessionLeadArt(exercises);
    expect(heroLeadExercise(exercises)?.name).toBe(
      art?.exerciseName ?? "No art"
    );
    expect(heroLeadExercise([{ name: "Only one" }])?.name).toBe("Only one");
  });

  it("is about the day's main lift when an accessory is drawn first", () => {
    const pullA: HeroExercise[] = [
      { name: "Straight-Arm Pulldown", exerciseId: "straight-arm-pulldown" },
      row(),
    ];
    expect(heroLeadExercise(pullA)?.exerciseId).toBe("barbell-row");
    expect(sessionLeadArt(pullA)?.exerciseName).toBe(
      heroLeadExercise(pullA)?.name
    );
  });
});

describe("the run line: the run in its own numbers", () => {
  it("an interval session's repeats and the rest between", () => {
    const intervals = RUN_TEMPLATES.find((t) => t.type === "intervals")!;
    const line = runHeroLine(intervals, null, "km");
    expect(line?.title).toMatch(/^\d+ × /);
    expect(line?.detail).toMatch(/ easy between$/);
    expect(line?.mark).toBe("run");
  });

  it("a tempo's minutes at effort", () => {
    expect(runHeroLine(template("tempo_20"), null, "km")).toEqual({
      title: expect.stringMatching(/^\d+ min comfortably hard$/),
      detail: "An easy warm-up and cool-down",
      mark: "run",
    });
  });

  it("an easy run's pace, only from a confirmed benchmark", () => {
    const easy = template("easy_30");
    expect(runHeroLine(easy, 370, "km")).toEqual({
      title: "About 6:10 /km",
      detail: "Your confirmed easy pace",
      mark: "run",
    });
    expect(runHeroLine(easy, null, "km")).toBeNull();
    expect(runHeroLine(null, 370, "km")).toBeNull();
  });

  it("a run-walk's runs", () => {
    const runWalk = template("run_walk_1");
    expect(runHeroLine(runWalk, null, "km")?.title).toMatch(/running|runs/);
  });
});

describe("a free run, with no planned run to describe", () => {
  it("is the free runner's rest-day offer, or a run day with nothing written", () => {
    expect(
      heroIsFreeRun(
        day({ rest: { kind: "free-run", startTarget: runStartTarget(null) } })
      )
    ).toBe(true);
    expect(heroIsFreeRun(day({ type: "run", run: run({ name: null }) }))).toBe(
      true
    );
  });

  it("is not a planned run, nor a run under a lift that leads", () => {
    expect(
      heroIsFreeRun(day({ type: "run", run: run({ name: "Easy 30" }) }))
    ).toBe(false);
    expect(
      heroIsFreeRun(
        day({ type: "both", lift: lift(), run: run({ name: null }) })
      )
    ).toBe(false);
    expect(heroIsFreeRun(day({ rest: { kind: "rest", tomorrow: null } }))).toBe(
      false
    );
  });
});

describe("the free run line: this week's distance against last week's", () => {
  // TODAY is Sunday 27 September: this week runs from Monday the 21st,
  // last week from the 14th to the 20th.
  const runs = [
    { day: "2026-09-12", distance: 9_000 }, // the week before: not counted
    { day: "2026-09-15", distance: 10_000 },
    { day: "2026-09-19", distance: 8_200 },
    { day: "2026-09-22", distance: 5_000 },
    { day: "2026-09-26", distance: 7_400 },
  ];

  it("gives this week's distance and last week's beside it", () => {
    expect(
      freeRunHeroLine({ runs, todayKey: TODAY, unit: "km", first: false })
    ).toEqual({
      title: "12.4 km this week",
      detail: "18.2 km last week",
      mark: "run",
    });
  });

  it("draws an empty week at zero, against last week", () => {
    expect(
      freeRunHeroLine({
        runs: runs.filter((r) => r.day < "2026-09-21"),
        todayKey: TODAY,
        unit: "km",
        first: false,
      })
    ).toEqual({
      title: "0 km this week",
      detail: "18.2 km last week",
      mark: "run",
    });
  });

  it("counts the runs when last week had none to compare with", () => {
    expect(
      freeRunHeroLine({
        runs: runs.filter((r) => r.day >= "2026-09-21"),
        todayKey: TODAY,
        unit: "km",
        first: false,
      })
    ).toEqual({
      title: "12.4 km this week",
      detail: "2 runs so far",
      mark: "run",
    });
    expect(
      freeRunHeroLine({
        runs: [{ day: "2026-09-27", distance: 5_000 }],
        todayKey: TODAY,
        unit: "km",
        first: false,
      })?.detail
    ).toBe("1 run so far");
  });

  it("is a first step, with the week at zero, before the first run", () => {
    expect(
      freeRunHeroLine({ runs: [], todayKey: TODAY, unit: "km", first: true })
    ).toEqual({
      title: "0 km this week",
      detail: "Finish your first run and it counts here",
      mark: "run",
    });
    // Back after a fortnight away: the same step, without "first".
    expect(
      freeRunHeroLine({
        runs: [{ day: "2026-09-12", distance: 9_000 }],
        todayKey: TODAY,
        unit: "km",
        first: false,
      })?.detail
    ).toBe("Finish a run and it counts here");
  });

  it("speaks the reader's unit", () => {
    expect(
      freeRunHeroLine({
        runs: [{ day: "2026-09-22", distance: 8_046.72 }],
        todayKey: TODAY,
        unit: "mi",
        first: false,
      })?.title
    ).toBe("5.0 mi this week");
  });

  it("says nothing while the runs are read", () => {
    expect(
      freeRunHeroLine({ runs: null, todayKey: TODAY, unit: "km", first: false })
    ).toBeNull();
  });
});

describe("the muscles as words", () => {
  it("joins two with and, three with commas, and says when there are more", () => {
    expect(focusPhrase("Back · Biceps")).toBe("Back and biceps");
    expect(focusPhrase("Chest · Back · Shoulders")).toBe(
      "Chest, back and shoulders"
    );
    expect(focusPhrase("Back · Shoulders · Legs + more")).toBe(
      "Back, shoulders, legs and more"
    );
    expect(focusPhrase("Legs")).toBe("Legs");
    expect(focusPhrase("")).toBe("");
  });
});

describe("the week's sessions", () => {
  it("done out of planned, lifts and runs together", () => {
    expect(
      weekSessions({
        lifts: { done: 2, planned: 3 },
        runs: { done: 2, planned: 3 },
      })
    ).toEqual({ done: 4, of: 6 });
  });

  it("counts the done in a discipline that plans nothing", () => {
    // A lifting plan, with a run done beside it: 2 of 4, not 2 of 3.
    expect(
      weekSessions({
        lifts: { done: 1, planned: 3 },
        runs: { done: 1, planned: null },
      })
    ).toEqual({ done: 2, of: 4 });
  });

  it("is a count alone for a week that plans nothing", () => {
    expect(
      weekSessions({
        lifts: { done: 0, planned: null },
        runs: { done: 2, planned: null },
      })
    ).toEqual({ done: 2, of: null });
  });
});

describe("the next session beside the week", () => {
  const lifting = day({ type: "lift", lift: lift() });

  it("tomorrow, or the weekday", () => {
    expect(
      nextSessionLine(
        { label: "Long 6K", target: "", dateKey: "2026-09-28", daysAhead: 1 },
        lifting
      )
    ).toBe("Long 6K tomorrow");
    expect(
      nextSessionLine(
        { label: "Lower A", target: "", dateKey: "2026-10-01", daysAhead: 4 },
        lifting
      )
    ).toBe("Lower A on Thursday");
    expect(nextSessionLine(null, lifting)).toBeNull();
  });

  it("nothing on a rest day whose hero already names it", () => {
    const next = {
      label: "Pull A",
      target: "/program?day=0",
      dateKey: "2026-09-28",
      daysAhead: 1,
    };
    expect(
      nextSessionLine(
        next,
        day({
          rest: {
            kind: "rest",
            tomorrow: { label: "Pull A", target: "/program?day=0" },
          },
        })
      )
    ).toBeNull();
  });
});
