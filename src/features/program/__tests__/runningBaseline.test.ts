import { computePlanMetadata } from "@/lib/runPlanMetadata";
import { describe, expect, it } from "vitest";
import {
  fitWeekToRunningBaseline,
  isRunningBaseline,
  runningClimb,
  type RunningBaseline,
} from "../runningBaseline";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { generateRacePlanV2 } from "../runScheduler";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { ScheduledRunDay } from "../programTypes";

const baseline: RunningBaseline = {
  version: 1,
  experience: "building",
  weeklyMinutes: 90,
  longestRunMinutes: 40,
  confirmedAt: "2026-09-07",
  source: "self_reported",
};
const input: PlanBuilderInput = {
  primaryGoal: "general",
  nutritionPhase: "recomp",
  experience: "intermediate",
  liftDays: 2,
  preferredSplit: "full_body",
  runMode: "race_prep",
  weeklyRunDays: 3,
  equipment: "full_gym",
  injuries: [],
  currentDate: "2026-09-07",
  raceGoal: { distance: "marathon", targetDate: "2026-12-06" },
};
const duration = (row: ScheduledRunDay) =>
  RUN_TEMPLATES.find((t) => t.id === row.templateId)!.estimatedDuration;

describe("confirmed running starting point", () => {
  it("changes a real plan, commits the report and agrees with the exact preview", () => {
    const original = buildPlan(input);
    const plan = buildPlan({
      ...input,
      runningBaseline: baseline,
      preserveHistory: true,
      existingState: original.programState,
    });
    const preview = getRaceGoalPlannerState({
      distance: "marathon",
      targetDate: input.raceGoal!.targetDate,
      currentDate: input.currentDate,
      liftDays: 2,
      weeklyRunDays: 3,
      runningBaseline: baseline,
    });
    expect(plan.profileUpdates.runningBaseline).toEqual(baseline);
    expect(plan.programState.runDays).not.toEqual(
      original.programState.runDays
    );
    expect(
      plan.programState.runDays!.reduce((sum, row) => sum + duration(row), 0)
    ).toBe(preview.firstWeekMinutes);
    expect(preview.firstWeekMinutes).toBeLessThanOrEqual(90);
    // The first week's long run is the rung at or under the longest run
    // given, run as a long run; the rest are easy.
    const runs = plan.programState.runDays!;
    expect(runs.find((row) => row.type === "long")?.templateId).toBe("long_6k");
    expect(
      runs.every((row) => row.type === "easy" || row.type === "long")
    ).toBe(true);
    expect(Math.max(...runs.map(duration))).toBeLessThanOrEqual(40);
    expect(plan.programState.runDays!.map((row) => row.date)).toEqual(
      original.programState.runDays!.map((row) => row.date)
    );
    expect(plan.programState.workouts).toEqual(original.programState.workouts);
  });
  it("carries a short timed prescription into launch and tracking", () => {
    const plan = buildPlan({
      ...input,
      runningBaseline: {
        ...baseline,
        weeklyMinutes: 30,
        longestRunMinutes: 10,
      },
    });
    const row = plan.programState.runDays![0];
    const result = computePlanMetadata({
      profileRunMode: "race_prep",
      todayDayIndex: row.dayIndex,
      todayDate: row.date,
      runPlan: plan.programState.runPlan,
      runDays: plan.programState.runDays,
      urlTemplateId: row.templateId,
      urlType: null,
      displayUnit: "km",
    });
    expect(result.prefill.target).toEqual({ type: "time", value: 600 });
    expect(result.prefill.segments).toEqual([
      expect.objectContaining({
        type: "easy",
        target: { kind: "duration", seconds: 600 },
      }),
    ]);
    expect(result.metadata.scheduledRunId).toBe(row.id);
  });
  it("keeps legacy output and removal explicit", () => {
    expect(
      buildPlan({ ...input, runningBaseline: null }).programState.runDays
    ).toEqual(buildPlan(input).programState.runDays);
    expect(
      buildPlan({ ...input, runningBaseline: null }).profileUpdates
        .runningBaseline
    ).toBeNull();
  });
  it("keeps completed, moved, skipped and explicitly swapped history after a reviewed save", () => {
    const original = buildPlan(input);
    const rows = original.programState.runDays!;
    rows[0] = { ...rows[0], completed: true, status: "completed_exact" };
    rows[1] = { ...rows[1], userOverride: "easy_50" };
    rows[2] = {
      ...rows[2],
      movedFromDate: rows[2].date,
      date: "2026-09-12",
      dayIndex: 6,
    };
    const saved = buildPlan({
      ...input,
      runningBaseline: baseline,
      preserveHistory: true,
      existingState: original.programState,
    });
    for (const row of rows)
      expect(saved.programState.runDays).toContainEqual(row);
  });
  it("preserves race day and regenerates the same future weeks, and a start above the race's curve shapes nothing", () => {
    const weekSchedule = buildPlan(input).weekSchedule;
    const args = {
      weekSchedule,
      raceGoal: input.raceGoal!,
      weeklyRunDays: 3,
      currentDate: input.currentDate,
      weekStart: input.currentDate,
      recentLayoff: "none" as const,
      runningBaseline: {
        ...baseline,
        experience: "regular" as const,
        weeklyMinutes: 400,
        longestRunMinutes: 150,
      },
    };
    const block = generateRacePlanV2(args);
    const unrestricted = generateRacePlanV2({ ...args, runningBaseline: null });
    expect(block.weeks.flat().filter((row) => row.type === "race")).toEqual(
      unrestricted.weeks.flat().filter((row) => row.type === "race")
    );
    for (let i = 0; i < block.totalWeeks; i++) {
      const date = localDateString(
        addLocalDays(parseLocalDate(input.currentDate), 7 * i)
      );
      const regenerated = generateRacePlanV2({
        ...args,
        currentDate: date,
        weekStart: date,
        planTotalWeeks: block.totalWeeks,
      });
      expect(regenerated.weeks[0]).toEqual(block.weeks[i]);
    }
    // 400 minutes a week and a 150-minute run are past anything this
    // marathon asks for: the race's curve is the plan, every week, and no
    // week turns easy for want of a review.
    expect(block.weeks).toEqual(unrestricted.weeks);
  });
  it("does not delete days or disguise a floor that exceeds the report", () => {
    const week: ScheduledRunDay[] = [0, 1, 2].map((dayIndex) => ({
      dayIndex,
      templateId: "easy_30",
      type: "easy",
    }));
    const start = { ...baseline, weeklyMinutes: 10, longestRunMinutes: 10 };
    const result = fitWeekToRunningBaseline(
      week,
      start,
      runningClimb(start, start.confirmedAt)
    );
    expect(result).toHaveLength(3);
    expect(result.reduce((sum, row) => sum + duration(row), 0)).toBe(30);
    expect(week.every((row) => row.templateId === "easy_30")).toBe(true);
  });

  it.each([
    null,
    {},
    { ...baseline, weeklyMinutes: 0 },
    { ...baseline, longestRunMinutes: 100 },
    { ...baseline, experience: "expert" },
    { ...baseline, confirmedAt: "2026-02-30" },
    { ...baseline, weeklyMinutes: Infinity },
  ])("rejects invalid report %#", (value) =>
    expect(isRunningBaseline(value)).toBe(false)
  );
});
