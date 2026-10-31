import { describe, it, expect } from "vitest";
import {
  FIRST_SET_BODY_NO_AUTO_REST,
  FOOD_STOP_BODY,
  GUIDE_HINTS,
  guideAllowed,
  guideHintsUnlocked,
  guideRequest,
  hintDue,
  hintSeenKey,
  rowStop,
  foodStopBody,
  todayAbout,
  todayCard,
  todayCardTarget,
  walkOffered,
  walkStops,
  type TodayCard,
} from "../firstGuide";
import type { TodaySession } from "../todaySession";
import type { WorkoutDay } from "@/features/program/programTypes";
import { cardSessionMinutes } from "@/features/program/expressSession";
import { group } from "@/test/localeGrouping";
import { liftTargets, runStartTarget } from "@/lib/todaySession";

const workout = {
  name: "Full Body Circuit A",
  exercises: [],
} as unknown as WorkoutDay;

const sessions: Record<TodayCard, TodaySession> = {
  lift: {
    type: "lift",
    restContext: {},
    lift: {
      workout,
      index: 0,
      ...liftTargets(0),
      isStartable: true,
      status: "today" as never,
      muscleGroups: "Legs · Chest · Back",
    },
    run: null,
    rest: null,
  },
  run: {
    type: "run",
    restContext: {},
    lift: null,
    run: {
      runDay: null,
      startTarget: runStartTarget(null),
      completed: false,
      isFirst: true,
      dose: null,
    },
    rest: null,
  },
  "first-workout": {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: {
      kind: "first-workout",
      workout,
      index: 0,
      ...liftTargets(0),
      ...liftTargets(0),
    },
  },
  "free-run": {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: { kind: "free-run", startTarget: runStartTarget(null) },
  },
  "first-meal": {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: { kind: "first-meal" },
  },
  rest: {
    type: "rest",
    restContext: {},
    lift: null,
    run: null,
    rest: { kind: "rest", tomorrow: null },
  },
};

describe("todayCard", () => {
  it("names the first card the session stack draws", () => {
    for (const [card, session] of Object.entries(sessions))
      expect(todayCard(session)).toBe(card);
  });

  it("leads with the lift on a day with both, as the stack does", () => {
    expect(
      todayCard({ ...sessions.lift, type: "both", run: sessions.run.run })
    ).toBe("lift");
  });

  it("points at the run when the lifting day has no workout linked", () => {
    const noWorkout: TodaySession = {
      ...sessions.lift,
      type: "both",
      lift: { ...sessions.lift.lift!, workout: null },
      run: sessions.run.run,
    };
    expect(todayCard(noWorkout)).toBe("run");
    expect(todayCard({ ...noWorkout, type: "lift", run: null })).toBeNull();
  });

  it("maps each card to the stop the stack marks it with", () => {
    expect(todayCardTarget("lift")).toBe("today-lift");
    expect(todayCardTarget("first-workout")).toBe("today-lift");
    expect(todayCardTarget("run")).toBe("today-run");
    expect(todayCardTarget("free-run")).toBe("today-run");
    expect(todayCardTarget("rest")).toBe("today-rest");
  });
});

describe("walkStops", () => {
  it("walks today's session, the first week, then food", () => {
    const stops = walkStops({ today: "lift", firstWeekItems: 4 });
    expect(stops.map((s) => s.id)).toEqual(["today", "first-week", "food"]);
    expect(stops.map((s) => s.target)).toEqual([
      "today-lift",
      "first-week",
      "food",
    ]);
    expect(stops[0].title).toBe("Today’s workout");
    expect(stops[1].body).toMatch(
      /^Four things to do in your first seven days\./
    );
    expect(stops[2].body).toBe(FOOD_STOP_BODY);
  });

  it("says how many things the card lists, in words", () => {
    expect(walkStops({ today: "run", firstWeekItems: 3 })[1].body).toMatch(
      /^Three things to do/
    );
    expect(walkStops({ today: "run", firstWeekItems: 2 })[1].body).toMatch(
      /^Two things to do/
    );
  });

  it("leaves out the first-week stop when the card isn't showing", () => {
    expect(
      walkStops({ today: "rest", firstWeekItems: 0 }).map((s) => s.id)
    ).toEqual(["today", "food"]);
  });

  it("leaves the first meal to the Food stop", () => {
    expect(
      walkStops({ today: "first-meal", firstWeekItems: 3 }).map((s) => s.id)
    ).toEqual(["first-week", "food"]);
  });

  it("still ends on Food when there is no session card to explain", () => {
    expect(walkStops({ today: null, firstWeekItems: 0 })).toHaveLength(1);
  });

  it("says what a run card does on a run day", () => {
    const stop = walkStops({ today: "run", firstWeekItems: 0 })[0];
    expect(stop.title).toBe("Today’s run");
    expect(stop.target).toBe("today-run");
  });
});

/* FV3: the walk talks about this person's plan. Today's stop names the
   session as its card does, and Food's gives today's target. */
describe("today's stop names this person's session", () => {
  const day = {
    dayName: "Full Body — Squat Focus",
    exercises: [
      { exerciseId: "back-squat", name: "Back Squat", sets: 3, reps: 5 },
      { exerciseId: "bench-press", name: "Bench Press", sets: 3, reps: 8 },
      { exerciseId: "barbell-row", name: "Barbell Row", sets: 3, reps: 8 },
    ],
  } as unknown as WorkoutDay;
  const liftDay: TodaySession = {
    ...sessions.lift,
    lift: { ...sessions.lift.lift!, workout: day, name: "Full Body A" },
  };
  const minutes = cardSessionMinutes(day.exercises, {});

  it("names a lift, its size, its minutes and its first exercise", () => {
    const about = todayAbout(liftDay);
    expect(about).toEqual({
      kind: "lift",
      name: "Full Body A",
      exercises: 3,
      minutes,
      first: "Back Squat",
    });
    const stop = walkStops({ today: "lift", firstWeekItems: 0, about })[0];
    expect(stop.title).toBe("Today’s workout");
    expect(stop.body).toBe(
      `Full Body A: 3 exercises, about ${minutes} min, starting with Back Squat. Start takes you through it set by set. Not training today? It stays here until it’s done.`
    );
  });

  it("names a new lifter's first workout the same way", () => {
    const about = todayAbout({
      ...sessions["first-workout"],
      rest: {
        kind: "first-workout",
        workout: day,
        index: 0,
        ...liftTargets(0),
        name: "Full Body A",
      },
    });
    const stop = walkStops({
      today: "first-workout",
      firstWeekItems: 0,
      about,
    })[0];
    expect(stop.body).toMatch(
      /^Full Body A: 3 exercises, about \d+ min, starting with Back Squat\. Start takes you through it set by set, whenever suits you\./
    );
  });

  it("leaves the minutes out when the card shows none", () => {
    const unpriced = {
      ...day,
      exercises: [{ exerciseId: "plank", name: "Plank" }, ...day.exercises],
    } as unknown as WorkoutDay;
    const about = todayAbout({
      ...liftDay,
      lift: { ...liftDay.lift!, workout: unpriced },
    });
    expect(about).toMatchObject({ minutes: null, first: "Plank" });
    expect(
      walkStops({ today: "lift", firstWeekItems: 0, about })[0].body
    ).toMatch(/^Full Body A: 4 exercises, starting with Plank\. /);
  });

  it("names a run and its dose", () => {
    const about = todayAbout({
      ...sessions.run,
      run: { ...sessions.run.run!, name: "Easy 40", dose: "40 min" },
    });
    expect(about).toEqual({ kind: "run", name: "Easy 40", dose: "40 min" });
    expect(walkStops({ today: "run", firstWeekItems: 0, about })[0].body).toBe(
      "Easy 40: 40 min. Start opens the run screen, which records the distance, pace and splits as you go."
    );
  });

  it("names a rest day's next session", () => {
    const about = todayAbout({
      ...sessions.rest,
      rest: {
        kind: "rest",
        tomorrow: { label: "Pull B", target: "/program?day=1" },
      },
    });
    expect(walkStops({ today: "rest", firstWeekItems: 0, about })[0].body).toBe(
      "Your next session, Pull B, shows here tomorrow, with Start to begin it."
    );
  });

  it("keeps the card's own words when there is nothing to name", () => {
    // A free run, a run day with nothing written, a rest day before another.
    expect(todayAbout(sessions["free-run"])).toBeNull();
    expect(todayAbout(sessions.run)).toBeNull();
    expect(todayAbout(sessions.rest)).toBeNull();
    expect(todayAbout(sessions["first-meal"])).toBeNull();
    // An empty workout has no first exercise to name.
    expect(todayAbout(sessions.lift)).toBeNull();
    expect(walkStops({ today: "rest", firstWeekItems: 0 })[0].body).toBe(
      "Your next session shows here on its day, with Start to begin it."
    );
  });

  it("never puts one card's session on another card's stop", () => {
    const about = todayAbout(liftDay);
    expect(walkStops({ today: "run", firstWeekItems: 0, about })[0].body).toBe(
      walkStops({ today: "run", firstWeekItems: 0 })[0].body
    );
  });

  it("gives today's calorie target on the Food stop", () => {
    const body = walkStops({
      today: null,
      firstWeekItems: 0,
      calories: 2449.6,
    })[0].body;
    expect(body).toBe(
      `Log what you eat here, by typing it or scanning it. Today’s target is ${group(2450)} kcal, and it already counts your training, so there’s nothing to eat back.`
    );
    expect(foodStopBody(null)).toBe(FOOD_STOP_BODY);
    expect(foodStopBody(0)).toBe(FOOD_STOP_BODY);
  });
});

describe("rowStop", () => {
  it("points the workout row at today's lift card when it is there", () => {
    expect(rowStop("workout", "lift")?.target).toBe("today-lift");
    expect(rowStop("workout", "first-workout")?.target).toBe("today-lift");
  });

  it("points the run row at today's run card when it is there", () => {
    expect(rowStop("run", "run")?.target).toBe("today-run");
    expect(rowStop("run", "free-run")?.target).toBe("today-run");
  });

  it("has no stop when today's card is something else, so Train opens", () => {
    expect(rowStop("workout", "run")).toBeNull();
    expect(rowStop("run", "lift")).toBeNull();
    expect(rowStop("workout", "rest")).toBeNull();
    expect(rowStop("run", null)).toBeNull();
  });
});

describe("walkOffered", () => {
  const start = "2026-10-02";
  it("offers the walk in the account's first seven days", () => {
    expect(walkOffered({ startKey: start, todayKey: start, seen: false })).toBe(
      true
    );
    expect(
      walkOffered({ startKey: start, todayKey: "2026-10-08", seen: false })
    ).toBe(true);
  });

  it("never unasked after the first week, so older accounts don't meet it", () => {
    expect(
      walkOffered({ startKey: start, todayKey: "2026-10-09", seen: false })
    ).toBe(false);
  });

  it("offers it once", () => {
    expect(walkOffered({ startKey: start, todayKey: start, seen: true })).toBe(
      false
    );
  });

  it("waits for the start day to be known", () => {
    expect(walkOffered({ startKey: null, todayKey: start, seen: false })).toBe(
      false
    );
  });

  it("does not auto-open for a version 2 account", () => {
    expect(
      walkOffered({
        startKey: start,
        todayKey: start,
        seen: false,
        activationJourneyV2: true,
      })
    ).toBe(false);
  });
});

describe("guideHintsUnlocked", () => {
  it("keeps legacy hints behind the Home walk", () => {
    expect(
      guideHintsUnlocked({ activationJourneyV2: false, walkSeen: false })
    ).toBe(false);
    expect(
      guideHintsUnlocked({ activationJourneyV2: false, walkSeen: true })
    ).toBe(true);
  });

  it("unlocks version 2 point-of-use hints without a Home walk", () => {
    expect(
      guideHintsUnlocked({ activationJourneyV2: true, walkSeen: false })
    ).toBe(true);
  });
});

describe("guideAllowed", () => {
  it("shows for people and stays away from automation", () => {
    expect(guideAllowed({ webdriver: false }, null)).toBe(true);
    expect(guideAllowed(undefined, null)).toBe(true);
    expect(guideAllowed({ webdriver: true }, null)).toBe(false);
  });

  it("shows under automation only when a capture spec turns it on", () => {
    expect(guideAllowed({ webdriver: true }, "on")).toBe(true);
    expect(guideAllowed({ webdriver: true }, "1")).toBe(false);
  });
});

describe("guideRequest", () => {
  it("reads the walk and the hints from router state", () => {
    expect(guideRequest({ guide: "walk" })).toBe("walk");
    expect(guideRequest({ guide: "food-composer" })).toBe("food-composer");
  });

  it("ignores anything else", () => {
    expect(guideRequest(null)).toBeNull();
    expect(guideRequest({ next: "/" })).toBeNull();
    expect(guideRequest({ guide: "toString" })).toBeNull();
    expect(guideRequest({ guide: "nope" })).toBeNull();
    expect(guideRequest("walk")).toBeNull();
  });
});

describe("hintDue", () => {
  const due = { allowed: true, owed: true, requested: false, closed: false };

  it("is due when the account is owed the hint, or a first-week row asked", () => {
    expect(hintDue(due)).toBe(true);
    expect(hintDue({ ...due, owed: false, requested: true })).toBe(true);
  });

  it("isn't due once closed, where the guide can't show, or when nobody wants it", () => {
    expect(hintDue({ ...due, closed: true })).toBe(false);
    expect(hintDue({ ...due, requested: true, closed: true })).toBe(false);
    expect(hintDue({ ...due, allowed: false })).toBe(false);
    expect(hintDue({ ...due, allowed: false, requested: true })).toBe(false);
    expect(hintDue({ ...due, owed: false })).toBe(false);
  });
});

describe("the guide's words", () => {
  const every = [
    ...(Object.keys(sessions) as TodayCard[]).flatMap((card) =>
      walkStops({ today: card, firstWeekItems: 4 })
    ),
    ...(
      [
        {
          kind: "lift",
          name: "Pull B",
          exercises: 5,
          minutes: 50,
          first: "Pull-up",
        },
        { kind: "run", name: "Easy 40", dose: "40 min" },
        { kind: "rest", next: "Pull B" },
      ] as const
    ).flatMap((about) =>
      (Object.keys(sessions) as TodayCard[]).flatMap((card) =>
        walkStops({ today: card, firstWeekItems: 4, about, calories: 2450 })
      )
    ),
    ...(["workout", "run"] as const).flatMap((item) =>
      (["lift", "run", "free-run", "first-workout"] as TodayCard[])
        .map((card) => rowStop(item, card))
        .filter((s) => s !== null)
    ),
    ...Object.values(GUIDE_HINTS),
    { title: "", body: FIRST_SET_BODY_NO_AUTO_REST },
  ];

  it("are in the house voice: no cheer, and the app never says I", () => {
    for (const { title, body } of every) {
      expect(`${title} ${body}`).not.toMatch(/!/);
      expect(`${title} ${body}`).not.toMatch(/\bI(’|')?(m|ll)?\b/);
    }
  });

  // Lift4: the starting weights are an estimate, and the first set is the
  // one place that says so, with or without the automatic rest timer.
  it("calls the first set's weights a first guess", () => {
    for (const body of [
      GUIDE_HINTS["first-set"].body,
      FIRST_SET_BODY_NO_AUTO_REST,
    ])
      expect(body).toContain(
        "The weights are a first guess. Feels easy? Add weight on the next set."
      );
  });

  it("keys each hint's seen flag by the hint", () => {
    expect(hintSeenKey("first-set")).toBe("tropos-guide-hint:first-set");
  });
});
