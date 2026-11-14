/**
 * Run24 (3), deep dive D7: plans with no race date. "Free running" planned
 * nothing, ever, and after a race's recovery the plan stopped. A plan with
 * no date now keeps going on a four-week cycle towards its goal's soft
 * horizon (build to 5K, build to 10K, get faster at 5K, keep fit), free on
 * every account, with the profile on free running and the plan on the
 * programme.
 */
import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { generateSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { UserProfile } from "@/lib/auth";
import { racePlanLocked } from "@/lib/racePlanAccess";
import { runHeaderLine } from "@/lib/runHeaderLine";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { generateRollingPlan } from "../runScheduler";
import { ROLLING_GOALS, ROLLING_SPECS, type RollingGoal } from "../rollingPlan";
import { regenerateRollingPlan, rollingRunPlan } from "../rollingWeek";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import {
  isRunPlanFromNewerBuild,
  rollingGoalOf,
  runModeWithPlan,
  weekRolloverAnchor,
} from "../programMaintenance";
import { nextRunWeek } from "../weekRollover";
import { plannedRunMinutes } from "../runTimeLimits";
import type { ProgramState, ScheduledRunDay } from "../programTypes";

/** A Monday. */
const START = "2026-03-09";
const PACE = 6 * 60;
const day = (offset: number) =>
  localDateString(addLocalDays(parseLocalDate(START), offset));

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;
const longKm = (week: ScheduledRunDay[]) =>
  Math.max(
    0,
    ...week
      .filter((run) => run.type === "long")
      .map((run) => template(run.templateId).config.targetDistanceKm ?? 0)
  );
const minutes = (week: ScheduledRunDay[]) =>
  week.reduce(
    (sum, run) => sum + plannedRunMinutes(template(run.templateId), PACE),
    0
  );
const sessions = (week: ScheduledRunDay[]) =>
  week.filter((run) => run.type === "tempo" || run.type === "intervals");
const isTrial = (run: ScheduledRunDay) =>
  run.templateId.startsWith("time_trial");

function plan(
  goal: RollingGoal,
  options: {
    weeks?: number;
    pace?: number | null;
    layoff?: "none" | "detrained";
    newRunnerUntil?: string | null;
  } = {}
) {
  return generateRollingPlan({
    goal,
    weekSchedule: generateSchedule(0, 4),
    weeklyRunDays: 4,
    currentDate: START,
    weekStart: START,
    planWeek: 0,
    recentLayoff: options.layoff ?? "none",
    easyPaceSPerKm: options.pace === undefined ? PACE : options.pace,
    newRunnerUntil: options.newRunnerUntil ?? null,
    weeks: options.weeks ?? 24,
  });
}

describe("the weeks of a plan with no race date (Run24 (3), D7)", () => {
  it("climbs each goal's long run to its horizon, then holds it, a lighter week every fourth", () => {
    for (const goal of ROLLING_GOALS) {
      const weeks = plan(goal);
      const longs = weeks.map(longKm);
      const horizon = ROLLING_SPECS[goal].horizon.longKm;
      expect(Math.max(...longs)).toBe(horizon);
      expect(longs.slice(-8).filter((km) => km === horizon).length).toBe(6);
      for (const back of [3, 7, 11, 15, 19, 23]) {
        expect(longs[back]).toBeLessThan(Math.max(...longs.slice(0, back)));
        expect(minutes(weeks[back])).toBeLessThan(minutes(weeks[back - 1]));
      }
      // Never more than a rung (2 km) past the longest so far: after a
      // lighter week the climb picks up where it was, a rung on.
      for (let w = 1; w < longs.length; w++)
        expect(longs[w] - Math.max(...longs.slice(0, w))).toBeLessThanOrEqual(
          2
        );
    }
  });

  it("holds each week to about 15% over the last week that was not lighter", () => {
    for (const goal of ROLLING_GOALS) {
      let last: number | null = null;
      plan(goal).forEach((week, w) => {
        const trial = week.some(isTrial);
        if (last !== null && !trial)
          // The long run's own rung may take a week over the hold, as in a
          // race block; the easy runs give way to the rest.
          expect(minutes(week)).toBeLessThanOrEqual(last * 1.15 + 25);
        if ((w + 1) % 4 !== 0 && !trial) last = minutes(week);
      });
    }
  });

  it("rotates each goal's sessions, and the trials, as the goal says", () => {
    const ids = (goal: RollingGoal, pace?: number | null) =>
      plan(goal, { pace })
        .flatMap(sessions)
        .map((run) => run.templateId);
    // Build to 5K: a short tempo now and then, and no trials.
    expect(ids("build_5k").every((id) => id === "tempo_20")).toBe(true);
    expect(ids("build_5k").length).toBeGreaterThan(0);
    // Get faster at 5K: the 1 km reps, a tempo and short reps.
    const faster = ids("faster_5k");
    expect(faster.some((id) => /^\dx1k$/.test(id))).toBe(true);
    expect(faster).toContain("8x400");
    expect(faster.some((id) => id.startsWith("tempo_"))).toBe(true);
    // Without a benchmark, a 3 km trial in the second week, then 5 km ones.
    const noBenchmark = plan("faster_5k", { pace: null });
    expect(
      noBenchmark[1].some((run) => run.templateId === "time_trial_3k")
    ).toBe(true);
    expect(
      noBenchmark.flat().filter((run) => run.templateId === "time_trial_5k")
        .length
    ).toBeGreaterThanOrEqual(3);
    // With one, no 3 km trial, and the 5 km ones still come.
    const benchmarked = plan("faster_5k").flat();
    expect(benchmarked.some((run) => run.templateId === "time_trial_3k")).toBe(
      false
    );
    expect(benchmarked.some((run) => run.templateId === "time_trial_5k")).toBe(
      true
    );
  });

  it("holds a detrained runner at the opening with no sessions", () => {
    const weeks = plan("build_10k", { layoff: "detrained", weeks: 8 });
    expect(weeks.flatMap(sessions)).toEqual([]);
    expect(new Set(weeks.map(longKm)).size).toBe(1);
  });

  it("gives a new runner's first weeks their run-walk sessions and no quality", () => {
    const weeks = plan("build_5k", {
      newRunnerUntil: day(6 * 7),
      pace: null,
      weeks: 6,
    });
    expect(weeks.flatMap(sessions)).toEqual([]);
    expect(
      weeks.flat().every((run) => template(run.templateId).config.runWalk)
    ).toBe(true);
  });

  it("builds the same week from any week of the plan, the same plan and profile", () => {
    const whole = plan("keep_fit");
    const week9 = generateRollingPlan({
      goal: "keep_fit",
      weekSchedule: generateSchedule(0, 4),
      weeklyRunDays: 4,
      currentDate: day(9 * 7),
      weekStart: day(9 * 7),
      planWeek: 9,
      recentLayoff: "none",
      easyPaceSPerKm: PACE,
    });
    expect(week9[0]).toEqual(whole[9]);
  });
});

const runner = {
  tuning: { volume: "standard", difficulty: "standard" },
  easyPaceSPerKm: PACE,
  runningBaseline: null,
  runTimeLimits: null,
  newRunnerUntil: null,
} as const;

describe("a plan's week from today (Run19, as a race plan's)", () => {
  it("plans no run before today, and starts next week when none of this week's is left", () => {
    const thursday = regenerateRollingPlan({
      runner: { ...runner },
      goal: "keep_fit",
      planWeek: 0,
      weekSchedule: generateSchedule(0, 4),
      weeklyRunDays: 4,
      currentDate: day(3),
      weekStart: START,
      recentLayoff: "none",
      recentRuns: null,
      plannedFrom: day(3),
    });
    expect(thursday.runDays.every((run) => run.date! >= day(3))).toBe(true);
    expect(thursday.runDays.length).toBeGreaterThan(0);
    expect(thursday.runPlan).toEqual(rollingRunPlan("keep_fit", 0, START));
    // Sunday after the week's long run: next week's runs, as week 0... of
    // the plan one week on.
    const lateSunday = regenerateRollingPlan({
      runner: { ...runner },
      goal: "keep_fit",
      planWeek: 0,
      weekSchedule: [
        { day: 0, type: "rest" },
        { day: 1, type: "run" },
        { day: 2, type: "run" },
        { day: 3, type: "rest" },
        { day: 4, type: "run" },
        { day: 5, type: "rest" },
        { day: 6, type: "run" },
      ],
      weeklyRunDays: 4,
      currentDate: day(6),
      weekStart: START,
      recentLayoff: "none",
      recentRuns: null,
      plannedFrom: day(6),
    });
    expect(lateSunday.runPlan.rollingWeekKey).toBe(day(7));
    expect(lateSunday.runPlan.currentWeek).toBe(1);
    expect(lateSunday.runDays.every((run) => run.weekKey === day(7))).toBe(
      true
    );
  });
});

const profile = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    uid: "u",
    runMode: "freeform",
    weeklyRunDaysTarget: 4,
    weekSchedule: generateSchedule(0, 4),
    ...over,
  }) as UserProfile;

function makeInput(over: Partial<PlanBuilderInput> = {}): PlanBuilderInput {
  return {
    primaryGoal: "general",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays: 0,
    preferredSplit: "full_body",
    runMode: "freeform",
    weeklyRunDays: 4,
    equipment: "full_gym",
    injuries: [],
    currentDate: day(1),
    ...over,
  };
}

describe("a plan with no race date in the programme", () => {
  it("is built by a save, on free running, with run days and the plan's first week", () => {
    const out = buildPlan(makeInput({ rollingGoal: "build_10k" }));
    expect(out.profileUpdates.runMode).toBe("freeform");
    expect(out.profileUpdates.weeklyRunDaysTarget).toBe(4);
    expect(out.weekSchedule.filter((d) => d.type !== "rest").length).toBe(4);
    expect(out.programState.runPlan).toEqual(
      rollingRunPlan("build_10k", 0, START)
    );
    expect(out.programState.runDays!.length).toBeGreaterThan(0);
    expect(out.programState.runDays!.every((run) => run.date! >= day(1))).toBe(
      true
    );
    // Free, as only half and full marathon race plans are Pro after week 1.
    expect(
      racePlanLocked({ isPro: false, runPlan: { ...out.programState.runPlan } })
    ).toBe(false);
  });

  it("is kept by a lifting save that says nothing of it, and taken away by null", () => {
    const made = buildPlan(makeInput({ rollingGoal: "keep_fit" }));
    const state: ProgramState = {
      ...made.programState,
      runPlan: { ...made.programState.runPlan!, currentWeek: 5 },
    };
    const kept = buildPlan(
      makeInput({ existingState: state, preserveHistory: true })
    );
    expect(kept.programState.runPlan).toMatchObject({
      mode: "rolling",
      rollingGoal: "keep_fit",
      currentWeek: 5,
    });
    expect(kept.profileUpdates.weeklyRunDaysTarget).toBe(4);
    const gone = buildPlan(
      makeInput({
        existingState: state,
        preserveHistory: true,
        rollingGoal: null,
      })
    );
    expect(gone.programState.runPlan).toBeUndefined();
    expect(gone.programState.runDays).toEqual([]);
    expect(gone.profileUpdates.weeklyRunDaysTarget).toBe(0);
    // A new goal starts at its first week.
    const changed = buildPlan(
      makeInput({
        existingState: state,
        preserveHistory: true,
        rollingGoal: "faster_5k",
      })
    );
    expect(changed.programState.runPlan?.currentWeek).toBe(0);
  });

  it("is read only on free running: a race or the starter goal takes its place", () => {
    const state = { runPlan: rollingRunPlan("keep_fit", 2, START) };
    expect(rollingGoalOf(state, profile())).toBe("keep_fit");
    expect(runModeWithPlan(profile(), state)).toBe("rolling");
    expect(rollingGoalOf(state, profile({ runMode: "race_prep" }))).toBeNull();
    expect(rollingGoalOf(state, profile({ runMode: "starter" }))).toBeNull();
    expect(
      rollingGoalOf(
        { runPlan: { mode: "rolling", rollingGoal: "run_far" as RollingGoal } },
        profile()
      )
    ).toBeNull();
    expect(isRunPlanFromNewerBuild(state.runPlan)).toBe(false);
  });

  it("rolls on a week at a time from its runs' week", () => {
    const made = buildPlan(makeInput({ rollingGoal: "keep_fit" }));
    const who = profile();
    expect(weekRolloverAnchor(made.programState, who)).toEqual({
      side: "run",
      weekKey: START,
    });
    const next = nextRunWeek(
      made.programState,
      { weekStart: day(7), date: day(7) },
      who,
      "none"
    );
    expect(next.runPlan).toEqual(rollingRunPlan("keep_fit", 1, day(7)));
    expect(next.runDays!.length).toBe(4);
    expect(next.runDays!.every((run) => run.weekKey === day(7))).toBe(true);
    expect(next.raceBlock).toBeNull();
  });

  it("names the goal and its week on Train", () => {
    expect(
      runHeaderLine({
        runMode: "freeform",
        raceGoal: null,
        currentWeek: 2,
        todayKey: START,
        runsTarget: 4,
        rollingGoal: "build_10k",
      })
    ).toBe("Build to 10K · Week 3");
  });

  it("is chosen at setup, for someone who runs", () => {
    const draft = {
      primaryGoal: "running",
      daysPerWeek: 0,
      equipment: "full_gym",
      gender: "male",
      experience: "intermediate",
      runFrequency: "regular",
      runMode: "freeform",
      rollingGoal: "build_5k",
      weeklyRunDays: 3,
      raceDistance: "10k",
      raceTargetDate: "",
      injuries: [],
      weightKg: 70,
    } as unknown as OnboardingDraft;
    const made = buildOnboardingPlan(draft, "recomp", day(1));
    expect(made.programState.runPlan?.mode).toBe("rolling");
    expect(made.programState.runPlan?.rollingGoal).toBe("build_5k");
    expect(made.profileUpdates.weeklyRunDaysTarget).toBe(3);
    const none = buildOnboardingPlan(
      { ...draft, runFrequency: "none" },
      "recomp",
      day(1)
    );
    expect(none.programState.runPlan).toBeUndefined();
  });
});
