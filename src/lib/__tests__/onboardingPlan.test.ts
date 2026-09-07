import { describe, it, expect } from "vitest";
import { buildOnboardingPlan } from "../onboardingPlan";
import type { OnboardingDraft } from "../onboardingDraft";
import { getRaceGoalPlannerState } from "../raceGoalPlanner";

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "hypertrophy",
  daysPerWeek: 4,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "freeform",
  weeklyRunDays: 3,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "25-34",
  heightCm: 175,
  weightKg: 81.5,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "intermediate",
};
const today = "2026-09-07";

describe("onboarding preview and commit plan", () => {
  it.each(["regular", "occasional", "none"] as const)(
    "never prescribes freeform runs for %s",
    (runFrequency) => {
      const plan = buildOnboardingPlan(
        { ...draft, runFrequency },
        "recomp",
        today
      );
      expect(plan.profileUpdates.runMode).toBe("freeform");
      expect(plan.profileUpdates.weeklyRunDaysTarget).toBe(0);
      expect(
        plan.weekSchedule.filter(
          (day) => day.type === "run" || day.type === "both"
        )
      ).toHaveLength(0);
      expect(
        plan.weekSchedule.filter((day) => day.type === "lift")
      ).toHaveLength(4);
    }
  );
  it.each(["", "2026-09-01"])(
    "resolves race prep with unusable date %s to free running",
    (raceTargetDate) => {
      const plan = buildOnboardingPlan(
        { ...draft, runMode: "race_prep", raceTargetDate },
        "recomp",
        today
      );
      expect(plan.profileUpdates.runMode).toBe("freeform");
      expect(plan.profileUpdates.weeklyRunsTarget).toBe(0);
    }
  );
  it.each([
    "hypertrophy",
    "fat_loss",
    "strength",
    "general",
    "running",
  ] as const)(
    "retains the training goal %s without changing nutrition phase",
    (primaryGoal) => {
      const plan = buildOnboardingPlan(
        { ...draft, primaryGoal },
        "recomp",
        today
      );
      expect(plan.programState.primaryGoal).toBe(primaryGoal);
      expect(plan.programState.goal).toBe("recomp");
      expect(plan.programState.workouts).toHaveLength(4);
    }
  );
  it("shows the same race weekly counts as the existing race planner", () => {
    const raceTargetDate = "2026-12-13";
    const plan = buildOnboardingPlan(
      { ...draft, runMode: "race_prep", raceTargetDate },
      "recomp",
      today
    );
    const preview = getRaceGoalPlannerState({
      distance: "10k",
      targetDate: raceTargetDate,
      currentDate: today,
      liftDays: 4,
      weeklyRunDays: 3,
    });
    expect(plan.profileUpdates.runMode).toBe("race_prep");
    expect(plan.profileUpdates.raceGoal?.targetDate).toBe(raceTargetDate);
    expect(
      plan.weekSchedule.filter(
        (day) => day.type === "run" || day.type === "both"
      )
    ).toHaveLength(preview.recommendedRunDays);
    expect(plan.profileUpdates.weekSchedule).toEqual(plan.weekSchedule);
  });
});
