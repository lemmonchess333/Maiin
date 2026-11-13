/**
 * Coming back to a race plan with the race too close for it (Run15, deep
 * dive D11). The plan climbs a returning runner's long run back a rung a
 * week, which catches the ramp within a few weeks, so what decides whether
 * the race is in reach is how many weeks are left to build in. The
 * welcome-back sheet leads with moving the race when the long run gets
 * neither to the race's distance nor to three quarters of what the same
 * plan builds with a full block's weeks.
 *
 * Every date comes from the clock, so the suite means the same thing on any
 * day it runs.
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
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { migrateProgramState } from "../migrations";
import type { DatedRun } from "../layoffDetection";
import { raceLongRunReach } from "../raceWeeksAhead";
import { raceOutOfReach } from "../runPlanTiming";

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
  raceDistance: "half",
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

/** A race plan set up ten weeks ago, before the gap, with the race on the
 *  Sunday `weeksOut` weeks after this one. */
function returningTo(
  raceDistance: OnboardingDraft["raceDistance"],
  weeksOut: number
): { programState: ProgramState; profile: UserProfile } {
  const builtOn = shift(MONDAY, -70);
  return onDay(builtOn, () => {
    const plan = buildOnboardingPlan(
      {
        ...draft,
        raceDistance,
        raceTargetDate: shift(MONDAY, weeksOut * 7 + 6),
      },
      "recomp",
      builtOn
    );
    return {
      programState: migrateProgramState(
        normalizeProgramState(plan.programState),
        builtOn
      ),
      profile: { uid: "u", ...plan.profileUpdates } as unknown as UserProfile,
    };
  });
}

const run = (date: string, km: number): DatedRun =>
  ({ date, distance: km * 1000, duration: km * 400 }) as DatedRun;
/** Six weeks of four runs, the last of them seven weeks ago. */
const RUNS = [1, 2, 3, 4, 5, 6].flatMap((w) =>
  [0, 2, 4, 6].map((d) => run(shift(MONDAY, -49 - w * 7 + d), d === 6 ? 12 : 6))
);

const reach = (
  plan: ReturnType<typeof returningTo>,
  recentRuns: readonly DatedRun[] | null = RUNS
) =>
  raceLongRunReach({
    ...plan,
    recentLayoff: "detrained",
    recentRuns,
    today: TODAY,
  });

describe("a race the plan can't build up to in time", () => {
  it("is a half five weeks out: the long run gets to 12 km", () => {
    const r = reach(returningTo("half", 5));
    expect(r).toEqual({ longestKm: 12, raceKm: 21.1, fullKm: 20 });
    expect(raceOutOfReach(r)).toBe(true);
  });

  it("is a marathon six weeks out: 18 km of the plan's 30", () => {
    const r = reach(returningTo("marathon", 6));
    expect(r?.longestKm).toBe(18);
    expect(r?.fullKm).toBe(30);
    expect(raceOutOfReach(r)).toBe(true);
  });
});

describe("a race in reach", () => {
  // Run24 (6): the long run climbs 2 km a week, so the weeks it takes to
  // reach the plan's peak are more than on the coarser ladder.
  it("is a half with the weeks to build to the plan's own peak", () => {
    const r = reach(returningTo("half", 9));
    expect(r?.longestKm).toBe(r?.fullKm);
    expect(raceOutOfReach(r)).toBe(false);
  });

  it("is a marathon whose long run gets to the plan's peak, short of 42.2 km", () => {
    const r = reach(returningTo("marathon", 14));
    expect(r!.longestKm).toBeLessThan(r!.raceKm);
    expect(r?.longestKm).toBe(r?.fullKm);
    expect(raceOutOfReach(r)).toBe(false);
  });

  it("is a 5K the long run already goes past, however close", () => {
    const r = reach(returningTo("5k", 3));
    expect(r!.longestKm).toBeGreaterThanOrEqual(r!.raceKm);
    expect(raceOutOfReach(r)).toBe(false);
  });

  it("is a half whose long run gets to three quarters of the plan's peak", () => {
    const r = reach(returningTo("half", 7));
    expect(r!.longestKm).toBeGreaterThanOrEqual(0.75 * r!.fullKm);
    expect(raceOutOfReach(r)).toBe(false);
  });
});

describe("saying nothing", () => {
  it("without the runs a return climbs from", () => {
    expect(reach(returningTo("half", 5), null)).toBeNull();
  });

  it("without a race plan", () => {
    const plan = returningTo("half", 5);
    const free = {
      ...plan,
      profile: { ...plan.profile, runMode: "freeform" } as UserProfile,
    };
    expect(reach(free)).toBeNull();
    expect(raceOutOfReach(null)).toBe(false);
  });
});
