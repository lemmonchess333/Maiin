import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  layoutWithSport,
  layoutWithoutSport,
  runLevelStart,
  sportChange,
  sportChangeRefusal,
  starterOfferedTo,
  type LiftingAnswers,
  type SportChange,
  type SportIntent,
} from "../sportChange";
import { trainingKind } from "../trainingKind";
import { layOutWeek } from "../layOutWeek";
import type { ScheduleDay } from "../scheduleUtils";
import type { UserProfile } from "../auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "../dateHelpers";
import { weekDays } from "../trainingWeek";
import { buildPlan } from "@/features/program/planBuilder";
import type { ProgramState } from "@/features/program/programTypes";

/**
 * Adding or removing a sport (TrainWk1 step 6). Each kind of person the
 * Train grill names (Q26) is set up as setup would set them up, on a day
 * taken from the clock, and each of the four changes is tried on them.
 */
const requireServer = createRequire(import.meta.url);
const server = requireServer("../../../functions/lib/validatePlanPayload") as {
  validatePlanPayload: (a: {
    profileData: unknown;
    programState: unknown;
    weekSchedule: unknown;
  }) => string[];
};
const profileSanitizer = requireServer(
  "../../../functions/profileSanitizer"
) as {
  sanitizeProfileData: (raw: unknown) => Record<string, unknown>;
  findUnexpectedProfileFields: (raw: unknown) => string[];
};

const WEEK = localWeekKey(new Date());
const [, , WED] = weekDays(WEEK);
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
/** The day each change is made: Wednesday of this week. */
const TODAY = WED;
const RACE_DAY = shift(TODAY, 84);

type Person = { profile: UserProfile; programState: ProgramState };

/** Someone as setup leaves them: the plan, and the profile beside it. */
function person(
  liftDays: number,
  run:
    | { mode: "none" }
    | { mode: "free"; level: "occasional" | "regular" }
    | { mode: "starter" }
    | { mode: "race" }
    | { mode: "rolling" },
  extra: Partial<UserProfile> = {}
): Person {
  const runMode =
    run.mode === "starter"
      ? "starter"
      : run.mode === "race"
        ? "race_prep"
        : "freeform";
  const plan = buildPlan({
    primaryGoal: liftDays > 0 ? "hypertrophy" : "running",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    sessionMinutes: 60,
    preferredSplit: "auto",
    runMode,
    rollingGoal: run.mode === "rolling" ? "keep_fit" : null,
    weeklyRunDays: run.mode === "none" || run.mode === "free" ? 0 : 3,
    ...(run.mode === "race"
      ? { raceGoal: { distance: "10k", targetDate: RACE_DAY } }
      : {}),
    equipment: "full_gym",
    injuries: ["none"],
    currentDate: shift(TODAY, -14),
    preserveHistory: false,
  });
  const runFrequency =
    run.mode === "none"
      ? "none"
      : run.mode === "free"
        ? run.level
        : run.mode === "starter"
          ? "new"
          : "regular";
  return {
    profile: JSON.parse(
      JSON.stringify({
        uid: "u1",
        athleteType:
          liftDays === 0 ? "Runner" : run.mode === "none" ? "Lifter" : "Hybrid",
        weightKg: 80,
        sex: "male",
        createdAt: {
          toMillis: () => parseLocalDate(shift(TODAY, -60)).getTime(),
        },
        ...plan.profileUpdates,
        runFrequency,
        ...(run.mode === "starter"
          ? { starterGoal: { startedOn: shift(TODAY, -14) } }
          : {}),
        ...extra,
      })
    ),
    programState: JSON.parse(JSON.stringify(plan.programState)),
  };
}

const PEOPLE = {
  "lifts only": () => person(4, { mode: "none" }),
  "runs only, no plan": () => person(0, { mode: "free", level: "occasional" }),
  "runs only, starter": () => person(0, { mode: "starter" }),
  "runs only, race": () => person(0, { mode: "race" }),
  "both, free running": () => person(3, { mode: "free", level: "regular" }),
  "both, race plan": () => person(3, { mode: "race" }),
  "both, starter": () => person(3, { mode: "starter" }),
  "both, plan with no race date": () => person(3, { mode: "rolling" }),
} as const;
type Who = keyof typeof PEOPLE;

const ANSWERS: LiftingAnswers = {
  liftDays: 3,
  sessionMinutes: 45,
  equipment: "home_gym",
  barbellAtHome: true,
  pullUpBar: true,
  smallPlates: true,
  experience: "beginner",
  injuries: ["knee"],
};

const INTENTS: Record<SportIntent["kind"], SportIntent> = {
  add_lifting: { kind: "add_lifting", answers: ANSWERS },
  remove_lifting: { kind: "remove_lifting" },
  add_running: { kind: "add_running", level: "new" },
  remove_running: { kind: "remove_running" },
};

function change(who: Person, intent: SportIntent): SportChange {
  return sportChange(
    {
      profile: who.profile,
      programState: who.programState,
      today: TODAY,
      recentLayoff: "none",
      recentRuns: [],
    },
    intent
  );
}

/** What the person is left with: the built plan, with the profile as the
 *  save leaves it. */
function after(who: Person, result: SportChange) {
  if (!result.ok) throw new Error(`refused: ${result.sentence}`);
  const plan = buildPlan(result.input);
  const profile = {
    ...who.profile,
    ...plan.profileUpdates,
    ...result.patch,
  } as UserProfile;
  return { plan, profile, kind: trainingKind(profile, plan.programState) };
}

const typesOf = (layout: readonly ScheduleDay[]) =>
  layout.map((d) => d.type).join(",");

/** Each change from each kind of person: done, or refused with this. */
const EXPECTED: Record<
  Who,
  Record<SportIntent["kind"], "ok" | `refused:${string}`>
> = {
  "lifts only": {
    add_lifting: "refused:on_plan",
    remove_lifting: "refused:last_sport",
    add_running: "ok",
    remove_running: "refused:not_on_plan",
  },
  "runs only, no plan": {
    add_lifting: "ok",
    remove_lifting: "refused:not_on_plan",
    add_running: "refused:on_plan",
    remove_running: "refused:last_sport",
  },
  "runs only, starter": {
    add_lifting: "ok",
    remove_lifting: "refused:not_on_plan",
    add_running: "refused:on_plan",
    remove_running: "refused:last_sport",
  },
  "runs only, race": {
    add_lifting: "ok",
    remove_lifting: "refused:not_on_plan",
    add_running: "refused:on_plan",
    remove_running: "refused:last_sport",
  },
  "both, free running": {
    add_lifting: "refused:on_plan",
    remove_lifting: "ok",
    add_running: "refused:on_plan",
    remove_running: "ok",
  },
  "both, race plan": {
    add_lifting: "refused:on_plan",
    remove_lifting: "ok",
    add_running: "refused:on_plan",
    remove_running: "refused:race_plan",
  },
  "both, starter": {
    add_lifting: "refused:on_plan",
    remove_lifting: "ok",
    add_running: "refused:on_plan",
    remove_running: "ok",
  },
  "both, plan with no race date": {
    add_lifting: "refused:on_plan",
    remove_lifting: "ok",
    add_running: "refused:on_plan",
    remove_running: "ok",
  },
};

describe("sportChange, every change from every kind of person", () => {
  for (const who of Object.keys(PEOPLE) as Who[]) {
    for (const kind of Object.keys(INTENTS) as SportIntent["kind"][]) {
      const expected = EXPECTED[who][kind];
      it(`${who}: ${kind} is ${expected}`, () => {
        const p = PEOPLE[who]();
        const result = change(p, INTENTS[kind]);
        if (expected === "ok") {
          expect(result.ok).toBe(true);
          // The builder takes it, and so does the server's gate.
          const { plan } = after(p, result);
          const profileData = profileSanitizer.sanitizeProfileData({
            ...plan.profileUpdates,
            ...(result.ok ? result.patch : {}),
          });
          expect(
            server.validatePlanPayload({
              profileData,
              programState: JSON.parse(JSON.stringify(plan.programState)),
              weekSchedule: plan.weekSchedule,
            })
          ).toEqual([]);
          // Nothing the save sends is dropped by the server's allow-list.
          expect(
            profileSanitizer.findUnexpectedProfileFields({
              ...plan.profileUpdates,
              ...(result.ok ? result.patch : {}),
            })
          ).toEqual([]);
        } else {
          expect(result).toMatchObject({
            ok: false,
            refusal: expected.slice("refused:".length),
          });
          if (!result.ok) expect(result.sentence).toMatch(/\.$/);
        }
      });
    }
  }
});

describe("what each change leaves", () => {
  it("adding lifting puts lift days on the plan, and keeps the runs where they were", () => {
    const runner = PEOPLE["runs only, starter"]();
    const before = runner.profile.weekSchedule!;
    const { plan, profile, kind } = after(
      runner,
      change(runner, INTENTS.add_lifting)
    );
    expect(kind).toEqual({ lifts: true, runs: true });
    expect(plan.programState.workouts).toHaveLength(3);
    expect(profile.weeklyWorkoutsTarget).toBe(3);
    // Every run day stays a run day; three rest days become lift days.
    before.forEach((day, i) => {
      if (day.type === "run")
        expect(["run", "both"]).toContain(plan.weekSchedule[i].type);
    });
    expect(
      plan.weekSchedule.filter((d) => d.type === "lift" || d.type === "both")
    ).toHaveLength(3);
    // The answers are the plan's.
    expect(profile).toMatchObject({
      equipment: "home_gym",
      experience: "beginner",
      injuries: ["knee"],
      barbellAtHome: true,
      liftTimeBudgetMinutes: 45,
    });
    expect(plan.programState.settings?.smallPlates).toBe(true);
    // The starter goal and its runs go on as they were.
    expect(profile.runMode).toBe("starter");
    expect(plan.programState.runPlan?.mode).toBe("starter");
  });

  it("adding lifting mid-week leaves the week's planned runs on their dates", () => {
    // A runner set up today, as the journey's runner is: the plan's runs
    // this week are dated from today.
    for (const mode of ["starter", "race"] as const) {
      const built = buildPlan({
        primaryGoal: "running",
        nutritionPhase: "recomp",
        experience: "beginner",
        liftDays: 0,
        preferredSplit: "full_body",
        runMode: mode === "starter" ? "starter" : "race_prep",
        weeklyRunDays: 3,
        ...(mode === "race"
          ? { raceGoal: { distance: "10k" as const, targetDate: RACE_DAY } }
          : {}),
        equipment: "full_gym",
        injuries: [],
        currentDate: TODAY,
        preserveHistory: false,
      });
      const runner: Person = {
        profile: {
          uid: "u1",
          runFrequency: mode === "starter" ? "new" : "regular",
          ...(mode === "starter" ? { starterGoal: { startedOn: TODAY } } : {}),
          ...built.profileUpdates,
        } as unknown as UserProfile,
        programState: built.programState,
      };
      const { plan } = after(runner, change(runner, INTENTS.add_lifting));
      const planned = (p: ProgramState) =>
        (p.runDays ?? [])
          .filter((d) => d.status === "planned")
          .map((d) => `${d.date}:${d.templateId}`)
          .sort();
      expect(planned(plan.programState)).toEqual(planned(runner.programState));
    }
  });

  it("adding lifting lays the lifts out from today, the full plan from day one", () => {
    const runner = PEOPLE["runs only, no plan"]();
    const { plan, profile } = after(
      runner,
      change(runner, INTENTS.add_lifting)
    );
    const layout = layOutWeek({
      weekKey: WEEK,
      today: TODAY,
      profile,
      programState: plan.programState,
      workouts: [],
      runs: [],
      claimMap: new Map(),
    });
    expect(layout.kind.lifts).toBe(true);
    const lifts = layout.entries.filter((s) => s.sport === "lift" && s.plan);
    // All three of the week's lifts are there, none before today, none
    // lost or called missed.
    expect(lifts).toHaveLength(3);
    for (const lift of lifts) {
      if (lift.sport !== "lift") continue;
      expect(["day", "still-to-do"]).toContain(lift.group);
      if (lift.group === "day") expect(lift.date! >= TODAY).toBe(true);
      expect(lift.state).not.toBe("missed");
    }
    expect(layout.next).not.toBeNull();
  });

  it("removing lifting takes the lift days off and keeps the runs where they were", () => {
    const hybrid = PEOPLE["both, race plan"]();
    const before = hybrid.profile.weekSchedule!;
    const { plan, profile, kind } = after(
      hybrid,
      change(hybrid, INTENTS.remove_lifting)
    );
    expect(kind).toEqual({ lifts: false, runs: true });
    expect(plan.programState.workouts).toEqual([]);
    expect(profile.weeklyWorkoutsTarget).toBe(0);
    expect(typesOf(plan.weekSchedule)).toBe(
      typesOf(layoutWithoutSport(before, "lifting"))
    );
    // The race and its plan stay.
    expect(profile.raceGoal).toMatchObject({ distance: "10k" });
    expect(plan.programState.runPlan?.mode).toBe("race_prep");
    // The plan's history stays: its week, its past weeks.
    expect(plan.programState.weekNumber).toBe(hybrid.programState.weekNumber);
    expect(plan.programState.weekHistory).toEqual(
      hybrid.programState.weekHistory
    );
  });

  it("adding running at New to running begins the starter goal, offered and on the plan", () => {
    const lifter = PEOPLE["lifts only"]();
    // Before: running isn't on the plan, and the starter is offered.
    expect(trainingKind(lifter.profile, lifter.programState).runs).toBe(false);
    expect(starterOfferedTo(lifter.profile, lifter.programState)).toBe(true);
    const result = change(lifter, { kind: "add_running", level: "new" });
    expect(result.ok && result.patch).toEqual({
      runFrequency: "new",
      starterGoal: { startedOn: TODAY },
    });
    const { plan, profile, kind } = after(lifter, result);
    expect(kind).toEqual({ lifts: true, runs: true });
    expect(starterOfferedTo(profile, plan.programState)).toBe(true);
    expect(profile.runMode).toBe("starter");
    expect(plan.programState.runPlan).toMatchObject({
      mode: "starter",
      stage: 1,
    });
    // The lift days stay where they were.
    lifter.profile.weekSchedule!.forEach((day, i) => {
      if (day.type === "lift")
        expect(["lift", "both"]).toContain(plan.weekSchedule[i].type);
    });
    expect(plan.programState.workouts).toEqual(lifter.programState.workouts);
  });

  it("adding running at another level runs freely, with no run days, and says the person runs", () => {
    const lifter = PEOPLE["lifts only"]();
    for (const level of ["occasional", "regular"] as const) {
      const result = change(lifter, { kind: "add_running", level });
      expect(result.ok && result.patch).toEqual({ runFrequency: level });
      const { plan, profile, kind } = after(lifter, result);
      expect(kind).toEqual({ lifts: true, runs: true });
      expect(profile.runMode).toBe("freeform");
      expect(plan.programState.runDays).toEqual([]);
      expect(typesOf(plan.weekSchedule)).toBe(
        typesOf(lifter.profile.weekSchedule!)
      );
    }
  });

  it("removing running ends the starter goal and the weekly goal, and keeps the lifting", () => {
    const hybrid = person(
      3,
      { mode: "starter" },
      {
        nonRaceGoal: { kind: "runs", target: 3 },
      }
    );
    const result = change(hybrid, INTENTS.remove_running);
    expect(result.ok && result.patch).toEqual({
      runFrequency: "none",
      nonRaceGoal: null,
      starterGoal: null,
    });
    const { plan, profile, kind } = after(hybrid, result);
    expect(kind).toEqual({ lifts: true, runs: false });
    expect(plan.programState.runDays).toEqual([]);
    expect(plan.programState.runPlan).toBeUndefined();
    expect(profile.runMode).toBe("freeform");
    expect(plan.programState.workouts.map((w) => w.dayName)).toEqual(
      hybrid.programState.workouts.map((w) => w.dayName)
    );
    expect(typesOf(plan.weekSchedule)).toBe(
      typesOf(layoutWithoutSport(hybrid.profile.weekSchedule!, "running"))
    );
  });

  it("removing running ends a plan with no race date", () => {
    const hybrid = PEOPLE["both, plan with no race date"]();
    expect(hybrid.programState.runPlan?.mode).toBe("rolling");
    const { plan, kind } = after(
      hybrid,
      change(hybrid, INTENTS.remove_running)
    );
    expect(kind.runs).toBe(false);
    expect(plan.programState.runPlan).toBeUndefined();
  });

  it("never writes the athlete type", () => {
    for (const who of Object.keys(PEOPLE) as Who[]) {
      for (const intent of Object.values(INTENTS)) {
        const p = PEOPLE[who]();
        const result = change(p, intent);
        if (!result.ok) continue;
        const { plan } = after(p, result);
        expect(result.patch).not.toHaveProperty("athleteType");
        expect(plan.profileUpdates).not.toHaveProperty("athleteType");
      }
    }
  });
});

describe("refusals", () => {
  it("says why the last sport stays", () => {
    const lifter = PEOPLE["lifts only"]();
    expect(change(lifter, INTENTS.remove_lifting)).toEqual({
      ok: false,
      refusal: "last_sport",
      sentence:
        "Your plan is lifting only. To stop lifting, add running first.",
    });
    const runner = PEOPLE["runs only, race"]();
    expect(change(runner, INTENTS.remove_running)).toMatchObject({
      sentence:
        "Your plan is running only. To stop running, add lifting first.",
    });
  });

  it("holds running while a race goal is set", () => {
    const hybrid = PEOPLE["both, race plan"]();
    expect(
      sportChangeRefusal(hybrid.profile, hybrid.programState, "remove_running")
    ).toEqual({
      refusal: "race_plan",
      sentence:
        "You’re training for a race. To stop running, choose No race first.",
    });
  });

  it("holds lifting while a training block runs", () => {
    const hybrid = PEOPLE["both, free running"]();
    const programState = {
      ...hybrid.programState,
      trainingBlock: { id: "b1", owned: true, focus: "strength" },
    } as ProgramState;
    expect(
      sportChangeRefusal(hybrid.profile, programState, "remove_lifting")
    ).toMatchObject({ refusal: "training_block" });
  });

  it("refuses lift days other than setup's two to six", () => {
    const runner = PEOPLE["runs only, no plan"]();
    expect(() =>
      change(runner, {
        kind: "add_lifting",
        answers: { ...ANSWERS, liftDays: 7 },
      })
    ).toThrow(RangeError);
  });
});

describe("the layout", () => {
  const layoutOf = (...kinds: ScheduleDay["type"][]) =>
    kinds.map((type, day) => ({ day, type }));

  it("takes a sport off, keeping the other's days", () => {
    const week = layoutOf("rest", "lift", "run", "both", "run", "lift", "run");
    expect(typesOf(layoutWithoutSport(week, "lifting"))).toBe(
      "rest,rest,run,run,run,rest,run"
    );
    expect(typesOf(layoutWithoutSport(week, "running"))).toBe(
      "rest,lift,rest,lift,rest,lift,rest"
    );
  });

  it("adds lift days on rest days, spread round the week", () => {
    // Runs Tuesday, Thursday, Saturday; four rest days.
    const week = layoutOf("rest", "rest", "run", "rest", "run", "rest", "run");
    const three = layoutWithSport(week, "lifting", 3);
    expect(typesOf(three)).toBe("lift,rest,run,lift,run,lift,run");
    // Runs keep their days whatever is added.
    for (const n of [2, 3, 4, 5, 6]) {
      const added = layoutWithSport(week, "lifting", n);
      expect(
        added.filter((d) => d.type === "lift" || d.type === "both")
      ).toHaveLength(n);
      week.forEach((day, i) => {
        if (day.type === "run")
          expect(["run", "both"]).toContain(added[i].type);
      });
    }
  });

  it("puts a run on a free weekend day when running is added", () => {
    const week = layoutOf(
      "rest",
      "lift",
      "rest",
      "lift",
      "rest",
      "lift",
      "rest"
    );
    const two = layoutWithSport(week, "running", 2);
    expect(two[0].type === "run" || two[6].type === "run").toBe(true);
    expect(
      typesOf(two)
        .split(",")
        .filter((t) => t === "lift")
    ).toHaveLength(3);
  });

  it("leaves a layout alone that already has the sport, or adds nothing", () => {
    const week = layoutOf(
      "rest",
      "lift",
      "run",
      "lift",
      "rest",
      "lift",
      "rest"
    );
    expect(layoutWithSport(week, "running", 3)).toEqual(week);
    expect(layoutWithSport(week, "lifting", 0)).toEqual(week);
  });
});

describe("runLevelStart", () => {
  it("starts New to running on the starter goal, as setup does", () => {
    expect(runLevelStart("new")).toEqual({
      runMode: "starter",
      weeklyRunDays: 2,
    });
    expect(runLevelStart("occasional")).toEqual({
      runMode: "freeform",
      weeklyRunDays: 2,
    });
    expect(runLevelStart("regular")).toEqual({
      runMode: "freeform",
      weeklyRunDays: 3,
    });
  });
});
