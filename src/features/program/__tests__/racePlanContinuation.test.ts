import { describe, it, expect } from "vitest";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { generateRacePlanV2 } from "../runScheduler";
import { dateForDayOfWeek } from "@/lib/dateHelpers";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { continuedBlockWeeks } from "../racePlanContinuation";

const goal = { distance: "marathon" as const, targetDate: "2026-11-29" };
const base: PlanBuilderInput = {
  primaryGoal: "general",
  nutritionPhase: "recomp",
  experience: "intermediate",
  liftDays: 2,
  preferredSplit: "full_body",
  runMode: "race_prep",
  weeklyRunDays: 4,
  equipment: "full_gym",
  injuries: [],
  currentDate: "2026-06-01",
  raceGoal: goal,
};
const today = "2026-10-12";
function midBlock() {
  const original = buildPlan(base);
  const week = generateRacePlanV2({
    weekSchedule: original.weekSchedule,
    raceGoal: goal,
    currentDate: today,
    weekStart: today,
    weeklyRunDays: 4,
    recentLayoff: "none",
    planTotalWeeks: original.programState.runPlan!.totalWeeks,
  });
  return {
    ...original.programState,
    runDays: week.weeks[0],
    runPlan: {
      ...original.programState.runPlan!,
      currentWeek: original.programState.runPlan!.totalWeeks! - week.totalWeeks,
    },
  };
}

describe("same-race plan edits", () => {
  it("keeps chosen weekdays and the returning-runner guard in preview and save", () => {
    const existing = midBlock();
    const customWeek = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      type: ([0, 1, 3, 5].includes(day)
        ? "run"
        : day === 2 || day === 4
          ? "lift"
          : "rest") as "run" | "lift" | "rest",
    }));
    const limits = { sessionMinutes: 30, longRunMinutes: 45 };
    const saved = buildPlan({
      ...base,
      currentDate: today,
      preserveHistory: true,
      existingState: existing,
      weekSchedule: customWeek,
      recentLayoff: "detrained",
      runTimeLimits: limits,
    });
    expect(saved.weekSchedule).toEqual(customWeek);
    expect(
      saved.programState.runDays!.map((run) => run.dayIndex).sort()
    ).toEqual([0, 1, 3, 5]);
    expect(
      saved.programState.runDays!.some((run) =>
        ["tempo", "intervals"].includes(run.type)
      )
    ).toBe(false);
    const preview = getRaceGoalPlannerState({
      distance: goal.distance,
      targetDate: goal.targetDate,
      currentDate: today,
      liftDays: 2,
      weeklyRunDays: 4,
      existingState: existing,
      weekSchedule: customWeek,
      recentLayoff: "detrained",
      runTimeLimits: limits,
    });
    expect(preview.firstWeekMinutes).toBe(
      saved.programState.runDays!.reduce(
        (sum, run) =>
          sum +
          RUN_TEMPLATES.find((template) => template.id === run.templateId)!
            .estimatedDuration,
        0
      )
    );
    const changed = buildPlan({
      ...base,
      currentDate: today,
      weeklyRunDays: 3,
      weekSchedule: customWeek,
    });
    expect(
      changed.weekSchedule.filter(
        (day) => day.type === "run" || day.type === "both"
      )
    ).toHaveLength(3);
  });

  it("keeps block position and matches the actual preview and saved prescription", () => {
    const existing = midBlock();
    const limits = { sessionMinutes: 30, longRunMinutes: 45 };
    const saved = buildPlan({
      ...base,
      currentDate: today,
      preserveHistory: true,
      existingState: existing,
      runTimeLimits: limits,
    });
    expect(saved.programState.runPlan?.currentWeek).toBe(
      existing.runPlan.currentWeek
    );
    expect(saved.programState.runPlan?.totalWeeks).toBe(
      existing.runPlan.totalWeeks
    );
    expect(
      saved.programState.runDays?.some((run) =>
        ["tempo", "intervals"].includes(run.type)
      )
    ).toBe(true);
    const preview = getRaceGoalPlannerState({
      distance: goal.distance,
      targetDate: goal.targetDate,
      currentDate: today,
      liftDays: 2,
      weeklyRunDays: 4,
      runTimeLimits: limits,
      existingState: existing,
    });
    expect(preview.firstWeekPhase).toMatch(/build/i);
    const minutes = saved.programState.runDays!.reduce(
      (total, run) =>
        total +
        RUN_TEMPLATES.find((template) => template.id === run.templateId)!
          .estimatedDuration,
      0
    );
    expect(preview.firstWeekMinutes).toBe(minutes);
    const restored = buildPlan({
      ...base,
      currentDate: today,
      preserveHistory: true,
      existingState: saved.programState,
      runTimeLimits: { sessionMinutes: null, longRunMinutes: null },
    });
    expect(restored.programState.runDays).toEqual(existing.runDays);
  });

  it("retains completed and manually completed runs, swaps and move identity", () => {
    const existing = midBlock();
    const [completed, manual, moved, swapped] = existing.runDays!;
    completed.completed = true;
    completed.status = "completed_exact";
    const freeDay = [0, 1, 2, 3, 4, 5, 6].find(
      (day) => !existing.runDays!.some((run) => run.dayIndex === day)
    )!;
    moved.movedFromDate = moved.date;
    moved.date = dateForDayOfWeek(today, freeDay);
    moved.movedToDate = moved.date;
    moved.dayIndex = freeDay;
    swapped.userOverride = "easy_30";
    const map = { [manual.id!]: { completedAt: 100 } };
    const saved = buildPlan({
      ...base,
      currentDate: today,
      preserveHistory: true,
      existingState: { ...existing, manualCompletions: map },
      runTimeLimits: { sessionMinutes: 30, longRunMinutes: 30 },
    });
    for (const run of existing.runDays!)
      expect(saved.programState.runDays).toContainEqual(run);
    expect(saved.programState.runDays).toHaveLength(existing.runDays!.length);
    expect(saved.programState.manualCompletions).toEqual(map);
  });

  it("keeps recovery while editing other programme settings", () => {
    const existing = midBlock();
    existing.runPlan = {
      ...existing.runPlan,
      phase: "recovery",
      recoveryEndDate: "2026-12-27",
      completedRaces: ["race-completed"],
    };
    const saved = buildPlan({
      ...base,
      currentDate: today,
      preserveHistory: true,
      existingState: existing,
      runTimeLimits: { sessionMinutes: 30, longRunMinutes: 45 },
    });
    expect(saved.programState.runPlan).toEqual(existing.runPlan);
    expect(saved.programState.runDays).toEqual(existing.runDays);
  });

  it("starts a different race as a new block and rejects non-finite block carry", () => {
    const saved = buildPlan({
      ...base,
      currentDate: today,
      raceGoal: { ...goal, targetDate: "2027-04-04" },
      preserveHistory: true,
      existingState: midBlock(),
    });
    expect(saved.programState.runPlan?.currentWeek).toBe(0);
    expect(continuedBlockWeeks(8, { mode: "race_prep", totalWeeks: NaN })).toBe(
      8
    );
  });
});
