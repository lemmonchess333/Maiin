/**
 * A fitted session keeps fitting as its lifts get heavier (Lift7,
 * decisions.md L5, F8). The plan prices each loaded lift's warm-up at the
 * heavier of its weight and an established lifter's (`sessionFit.ts`), so a
 * lift the person loads past that gains warm-up sets the fit never priced,
 * and a day fitted to the hour comes to run over it. When the week moves on
 * into an ordinary week, such a day is re-fitted by the plan's own fit for a
 * new length, and keeps only that re-fit's cuts to sets. A day over its
 * length for any other reason is left as it is, and so is any week that
 * isn't an ordinary one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import { migrateProgramState } from "../migrations";
import {
  advanceWeek,
  balanceWeekVolume,
  refitOutgrownSessions,
} from "../programEngine";
import {
  normalizeProgramState,
  type PrimaryGoal,
  type ProgramExercise,
  type ProgramState,
  type WorkoutDay,
} from "../programTypes";
import {
  refitSessionsToTime,
  sessionFits,
  warmupsOutgrewFit,
} from "../sessionFit";
import type { RaceBlockWeek } from "../weekPrescription";
import { rollLiftWeeks, rollRunWeeks } from "../weekRollover";

/** A Monday. Weeks from here cross Auckland's change to summer time. */
const START = "2026-09-07";
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));
const weekOf = (date: string) => localWeekKey(parseLocalDate(date));
const WEEK_2 = weekOf(shift(START, 7));
const WEEK_3 = weekOf(shift(START, 14));

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

/** Three full-body days an hour long, for an intermediate. */
const lifter: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 3,
  sessionMinutes: 60,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "25-34",
  heightCm: 178,
  weightKg: 80,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

/** The plan setup builds on START, as the loader reads it back, and the
 *  profile setup writes with it. */
function build(answers: Partial<OnboardingDraft> = {}) {
  return onDay(START, () => {
    const plan = buildOnboardingPlan(
      { ...lifter, ...answers },
      "recomp",
      START
    );
    return {
      state: migrateProgramState(
        normalizeProgramState(plan.programState),
        weekOf(START)
      ),
      profile: { uid: "u", ...plan.profileUpdates } as unknown as UserProfile,
    };
  });
}

/** Every session of the week done. */
const trained = (s: ProgramState): ProgramState => ({
  ...s,
  workouts: s.workouts.map((d) => ({ ...d, completed: true })),
});

/** A press and a curl past the established lifter's, as someone who knows
 *  their weights loads them from their first sessions. A plan whose curl
 *  Pgm8 L15 built as a dumbbell curl has only the press grow. */
const PRESS_AND_CURL: Record<string, number> = {
  "overhead-press": 60,
  "barbell-curl": 30,
};

/** Four days to get stronger, and a stronger lifter's loads on the upper
 *  days' lifts. */
const STRENGTH: Partial<OnboardingDraft> = {
  primaryGoal: "strength",
  daysPerWeek: 4,
  weightKg: 85,
};
const STRONGER: Record<string, number> = {
  ...PRESS_AND_CURL,
  "bench-press": 100,
  "barbell-row": 90,
};

/** The plan at the person's own heavier weights. */
function heavier(
  s: ProgramState,
  loads: Record<string, number> = PRESS_AND_CURL
): ProgramState {
  return {
    ...s,
    workouts: s.workouts.map((d) => ({
      ...d,
      exercises: d.exercises.map((ex) =>
        loads[ex.exerciseId] === undefined
          ? ex
          : { ...ex, weight: Math.max(ex.weight, loads[ex.exerciseId]) }
      ),
    })),
  };
}

/** The week trained, at the person's own heavier weights. */
const trainedHeavier = (
  s: ProgramState,
  loads: Record<string, number> = PRESS_AND_CURL
): ProgramState => trained(heavier(s, loads));

/** The days that run over the length the plan was fitted to. */
const over = (s: ProgramState): string[] =>
  s.workouts
    .filter((d) => !sessionFits(d.exercises, s.sessionMinutes ?? 60))
    .map((d) => d.dayName);

/** Each day's lifts as `id sets/baseSets`, by day name. */
const setsOf = (s: ProgramState): Record<string, string[]> =>
  Object.fromEntries(
    s.workouts.map((d) => [
      d.dayName,
      d.exercises.map(
        (ex) => `${ex.exerciseId} ${String(ex.sets)}/${String(ex.baseSets)}`
      ),
    ])
  );

const dayNamed = (s: ProgramState, name: string): WorkoutDay =>
  s.workouts.find((d) => d.dayName === name)!;

/** What the plan's own re-fit for a new length leaves each outgrown day:
 *  the fewer of its sets and the re-fit's, lift by lift. */
function refitCuts(
  s: ProgramState,
  goal: PrimaryGoal | undefined,
  experience: UserProfile["experience"]
): Record<string, number[]> {
  const minutes = s.sessionMinutes!;
  const refit = balanceWeekVolume(
    refitSessionsToTime(s.workouts, goal, experience, minutes),
    goal,
    experience,
    minutes
  );
  return Object.fromEntries(
    s.workouts.map((d, i) => [
      d.dayName,
      sessionFits(d.exercises, minutes)
        ? d.exercises.map((ex) => ex.sets)
        : d.exercises.map((ex, e) =>
            Math.min(ex.sets, refit[i].exercises[e].sets)
          ),
    ])
  );
}

/** Only sets came off: the same lifts in the same order, at the same
 *  weights and reps, none with more sets than it had, a main lift with two
 *  at least, and the next weeks starting from them (`baseSets`). */
function expectOnlySetsCut(before: WorkoutDay, after: WorkoutDay): void {
  const ids = (d: WorkoutDay) =>
    d.exercises.map((ex) => `${ex.instanceId} ${ex.exerciseId}`);
  expect(ids(after)).toEqual(ids(before));
  after.exercises.forEach((ex, i) => {
    const was = before.exercises[i];
    expect(ex.weight).toBe(was.weight);
    expect(ex.reps).toBe(was.reps);
    expect(ex.sets).toBeLessThanOrEqual(was.sets);
    expect(ex.baseSets).toBe(ex.sets);
    if (ex.isAccessory !== true)
      expect(ex.sets).toBeGreaterThanOrEqual(Math.min(2, was.sets));
  });
}

/** A week of a 16-week half, as the run plan counts them from 0: 8 is a
 *  build week, 13 the first of the two lighter weeks before race week. */
const halfWeek = (weekIndex: number): RaceBlockWeek => ({
  weekIndex,
  totalWeeks: 16,
  distance: "half",
});

const race10k: Partial<OnboardingDraft> = {
  runFrequency: "regular",
  runMode: "race_prep",
  weeklyRunDays: 3,
  raceDistance: "10k",
  raceTargetDate: shift(START, 12 * 7 + 5),
};

describe("a day its warm-ups outgrew, as the week moves on (Lift7)", () => {
  it("is re-fitted at the Monday rollover, by sets alone", () => {
    const { state, profile } = build();
    // Every day fits the hour as the plan is built…
    expect(state.sessionMinutes).toBe(60);
    expect(over(state)).toEqual([]);
    // …and one runs over it once the press and the curl are heavier.
    const before = trainedHeavier(state);
    const outgrown = over(before);
    expect(outgrown.length).toBeGreaterThan(0);

    const rolled = rollLiftWeeks(before, profile, WEEK_2);
    expect(rolled.weeks).toBe(1);
    expect(rolled.state.currentPhase).toBe("progression");
    expect(over(rolled.state)).toEqual([]);
    for (const day of before.workouts) {
      const after = dayNamed(rolled.state, day.dayName);
      expectOnlySetsCut(day, after);
      const cut = after.exercises.some(
        (ex, i) => ex.sets < day.exercises[i].sets
      );
      expect(cut).toBe(outgrown.includes(day.dayName));
    }
  });

  it("keeps only the cuts the plan's own re-fit for a new length makes", () => {
    const { state, profile } = build();
    const before = trainedHeavier(state);
    const rolled = rollLiftWeeks(before, profile, WEEK_2).state;
    const sets = (s: ProgramState) =>
      Object.fromEntries(
        s.workouts.map((d) => [d.dayName, d.exercises.map((ex) => ex.sets)])
      );
    expect(sets(rolled)).toEqual(
      refitCuts(before, profile.primaryGoal, profile.experience)
    );
  });

  it("starts from the person's own focus, not one a block has set", () => {
    // Get stronger gives an intermediate's main lifts four sets
    // (`roleTable.ts`). A block for size moves their reps, never their
    // sets, so the re-fit still starts from four.
    const { state, profile } = build(STRENGTH);
    const before: ProgramState = {
      ...trainedHeavier(state, STRONGER),
      primaryGoal: "hypertrophy",
    };
    expect(over(before).length).toBeGreaterThan(0);
    const rolled = rollLiftWeeks(before, profile, WEEK_2).state;
    expect(over(rolled)).toEqual([]);
    const sets = Object.fromEntries(
      rolled.workouts.map((d) => [d.dayName, d.exercises.map((ex) => ex.sets)])
    );
    expect(sets).toEqual(refitCuts(before, "strength", profile.experience));
    expect(sets).not.toEqual(
      refitCuts(before, "hypertrophy", profile.experience)
    );
  });

  it("is re-fitted the same way by Start next week", () => {
    const { state, profile } = build();
    const before = trainedHeavier(state);
    const started = advanceWeek(before, profile.experience, WEEK_2, null, {
      primaryGoal: profile.primaryGoal,
    });
    expect(over(started)).toEqual([]);
    expect(started.workouts).toEqual(
      rollLiftWeeks(before, profile, WEEK_2).state.workouts
    );
  });

  it("is re-fitted on a plan that follows its runs", () => {
    const { state, profile } = build(race10k);
    const before = trainedHeavier(state);
    expect(over(before).length).toBeGreaterThan(0);
    const today = shift(START, 9);
    const rolled = onDay(today, () =>
      rollRunWeeks(before, profile, weekOf(today), "none")
    );
    expect(rolled.weeks).toBe(1);
    expect(rolled.state.currentPhase).toBe("progression");
    expect(rolled.state.raceWeek).toBeUndefined();
    expect(over(rolled.state)).toEqual([]);
    for (const day of before.workouts)
      expectOnlySetsCut(day, dayNamed(rolled.state, day.dayName));
  });

  it("moves a plan the same way every time", () => {
    const { state, profile } = build();
    const before = trainedHeavier(state);
    const withoutUpdatedAt = (s: ProgramState) =>
      JSON.stringify(s, (key, value: unknown) =>
        key === "updatedAt" ? 0 : value
      );
    const once = rollLiftWeeks(before, profile, WEEK_3).state;
    const again = rollLiftWeeks(before, profile, WEEK_3).state;
    expect(withoutUpdatedAt(again)).toBe(withoutUpdatedAt(once));
    // The second week moved finds the day fitting, and cuts nothing more.
    expect(setsOf(once)).toEqual(
      setsOf(rollLiftWeeks(before, profile, WEEK_2).state)
    );
  });
});

describe("a day over its length for another reason (Lift7)", () => {
  /** A leg press put into a day at its role's three sets (Lift5). */
  const legPress: ProgramExercise = {
    name: "Leg Press",
    exerciseId: "leg-press",
    instanceId: "added-leg-press",
    movementCategory: "knee_dominant",
    isAccessory: true,
    sets: 3,
    baseSets: 3,
    reps: 10,
    baseReps: 10,
    repRangeMax: 14,
    weight: 100,
    progressionType: "double",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
  const withLegPress = (s: ProgramState, dayName: string): ProgramState => ({
    ...s,
    workouts: s.workouts.map((d) =>
      d.dayName === dayName
        ? { ...d, exercises: [...d.exercises, legPress] }
        : d
    ),
  });

  it("is left as it is when a lift the person added takes it over", () => {
    const { state, profile } = build();
    const first = state.workouts[0].dayName;
    const before = trained(withLegPress(state, first));
    expect(over(before)).toEqual([first]);
    const rolled = rollLiftWeeks(before, profile, WEEK_2).state;
    expect(setsOf(rolled)).toEqual(setsOf(before));
    expect(over(rolled)).toEqual([first]);
  });

  it("is left as it is when its lifts grew and the person added one too", () => {
    const { state, profile } = build();
    const [grown] = over(trainedHeavier(state));
    expect(grown).toBeDefined();
    const before = trainedHeavier(withLegPress(state, grown));
    const rolled = rollLiftWeeks(before, profile, WEEK_2).state;
    expect(setsOf(rolled)[grown]).toEqual(setsOf(before)[grown]);
    expect(over(rolled)).toContain(grown);
  });

  it("keeps a short session whose lifts are at two sets as it is, over", () => {
    // At 45 minutes the heavier press and curl take a day past its length
    // with every lift at two sets: the fit can't bring it inside, so
    // nothing is cut, nothing dropped, and its card's estimate says so.
    const { state, profile } = build({ sessionMinutes: 45 });
    const before = trainedHeavier(state);
    const short = over(before).filter((name) =>
      dayNamed(before, name).exercises.every((ex) => ex.sets <= 2)
    );
    expect(short.length).toBeGreaterThan(0);
    const rolled = rollLiftWeeks(before, profile, WEEK_2).state;
    for (const name of short) {
      expect(setsOf(rolled)[name]).toEqual(setsOf(before)[name]);
      expect(over(rolled)).toContain(name);
    }
  });
});

describe("a week that isn't an ordinary one (Lift7)", () => {
  /** Each lift's own sets (`baseSets`), by day name: what the weeks after
   *  start from. */
  const baseOf = (s: ProgramState): Record<string, number[]> =>
    Object.fromEntries(
      s.workouts.map((d) => [
        d.dayName,
        d.exercises.map((ex) => ex.baseSets ?? ex.sets),
      ])
    );

  it("leaves a lighter week alone, and the ordinary week after re-fits", () => {
    const { state, profile } = build();
    const before = { ...trainedHeavier(state), weekNumber: 3 };
    const lighter = rollLiftWeeks(before, profile, WEEK_2).state;
    expect(lighter.currentPhase).toBe("deload");
    expect(baseOf(lighter)).toEqual(baseOf(before));
    const after = rollLiftWeeks(trained(lighter), profile, WEEK_3).state;
    expect(after.currentPhase).toBe("progression");
    expect(over(after)).toEqual([]);
    expect(baseOf(after)).not.toEqual(baseOf(before));
  });

  it("leaves a race's final weeks alone, and the week after them re-fits", () => {
    const { state, profile } = build();
    const before = trainedHeavier(state);
    const options = { primaryGoal: profile.primaryGoal };
    const taper = advanceWeek(
      before,
      profile.experience,
      WEEK_2,
      halfWeek(13),
      options
    );
    expect(taper.raceWeek).toBe("taper");
    expect(baseOf(taper)).toEqual(baseOf(before));
    const after = advanceWeek(
      trained(taper),
      profile.experience,
      WEEK_3,
      null,
      options
    );
    expect(after.raceWeek).toBeUndefined();
    expect(after.currentPhase).toBe("progression");
    expect(over(after)).toEqual([]);
  });

  it("leaves a race build's weeks alone, leg trim and all", () => {
    // The trim's sets are the week's, not the plan's: a re-fit from them
    // would keep the legs trimmed after the race. The upper days, which the
    // trim leaves as they are, wait for an ordinary week too.
    const { state, profile } = build(STRENGTH);
    const before = trainedHeavier(state, STRONGER);
    const build8 = advanceWeek(
      before,
      profile.experience,
      WEEK_2,
      halfWeek(8),
      { raceLegTrim: true, primaryGoal: profile.primaryGoal }
    );
    expect(build8.raceWeek).toBe("build");
    expect(build8.currentPhase).toBe("progression");
    expect(over(build8).length).toBeGreaterThan(0);
    expect(baseOf(build8)).toEqual(baseOf(before));
  });

  it("leaves the weeks of a return alone, and the week after them re-fits", () => {
    const { state, profile } = build();
    // The first week back, not trained yet, keeps its set fewer…
    const first = rollLiftWeeks(
      { ...heavier(state), easingBack: { weeksLeft: 2 } },
      profile,
      WEEK_2
    ).state;
    expect(first.easingBack).toEqual({ weeksLeft: 2 });
    expect(baseOf(first)).toEqual(baseOf(state));
    // …the second has all its sets…
    const second = rollLiftWeeks(trained(first), profile, WEEK_3).state;
    expect(second.easingBack).toEqual({ weeksLeft: 1 });
    expect(baseOf(second)).toEqual(baseOf(state));
    expect(over(second).length).toBeGreaterThan(0);
    // …and the week after them is an ordinary one.
    const after = rollLiftWeeks(
      trained(second),
      profile,
      weekOf(shift(START, 21))
    ).state;
    expect(after.easingBack).toBeUndefined();
    expect(over(after)).toEqual([]);
  });
});

describe("a plan the re-fit leaves alone (Lift7)", () => {
  it("changes nothing until the week moves on", () => {
    const { state, profile } = build();
    const before = trainedHeavier(state);
    const same = rollLiftWeeks(before, profile, weekOf(START));
    expect(same.weeks).toBe(0);
    expect(same.state).toBe(before);
  });

  it("changes no lift while only the runs move on", () => {
    // A manual "next week" holds the lift side still; the runs, pinned to
    // their dates, roll on (ADR-0002).
    const { state, profile } = build(race10k);
    const before = { ...trainedHeavier(state), liftWeekKey: WEEK_2 };
    const today = shift(START, 9);
    const rolled = onDay(today, () =>
      rollRunWeeks(before, profile, weekOf(today), "none")
    );
    expect(rolled.weeks).toBe(1);
    expect(rolled.state.workouts).toBe(before.workouts);
  });

  it("keeps a plan that fits as it is", () => {
    const { state, profile } = build();
    const rolled = rollLiftWeeks(trained(state), profile, WEEK_2).state;
    expect(setsOf(rolled)).toEqual(setsOf(state));
  });

  it("keeps a plan built before plans were fitted to time as it is", () => {
    const { state, profile } = build();
    const { sessionMinutes: _fitted, ...legacy } = trainedHeavier(state);
    const rolled = rollLiftWeeks(legacy, profile, WEEK_2).state;
    expect(setsOf(rolled)).toEqual(setsOf(legacy));
  });
});

describe("refitOutgrownSessions", () => {
  const goal = "general";
  const experience = "intermediate";

  it("returns a week with no day outgrown as it was", () => {
    const { state } = build();
    expect(refitOutgrownSessions(state.workouts, goal, experience, 60)).toBe(
      state.workouts
    );
  });

  /** A lift's sets set by hand, the next weeks' with them. */
  const withSets = (
    s: ProgramState,
    dayName: string,
    index: number,
    sets: number
  ): ProgramState => ({
    ...s,
    workouts: s.workouts.map((d) =>
      d.dayName !== dayName
        ? d
        : {
            ...d,
            exercises: d.exercises.map((ex, i) =>
              i === index ? { ...ex, sets, baseSets: sets } : ex
            ),
          }
    ),
  });

  it("returns each day it doesn't re-fit as it was", () => {
    // A strength plan's lower days have time to spare: one keeps a fifth
    // set on its first lift, though the re-fit would start it from four.
    const grown = trainedHeavier(build(STRENGTH).state, STRONGER);
    const fitting = grown.workouts.find(
      (d) => !over(grown).includes(d.dayName)
    )!;
    const first = fitting.exercises[0].sets;
    const before = withSets(grown, fitting.dayName, 0, first + 1);
    expect(over(before)).not.toContain(fitting.dayName);
    const outgrown = over(before);
    expect(outgrown.length).toBeGreaterThan(0);
    const refitted = refitOutgrownSessions(
      before.workouts,
      "strength",
      experience,
      60
    );
    before.workouts.forEach((day, i) => {
      if (outgrown.includes(day.dayName)) expect(refitted[i]).not.toBe(day);
      else expect(refitted[i]).toBe(day);
    });
  });

  it("gives no lift a set, where the re-fit would", () => {
    // The outgrown day's last lift taken down to one set by hand, and its
    // set given to the lift before it, so the day still runs over and only
    // for its warm-ups: the re-fit starts the last lift from its role's
    // sets and gives it two.
    const grown = trainedHeavier(build().state);
    const [name] = over(grown);
    const last = dayNamed(grown, name).exercises.length - 1;
    const before = withSets(
      withSets(grown, name, last, 1),
      name,
      last - 1,
      dayNamed(grown, name).exercises[last - 1].sets + 1
    );
    expect(over(before)).toContain(name);
    expect(warmupsOutgrewFit(dayNamed(before, name).exercises, 60)).toBe(true);
    const d = before.workouts.findIndex((day) => day.dayName === name);
    const reFit = balanceWeekVolume(
      refitSessionsToTime(before.workouts, goal, experience, 60),
      goal,
      experience,
      60
    );
    expect(reFit[d].exercises[last].sets).toBeGreaterThan(1);
    const refitted = refitOutgrownSessions(
      before.workouts,
      goal,
      experience,
      60
    );
    expect(refitted[d].exercises[last].sets).toBe(1);
    expectOnlySetsCut(before.workouts[d], refitted[d]);
    expect(sessionFits(refitted[d].exercises, 60)).toBe(true);
  });
});
