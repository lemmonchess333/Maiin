/**
 * R23 (Pgm8, 2026-10-11): a race plan's coming weeks, outlined. Each week
 * from next week to race week, by its Monday, with its long run and its
 * quality sessions named as Train names them, and nothing of the day to
 * day: no days, no easy runs. Race week shows the race; a lighter week and
 * the taper's weeks show what they hold; a free runner has no plan to
 * outline (Run9 stands).
 *
 * Asserted as properties of the plan's own weeks, never by recomputing the
 * scheduler's rules: the outline has to say what the plan will hold, and a
 * second copy of the rules is what would let the two drift apart.
 * `raceWeeksAhead.property.test.ts` holds the outline against the weeks
 * the rollover then builds.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { migrateProgramState } from "../migrations";
import { rollRunWeeks } from "../weekRollover";
import {
  MAX_WEEKS_AHEAD,
  raceWeeksAhead,
  type RaceWeekAhead,
} from "../raceWeeksAhead";

/* Every date comes from the clock, so the suite means the same thing on
   any day it runs (and 90 days on, in CI's future run). */
const TODAY = localDateString(new Date());
const MONDAY = localWeekKey(parseLocalDate(TODAY));
const shift = (date: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(date), days));

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
  primaryGoal: "general",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "race_prep",
  weeklyRunDays: 4,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "female",
  ageRange: "25-34",
  heightCm: 168,
  weightKg: 62,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

/**
 * A race plan as setup saves it on `builtOn`, a Monday, so its first week
 * holds its runs whatever day the suite runs, with the race on the Sunday
 * `weeksOut` weeks after that one.
 */
function racePlan(
  answers: Partial<OnboardingDraft> & { weeksOut: number },
  extra: Partial<UserProfile> = {},
  builtOn = MONDAY
): { state: ProgramState; profile: UserProfile } {
  const { weeksOut, ...rest } = answers;
  return onDay(builtOn, () => {
    const plan = buildOnboardingPlan(
      {
        ...draft,
        ...rest,
        raceTargetDate: shift(builtOn, weeksOut * 7 + 6),
      },
      "recomp",
      builtOn
    );
    return {
      state: migrateProgramState(
        normalizeProgramState(plan.programState),
        builtOn
      ),
      profile: {
        uid: "u",
        ...plan.profileUpdates,
        ...extra,
      } as unknown as UserProfile,
    };
  });
}

function outline(
  { state, profile }: { state: ProgramState; profile: UserProfile },
  recentLayoff: "none" | "gap" | "detrained" = "none",
  today = TODAY
): RaceWeekAhead[] {
  return raceWeeksAhead({
    profile,
    programState: state,
    recentLayoff,
    today,
  });
}

const template = (id: string): RunTemplate => {
  const t = RUN_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};
const typeOf = (id: string) => template(id).type;
const km = (id: string) => template(id).config.targetDistanceKm ?? 0;
/** Every run a week names. */
const named = (week: RaceWeekAhead) =>
  [
    week.holds.race,
    week.holds.long,
    ...week.holds.quality,
    week.holds.runWalk,
  ].filter((run): run is NonNullable<typeof run> => run !== null);

describe("a race plan's coming weeks", () => {
  it("has one row a week, from next week's Monday to race week", () => {
    const weeks = outline(racePlan({ weeksOut: 10 }));
    expect(weeks.map((w) => w.weekKey)).toEqual(
      Array.from({ length: 10 }, (_, i) => shift(MONDAY, 7 * (i + 1)))
    );
  });

  it("ends on the race, which no earlier week holds", () => {
    const weeks = outline(racePlan({ weeksOut: 10 }));
    const raceWeek = weeks.at(-1)!.holds;
    expect(raceWeek.race).toEqual({ templateId: "10k_race", name: "10K Race" });
    // Its shakeouts are easy runs, which the outline doesn't list.
    expect(raceWeek.long).toBeNull();
    expect(raceWeek.quality).toEqual([]);
    expect(raceWeek.runCount).toBeGreaterThan(1);
    expect(weeks.slice(0, -1).every((w) => w.holds.race === null)).toBe(true);
  });

  it("names the long run and the quality sessions, and no easy run", () => {
    const weeks = outline(racePlan({ weeksOut: 10 }));
    const runs = weeks.flatMap(named);
    // Long runs, quality sessions and the race, and nothing else: no easy
    // run, no strides, no medium-long.
    expect(
      runs.every((run) =>
        ["long", "tempo", "intervals", "race"].includes(typeOf(run.templateId))
      )
    ).toBe(true);
    // Each by its own name, as Train's week selector shows it.
    for (const run of runs) {
      expect(run.name).toBe(template(run.templateId).name);
    }
    // A 10K build holds both kinds of quality session.
    expect(runs.some((run) => typeOf(run.templateId) === "tempo")).toBe(true);
    expect(runs.some((run) => typeOf(run.templateId) === "intervals")).toBe(
      true
    );
    // Every week before the taper has its long run.
    for (const w of weeks.slice(0, -2)) {
      expect(typeOf(w.holds.long!.templateId)).toBe("long");
    }
  });

  it("marks the plan's lighter weeks, whose long run steps back", () => {
    const plan = racePlan({ raceDistance: "half", weeksOut: 16 });
    const weeks = outline(plan);
    // Weeks 0 to 16, race week the 16th; the half's taper is 14 and 15.
    expect(plan.state.runPlan!.totalWeeks).toBe(17);
    // Every 4th week of the ramp steps back: weeks 3, 7 and 11 (15 is the
    // taper's). This week is a new plan's week 0, so row i is the plan's
    // week i + 1, and those are rows 2, 6 and 10.
    expect(weeks.flatMap((w, i) => (w.lighter ? [i] : []))).toEqual([2, 6, 10]);
    const lighter = weeks.flatMap((w, i) => (w.lighter && i > 0 ? [i] : []));
    expect(lighter.length).toBeGreaterThan(1);
    const longKm = (i: number) => km(weeks[i].holds.long!.templateId);
    // A lighter week's long run is never longer than the week's before it,
    // and once the build has climbed past its first size, it is shorter.
    // (Early on, the cut can land on the same size: the week's easy runs,
    // which the outline doesn't list, are what ease off.)
    for (const i of lighter) {
      expect(longKm(i)).toBeLessThanOrEqual(longKm(i - 1));
    }
    expect(lighter.some((i) => longKm(i) < longKm(i - 1))).toBe(true);
  });

  it("shows what the taper's weeks hold", () => {
    const weeks = outline(racePlan({ raceDistance: "marathon", weeksOut: 16 }));
    const raceWeek = weeks.length - 1;
    const longest = Math.max(
      ...weeks
        .slice(0, raceWeek - 3)
        .map((w) => (w.holds.long ? km(w.holds.long.templateId) : 0))
    );
    // The first two of the marathon's three taper weeks keep a shorter
    // long run (Run22)...
    for (const w of weeks.slice(raceWeek - 3, raceWeek - 1)) {
      expect(typeOf(w.holds.long!.templateId)).toBe("long");
      expect(km(w.holds.long!.templateId)).toBeLessThan(longest);
    }
    // ...and the week before race week holds its sharpener and no long run.
    expect(weeks[raceWeek - 1].holds.long).toBeNull();
    expect(weeks[raceWeek - 1].holds.quality.map((q) => q.name)).toEqual([
      "8×400m Speed",
    ]);
    // None of them is a lighter week: the taper cuts its own way.
    expect(weeks.slice(raceWeek - 3).some((w) => w.lighter)).toBe(false);
  });

  it("says when a session works at the goal race pace, as Train does", () => {
    const plan = racePlan({ raceDistance: "marathon", weeksOut: 20 });
    const goal = plan.profile.raceGoal!;
    const withTime = {
      ...plan,
      profile: {
        ...plan.profile,
        raceGoal: { ...goal, targetTimeS: 4 * 3600 },
      } as UserProfile,
    };
    const runs = outline(withTime).flatMap(named);
    const racePaceLongs = runs.filter((run) =>
      run.name.endsWith(" with race pace")
    );
    expect(racePaceLongs.length).toBeGreaterThan(0);
    for (const run of racePaceLongs) {
      expect(run.name).toBe(`${template(run.templateId).name} with race pace`);
      expect(km(run.templateId)).toBeGreaterThanOrEqual(12);
    }
    expect(runs.some((run) => / Min Tempo at race pace$/.test(run.name))).toBe(
      true
    );
    // Without a goal time, nothing is named for it.
    expect(
      outline(plan)
        .flatMap(named)
        .some((run) => run.name.includes("race pace"))
    ).toBe(false);
  });

  it("keeps a returning runner's weeks as the plan builds them", () => {
    const plan = racePlan({ raceDistance: "half", weeksOut: 12 });
    // Back from a layoff, the plan holds no quality sessions (Run15)...
    expect(outline(plan, "detrained").flatMap((w) => w.holds.quality)).toEqual(
      []
    );
    // ...where the same plan, trained through, has them.
    expect(
      outline(plan).flatMap((w) => w.holds.quality).length
    ).toBeGreaterThan(0);
  });

  it("shows a new runner's first weeks as their run-walk sessions", () => {
    const began = {
      toMillis: () => parseLocalDate(MONDAY).getTime() + 12 * 3600 * 1000,
    };
    const plan = racePlan(
      { raceDistance: "5k", weeksOut: 12, runFrequency: "new" },
      { runFrequency: "new", createdAt: began } as unknown as UserProfile
    );
    const weeks = outline(plan);
    expect(weeks[0].holds.long).toBeNull();
    expect(weeks[0].holds.quality).toEqual([]);
    expect(weeks[0].holds.runWalk?.name).toMatch(/^Run-walk \d$/);
    expect(weeks.at(-1)!.holds.race?.name).toBe("5K Race");
  });

  it("is the same whether or not the plan has rolled into this week", () => {
    // A plan whose runs are still last week's: the app has not been opened
    // since then, so the rollover has not moved it on.
    const lastWeek = shift(MONDAY, -7);
    const stale = racePlan({ weeksOut: 11 }, {}, lastWeek);
    const weeks = outline(stale);
    expect(weeks[0].weekKey).toBe(shift(MONDAY, 7));
    expect(weeks.at(-1)!.holds.race?.name).toBe("10K Race");
    const rolled = onDay(MONDAY, () =>
      rollRunWeeks(stale.state, stale.profile, MONDAY, "none", null)
    );
    expect(rolled.weeks).toBe(1);
    expect(outline({ ...stale, state: rolled.state })).toEqual(weeks);
  });

  it("is the same once the plan has moved on to next week early", () => {
    // "Start next week" moves the runs on before the calendar does: the
    // plan already holds next week's, which is the first week ahead.
    const plan = racePlan({ weeksOut: 10 });
    const before = outline(plan);
    const next = shift(MONDAY, 7);
    const moved = onDay(TODAY, () =>
      rollRunWeeks(plan.state, plan.profile, next, "none", null)
    );
    expect(moved.state.runDays?.[0]?.weekKey).toBe(next);
    expect(outline({ ...plan, state: moved.state })).toEqual(before);
  });

  it("stops two years ahead, short of a race further away", () => {
    const weeks = outline(
      racePlan({ raceDistance: "marathon", weeksOut: 110 })
    );
    expect(weeks).toHaveLength(MAX_WEEKS_AHEAD);
    expect(weeks.at(-1)!.weekKey).toBe(shift(MONDAY, 7 * MAX_WEEKS_AHEAD));
    expect(weeks.some((w) => w.holds.race)).toBe(false);
  });

  it("is empty with no race to train for, or none after this week", () => {
    const free = racePlan({ runMode: "freeform", weeksOut: 10 });
    expect(free.state.runPlan).toBeUndefined();
    expect(outline(free)).toEqual([]);
    // The race is this week: nothing is still to come.
    const thisWeek = racePlan({ raceDistance: "5k", weeksOut: 0 });
    expect(thisWeek.state.runPlan?.mode).toBe("race_prep");
    expect(outline(thisWeek)).toEqual([]);
  });
});
