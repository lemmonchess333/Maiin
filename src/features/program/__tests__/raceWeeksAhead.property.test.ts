/**
 * No second engine (R23). The weeks ahead that Train outlines at the start
 * of a race plan are the weeks the plan then holds when each one arrives,
 * for a runner who does every run as planned.
 *
 * The arrival goes through the app's own path: the plan setup saves
 * (`buildOnboardingPlan`), moved on a week at a time by the rollover
 * `useProgram`'s effect runs (`rollRunWeeks`), with the layoff reading the
 * rollover is given worked out from the runs done (`layoffFromRuns`, as
 * `fetchRecentLayoff` reads them). The outline is taken once, on the day the
 * plan is saved. Each week is compared whole: its long run, its quality
 * sessions and the race, by template and by the name Train gives them, how
 * many runs it holds, and whether it is a lighter week.
 *
 * It holds exactly, so nothing is relaxed. That is not by construction for
 * every way of building an outline: the generator's own whole-plan pass
 * (`generateRacePlanV2(...).weeks`) disagrees with what arrives on a
 * compressed marathon, whose last build week keeps its tempo in a pass made
 * at the start and loses it when its week is built (the generator reads the
 * weeks LEFT there). The fixed cases below include three such plans, so an
 * outline built from that pass fails here.
 *
 * Plans are saved on any day of their first week, so the rollover's first
 * move starts from a part week, except a day after the week's last run day:
 * a plan saved then holds no runs that week, and neither the rollover nor
 * the load's rebuild builds a later one (found 2026-10-11 and handed back
 * with R23's build). Those are left out rather than asserted either way.
 *
 * Deterministic: a seeded draw, and every date taken from the clock.
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
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { mulberry32 } from "@/test/prng";
import { layoffFromRuns, type DatedRun } from "../layoffDetection";
import { migrateProgramState } from "../migrations";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { calendarDaysBetween, isRunStepBackWeek } from "../runPlanTiming";
import { raceBlockWeek } from "../weekPrescription";
import { rollRunWeeks } from "../weekRollover";
import {
  raceWeeksAhead,
  weekHolds,
  type RaceWeekAhead,
} from "../raceWeeksAhead";

const MONDAY = localWeekKey(parseLocalDate(localDateString(new Date())));
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

type Distance = "5k" | "10k" | "half" | "marathon";

interface Case {
  distance: Distance;
  /** The race's day, counted from the Monday of the week the plan starts. */
  raceDay: number;
  /** The day the plan is saved, 0 (Monday) to 6. */
  savedOn: number;
  liftDays: OnboardingDraft["daysPerWeek"];
  runDays: number;
  difficulty?: "gentler" | "standard" | "harder";
  volume?: "lighter" | "standard" | "bigger";
  /** A finish time for the race, so build sessions work at its pace. */
  goalTimeS?: number;
  runner?: "regular" | "new";
}

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "race_prep",
  weeklyRunDays: 3,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "35-44",
  heightCm: 178,
  weightKg: 76,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};

function setUp(c: Case): { state: ProgramState; profile: UserProfile } {
  const savedOn = shift(MONDAY, c.savedOn);
  return onDay(savedOn, () => {
    const plan = buildOnboardingPlan(
      {
        ...draft,
        raceDistance: c.distance,
        raceTargetDate: shift(MONDAY, c.raceDay),
        daysPerWeek: c.liftDays,
        weeklyRunDays: c.runDays,
        runFrequency: c.runner ?? "regular",
      },
      "recomp",
      savedOn
    );
    const began = {
      toMillis: () => parseLocalDate(savedOn).getTime() + 12 * 3600 * 1000,
    };
    const profile = {
      uid: "u",
      ...plan.profileUpdates,
      runFrequency: c.runner ?? "regular",
      createdAt: began,
      runDifficulty: c.difficulty ?? "standard",
      runVolume: c.volume ?? "standard",
    } as unknown as UserProfile;
    if (c.goalTimeS && profile.raceGoal) {
      profile.raceGoal = { ...profile.raceGoal, targetTimeS: c.goalTimeS };
    }
    return {
      state: migrateProgramState(
        normalizeProgramState(plan.programState),
        MONDAY
      ),
      profile,
    };
  });
}

/** A planned run, done as planned: dated on its day, and long enough to
 *  count (`isVolumeEligible`). */
function done(templateId: string, date: string): DatedRun {
  const t = RUN_TEMPLATES.find((x) => x.id === templateId);
  const minutes = t?.estimatedDuration ?? 30;
  return {
    date,
    distance: (t?.config.targetDistanceKm ?? minutes / 6) * 1000,
    duration: minutes * 60,
  };
}

/** What the week the plan holds now is, as the outline would say it. */
function arrived(
  state: ProgramState,
  profile: UserProfile
): Omit<RaceWeekAhead, "weekKey"> & { weekKey: string | undefined } {
  const block = raceBlockWeek(state.runPlan);
  return {
    weekKey: state.runDays?.[0]?.weekKey,
    lighter:
      !!block &&
      isRunStepBackWeek(block.weekIndex, block.totalWeeks, block.distance),
    holds: weekHolds(state.runDays ?? [], {
      profile,
      runPlan: state.runPlan,
    }),
  };
}

/**
 * Lives the plan: the outline on the day it is saved, then each week
 * arriving through the rollover with every run before it done. Returns the
 * outline and the weeks as they arrived.
 */
function live(c: Case) {
  const { state, profile } = setUp(c);
  const savedOn = shift(MONDAY, c.savedOn);
  const outline = raceWeeksAhead({
    profile,
    programState: state,
    recentLayoff: layoffFromRuns([], savedOn),
    today: savedOn,
  });
  const runs: DatedRun[] = [];
  const weeks: ReturnType<typeof arrived>[] = [];
  let s = state;
  for (const row of outline) {
    for (const day of s.runDays ?? []) {
      if (day.date)
        runs.push(done(day.userOverride || day.templateId, day.date));
    }
    const moved = onDay(row.weekKey, () =>
      rollRunWeeks(s, profile, row.weekKey, layoffFromRuns(runs, row.weekKey))
    );
    expect(moved.weeks).toBe(1);
    s = moved.state;
    weeks.push(arrived(s, profile));
  }
  return { outline, weeks };
}

/** The race's week, counted from the plan's first: the outline runs to it. */
const raceWeekOf = (c: Case) =>
  calendarDaysBetween(
    parseLocalDate(MONDAY),
    parseLocalDate(localWeekKey(parseLocalDate(shift(MONDAY, c.raceDay))))
  ) / 7;

const FIXED: Case[] = [
  // Compressed marathons, where the generator's whole-plan pass keeps a
  // tempo in the last build week that its own week doesn't.
  {
    distance: "marathon",
    raceDay: 6 * 7 + 6,
    savedOn: 0,
    liftDays: 3,
    runDays: 4,
  },
  {
    distance: "marathon",
    raceDay: 8 * 7 + 6,
    savedOn: 0,
    liftDays: 3,
    runDays: 4,
  },
  {
    distance: "marathon",
    raceDay: 10 * 7 + 6,
    savedOn: 0,
    liftDays: 3,
    runDays: 4,
  },
  // A marathon with a goal time: its build sessions work at race pace.
  {
    distance: "marathon",
    raceDay: 18 * 7 + 6,
    savedOn: 2,
    liftDays: 3,
    runDays: 4,
    goalTimeS: 4 * 3600,
  },
  // A half, harder: a second quality session in the build weeks.
  {
    distance: "half",
    raceDay: 14 * 7 + 5,
    savedOn: 0,
    liftDays: 2,
    runDays: 5,
    difficulty: "harder",
  },
  // A 10K, gentler and lighter, on two run days.
  {
    distance: "10k",
    raceDay: 9 * 7 + 6,
    savedOn: 1,
    liftDays: 4,
    runDays: 2,
    difficulty: "gentler",
    volume: "lighter",
  },
  // Someone new to running: run-walk weeks, then the plan's own.
  {
    distance: "5k",
    raceDay: 12 * 7 + 5,
    savedOn: 0,
    liftDays: 2,
    runDays: 3,
    runner: "new",
  },
  // A race a few days into next week, and one on a Monday.
  { distance: "5k", raceDay: 9, savedOn: 0, liftDays: 3, runDays: 3 },
  { distance: "10k", raceDay: 7 * 7, savedOn: 0, liftDays: 3, runDays: 3 },
];

const DISTANCES: Distance[] = ["5k", "10k", "half", "marathon"];
function drawn(count: number): Case[] {
  const rnd = mulberry32(2323);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: count }, () => ({
    distance: pick(DISTANCES),
    raceDay: 8 + Math.floor(rnd() * 7 * 22),
    savedOn: Math.floor(rnd() * 7),
    liftDays: pick([0, 2, 3, 4, 5, 6] as const),
    runDays: 2 + Math.floor(rnd() * 4),
    difficulty: pick(["gentler", "standard", "standard", "harder"] as const),
    volume: pick(["lighter", "standard", "standard", "bigger"] as const),
    goalTimeS: rnd() < 0.3 ? 3 * 3600 + Math.floor(rnd() * 7200) : undefined,
    runner: rnd() < 0.15 ? ("new" as const) : ("regular" as const),
  }));
}

describe("the weeks ahead are the weeks that arrive", () => {
  it.each(FIXED.map((c) => [`${c.distance}, race on day ${c.raceDay}`, c]))(
    "%s",
    (_, c) => {
      expect(setUp(c as Case).state.runDays?.length).toBeGreaterThan(0);
      const { outline, weeks } = live(c as Case);
      // Every week from next week to race week, and the race last.
      expect(outline).toHaveLength(raceWeekOf(c as Case));
      expect(outline.at(-1)?.holds.race).not.toBeNull();
      expect(weeks).toEqual(outline);
    },
    30_000
  );

  it("holds for plans drawn at random", () => {
    let lived = 0;
    for (const c of drawn(40)) {
      // A plan saved after its first week's last run day holds no runs
      // that week, and the app never builds it a later one (see header).
      if (!setUp(c).state.runDays?.length) continue;
      const { outline, weeks } = live(c);
      expect(outline.length, JSON.stringify(c)).toBe(raceWeekOf(c));
      expect(weeks, JSON.stringify(c)).toEqual(outline);
      lived++;
    }
    expect(lived).toBeGreaterThan(25);
  }, 120_000);
});
