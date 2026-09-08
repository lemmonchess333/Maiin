import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  sanitizeProfileData,
} = require("../../../functions/profileSanitizer.js");
const {
  sanitizeProgramState,
} = require("../../../functions/lib/programStateSanitizer.js");
const {
  validatePlanPayload,
} = require("../../../functions/lib/validatePlanPayload.js");
import {
  buildOnboardingPlan,
  onboardingActivity,
  onboardingFlow,
} from "../onboardingPlan";
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

describe("supported running-only plans", () => {
  it.each(["freeform", "race_prep"] as const)(
    "creates %s with zero lifts using the existing builder",
    (runMode) => {
      const plan = buildOnboardingPlan(
        {
          ...draft,
          primaryGoal: "running",
          daysPerWeek: 0,
          runMode,
          raceTargetDate: "2026-12-13",
        },
        "recomp",
        today
      );
      expect(plan.programState.workouts).toEqual([]);
      const profileData = sanitizeProfileData({
        ...plan.profileUpdates,
        daysPerWeek: 0,
      });
      const programState = sanitizeProgramState(plan.programState).value;
      expect(profileData.daysPerWeek).toBe(0);
      expect(profileData.weeklyWorkoutsTarget).toBe(0);
      expect(programState.workouts).toEqual([]);
      expect(
        validatePlanPayload({
          profileData,
          programState,
          weekSchedule: plan.weekSchedule,
        })
      ).toEqual([]);
      expect(
        plan.weekSchedule.some(
          (day) => day.type === "lift" || day.type === "both"
        )
      ).toBe(false);
      expect(plan.profileUpdates.weeklyWorkoutsTarget).toBe(0);
      expect(plan.profileUpdates.weeklyRunDaysTarget).toBe(
        runMode === "freeform" ? 0 : 3
      );
      expect(plan.programState.runDays?.length ?? 0).toBe(
        runMode === "freeform" ? 0 : 3
      );
    }
  );
  it("derives activity from older drafts without changing their week", () => {
    expect(onboardingActivity(draft)).toBe("both");
    expect(onboardingActivity({ ...draft, runFrequency: "none" })).toBe(
      "lifting"
    );
    expect(onboardingActivity({ ...draft, daysPerWeek: 0 })).toBe("running");
    expect(onboardingFlow("running")).toEqual([0, 1, 3, 5, 7]);
    expect(onboardingFlow("lifting")).toEqual([0, 1, 2, 4, 5, 7]);
    expect(onboardingFlow("both")).toEqual([0, 1, 3, 2, 4, 5, 7]);
  });
});
