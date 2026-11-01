/**
 * R5 and R6 (owner, 1 November 2026): a race plan starts from the person's
 * own running and climbs, and a plan made partway through a week starts with
 * a lead-in. The owner set up a marathon on a Sunday evening, having run
 * 2.85 km that afternoon, and was handed "Due today: Long 12K".
 */
import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { planWeekSchedule } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { claimMapFor } from "@/lib/runClaims";
import { isRunDayComplete } from "@/lib/scheduledRunCompletion";
import type { UserProfile } from "@/lib/auth";
import { runningClimb, type RunningBaseline } from "../runningBaseline";
import { baselineFromRecentRunning } from "../runningStartDraft";
import { generateRacePlanV2 } from "../runScheduler";
import { plannedRunMinutes } from "../runTimeLimits";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { nextRunWeek, regenerateRacePlan } from "../weekRollover";
import type { ScheduledRunDay } from "../programTypes";

const minutesOf = (id: string) =>
  plannedRunMinutes(
    RUN_TEMPLATES.find((t) => t.id === id)!,
    null
  );
const shift = (key: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(key), days));

/** The owner's set-up: Sunday 1 November 2026, the London Marathon on
 *  24 April 2027, six run days and four lift days, every default. */
const SUNDAY = "2026-11-01";
const RACE = "2027-04-24";
const OWNER: RunningBaseline = {
  version: 1,
  experience: "building",
  weeklyMinutes: 25,
  longestRunMinutes: 25,
  confirmedAt: SUNDAY,
  source: "recorded",
};
const ownerPlan = (
  runningBaseline: RunningBaseline | null,
  currentDate = SUNDAY
): ReturnType<typeof generateRacePlanV2> =>
  generateRacePlanV2({
    weekSchedule: planWeekSchedule(4, 6, undefined),
    raceGoal: { distance: "marathon", targetDate: RACE },
    weeklyRunDays: 6,
    currentDate,
    weekStart: localWeekKey(parseLocalDate(currentDate)),
    recentLayoff: "none",
    runningBaseline,
  });

describe("the starting point is where the plan starts, and it climbs (R5, R6)", () => {
  it("climbs a rung a week from the rung at or under the longest run", () => {
    const start = { ...OWNER, confirmedAt: "2026-11-02" }; // a Monday
    const weeks = [0, 1, 2, 3, 4, 5, 6].map(
      (n) => runningClimb(start, shift("2026-11-02", n * 7)).longestMinutes
    );
    // easy 20, easy 30, then the long runs' ladder: 6, 8, 10, 12 and 15 km.
    expect(weeks).toEqual([20, 30, 35, 45, 55, 65, 80]);
    // The rest of the week starts at what was reported beside that run,
    // and climbs ten minutes a week.
    expect(
      [0, 1, 2].map(
        (n) => runningClimb(start, shift("2026-11-02", n * 7)).otherMinutes
      )
    ).toEqual([5, 15, 25]);
  });

  it("holds a rung under in the plan's step-back weeks, and doesn't move on", () => {
    const start = { ...OWNER, confirmedAt: "2026-11-02" };
    const stepBack = (key: string) => key === "2026-11-16";
    const at = (n: number) =>
      runningClimb(start, shift("2026-11-02", n * 7), {
        isStepBack: stepBack,
      }).longestMinutes;
    expect([at(0), at(1), at(2), at(3)]).toEqual([20, 30, 20, 35]);
  });

  it("counts from the Monday after a start given Thursday to Sunday", () => {
    // Given on the Sunday, the week it was given in is a lead-in.
    expect(runningClimb(OWNER, "2026-10-26").longestMinutes).toBe(20);
    expect(runningClimb(OWNER, "2026-11-02").longestMinutes).toBe(20);
    expect(runningClimb(OWNER, "2026-11-09").longestMinutes).toBe(30);
  });

  it("starts the owner's marathon from their own running, never past the race's plan", () => {
    const withStart = ownerPlan(OWNER);
    const without = ownerPlan(null);
    // Not a 12 km long run in the first week: the first long run is a
    // 20-minute run, on the next weekend.
    const firstWeek = withStart.weeks[1];
    expect(firstWeek.find((run) => run.date === "2026-11-08")?.templateId).toBe(
      "easy_20"
    );
    expect(without.weeks[1].some((run) => run.templateId === "long_12k")).toBe(
      true
    );
    // The race's plan stays the upper bound: no run, any day, is longer.
    const curve = new Map(
      without.weeks.flat().map((run) => [run.date, run.templateId])
    );
    for (const run of withStart.weeks.flat())
      expect(minutesOf(run.templateId), run.date).toBeLessThanOrEqual(
        minutesOf(curve.get(run.date)!)
      );
    // The long run climbs a rung a week at most, by the ladder the climb
    // uses, and reaches the race plan's peak before the taper.
    const ladder = [10, 20, 30, 35, 45, 55, 65, 80, 110, 140, 170];
    const longest = withStart.weeks
      .slice(1, -1)
      .map((week) => Math.max(...week.map((run) => minutesOf(run.templateId))));
    let highest = ladder.indexOf(longest[0]);
    for (const minutes of longest) {
      const rung = ladder.findIndex((m) => m >= minutes);
      expect(rung).toBeLessThanOrEqual(highest + 1);
      highest = Math.max(highest, rung);
    }
    expect(
      withStart.weeks.flat().some((run) => run.templateId === "long_25k")
    ).toBe(true);
  });

  it("keeps a regular runner's tempo while their running builds, and turns a building runner's easy", () => {
    const at = (experience: RunningBaseline["experience"]) =>
      ownerPlan({
        ...OWNER,
        experience,
        weeklyMinutes: 120,
        longestRunMinutes: 50,
      })
        .weeks.flat()
        .filter((run) => run.date! < "2027-03-01");
    const quality = (runs: ScheduledRunDay[]) =>
      runs.filter((run) => run.type === "tempo" || run.type === "intervals");
    expect(quality(at("regular")).length).toBeGreaterThan(0);
    const building = at("building");
    // Easy while the start still holds the week under the plan's...
    expect(quality(building.filter((run) => run.date! < "2027-01-01"))).toEqual(
      []
    );
  });

  it("a lower report the person confirms caps the plan", () => {
    const higher = ownerPlan({
      ...OWNER,
      weeklyMinutes: 90,
      longestRunMinutes: 45,
    });
    const lower = ownerPlan(OWNER);
    const total = (week: ScheduledRunDay[]) =>
      week.reduce((sum, run) => sum + minutesOf(run.templateId), 0);
    for (let i = 1; i < 6; i++)
      expect(total(lower.weeks[i])).toBeLessThanOrEqual(total(higher.weeks[i]));
  });

  it("no longer turns a week easy four weeks on for want of a review", () => {
    // Given six weeks before a week that holds a tempo, by someone who runs
    // regularly: their running has climbed past the plan by then.
    const regular: RunningBaseline = {
      ...OWNER,
      experience: "regular",
      weeklyMinutes: 200,
      longestRunMinutes: 80,
      confirmedAt: "2026-09-14",
    };
    const plan = ownerPlan(regular);
    expect(plan.weeks).toEqual(ownerPlan(null).weeks);
  });

  it("fills a starting point from the runs recorded in the last four weeks", () => {
    // One 25-minute run in four weeks: about 25 a week, not 6.
    expect(
      baselineFromRecentRunning(
        { count: 1, averageWeeklyMinutes: 25.3 / 4, longestMinutes: 25.3 },
        SUNDAY,
        "building"
      )
    ).toEqual({ ...OWNER });
    expect(
      baselineFromRecentRunning(
        { count: 0, averageWeeklyMinutes: 0, longestMinutes: 0 },
        SUNDAY,
        "building"
      )
    ).toBeNull();
  });
});

describe("a plan made partway through a week starts with a lead-in (D)", () => {
  it("holds the days left in the owner's week as easy runs, and the first long run is the next weekend's", () => {
    for (const start of [null, OWNER]) {
      const plan = ownerPlan(start);
      expect(plan.leadInWeek).toBe("2026-10-26");
      const leadIn = plan.weeks[0];
      // Sunday, the day it was made, and nothing before it.
      expect(leadIn.map((run) => run.date)).toEqual([SUNDAY]);
      expect(leadIn.every((run) => run.type === "easy")).toBe(true);
      expect(
        plan.weeks[1].some(
          (run) => run.date === "2026-11-08" && run.dayIndex === 0
        )
      ).toBe(true);
    }
  });

  it("doesn't count the lead-in as one of the race's weeks", () => {
    const plan = ownerPlan(null);
    // 25 weeks from Monday 2 November to race week, the runway the editor
    // gives as "25 weeks out", with the lead-in before them.
    expect(plan.totalWeeks).toBe(25);
    expect(plan.weeks).toHaveLength(26);
    expect(plan.weeks[25].some((run) => run.type === "race")).toBe(true);
  });

  it("has no lead-in for a plan made Monday to Wednesday", () => {
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-28"])
      expect(ownerPlan(null, day).leadInWeek, day).toBeNull();
    for (const day of ["2026-10-29", "2026-10-30", "2026-10-31", SUNDAY])
      expect(ownerPlan(null, day).leadInWeek, day).toBe("2026-10-26");
  });

  it("counts a run already done that day for the lead-in's run", () => {
    const leadIn = ownerPlan(OWNER).weeks[0];
    const claims = claimMapFor(
      leadIn,
      [{ id: "afternoon", date: SUNDAY, distance: 2850, duration: 1516 }],
      {},
      SUNDAY
    );
    expect(isRunDayComplete(leadIn[0].id!, claims)).toBe(true);
  });

  const input: PlanBuilderInput = {
    primaryGoal: "general",
    nutritionPhase: "recomp",
    experience: "intermediate",
    liftDays: 4,
    preferredSplit: "full_body",
    runMode: "race_prep",
    weeklyRunDays: 6,
    equipment: "full_gym",
    injuries: [],
    currentDate: SUNDAY,
    raceGoal: { distance: "marathon", targetDate: RACE },
    runningBaseline: OWNER,
  };

  it("saves the lead-in and its week, and the rollover makes the next week the plan's first", () => {
    const made = buildPlan(input);
    const plan = made.programState.runPlan!;
    expect(plan.leadInWeek).toBe("2026-10-26");
    expect(plan.currentWeek).toBe(0);
    expect(plan.totalWeeks).toBe(25);
    const profile = {
      uid: "u",
      ...made.profileUpdates,
    } as unknown as UserProfile;
    const week1 = nextRunWeek(
      made.programState,
      { weekStart: "2026-11-02", date: "2026-11-02" },
      profile,
      "none"
    );
    expect(week1.runPlan?.currentWeek).toBe(0);
    expect(week1.runPlan?.leadInWeek).toBeUndefined();
    expect(week1.runDays?.some((run) => run.date === "2026-11-08")).toBe(true);
    const week2 = nextRunWeek(
      { ...made.programState, ...week1 },
      { weekStart: "2026-11-09", date: "2026-11-09" },
      profile,
      "none"
    );
    expect(week2.runPlan?.currentWeek).toBe(1);
  });

  it("stays a lead-in when the week is built again before it ends", () => {
    const made = buildPlan(input);
    const plan = made.programState.runPlan!;
    const profile = {
      uid: "u",
      ...made.profileUpdates,
    } as unknown as UserProfile;
    const rebuilt = regenerateRacePlan({
      profile,
      raceGoal: input.raceGoal!,
      weekSchedule: made.weekSchedule,
      weeklyRunDays: 6,
      currentDate: SUNDAY,
      weekStart: "2026-10-26",
      recentLayoff: "none",
      plannedFrom: SUNDAY,
      carry: {
        currentWeek: plan.currentWeek,
        totalWeeks: plan.totalWeeks,
        leadInWeek: plan.leadInWeek,
      },
      prior: { runDays: made.programState.runDays ?? [] },
    });
    expect(rebuilt.runDays).toEqual(made.programState.runDays);
    expect(rebuilt.runPlan.leadInWeek).toBe("2026-10-26");
    expect(rebuilt.runPlan.totalWeeks).toBe(25);
  });
});
