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
  it("plans a race on at least two run days, whatever an older draft held (A7)", () => {
    const plan = buildOnboardingPlan(
      {
        ...draft,
        runFrequency: "new",
        runMode: "race_prep",
        weeklyRunDays: 1,
        raceTargetDate: "2026-12-06",
      },
      "recomp",
      today
    );
    expect(plan.profileUpdates.runMode).toBe("race_prep");
    expect(plan.profileUpdates.weeklyRunDaysTarget).toBe(2);
    expect(
      plan.weekSchedule.filter(
        (day) => day.type === "run" || day.type === "both"
      )
    ).toHaveLength(2);
  });
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
  /* Run20 (2): setup's week gives the runs a weekend day and the long run
     takes it. Mon, Wed, Fri put a runner-only plan's long run on Monday. */
  it("puts a runner-only race plan's long run on Sunday", () => {
    const plan = buildOnboardingPlan(
      {
        ...draft,
        primaryGoal: "running",
        daysPerWeek: 0,
        runMode: "race_prep",
        raceTargetDate: "2026-12-13",
      },
      "recomp",
      today
    );
    expect(plan.weekSchedule[0].type).toBe("run");
    const long = plan.programState.runDays?.find((rd) => rd.type === "long");
    expect(long?.dayIndex).toBe(0);
  });

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

/* Lift18: setup's lifting unit follows the body-weight unit picked there,
   except stone, which lifts in kg. The plan's kit and the profile's unit
   are written together, and both reach the server as sent. */
describe("the lifting unit a new plan starts on", () => {
  it.each([
    ["lbs", "lbs"],
    ["kg", "kg"],
    ["st", "kg"],
  ] as const)("weighed in %s, lifts in %s", (weightDisplayUnit, unit) => {
    const plan = buildOnboardingPlan(
      { ...draft, weightDisplayUnit },
      "recomp",
      today
    );
    expect(plan.programState.settings?.loadUnit).toBe(unit);
    const programState = sanitizeProgramState(plan.programState).value;
    expect(programState.settings.loadUnit).toBe(unit);
    expect(
      sanitizeProfileData({ liftingWeightUnit: unit }).liftingWeightUnit
    ).toBe(unit);
  });

  it("starts an lb lifter's loads on the lb kit", () => {
    const plan = buildOnboardingPlan(
      { ...draft, weightDisplayUnit: "lbs" },
      "recomp",
      today
    );
    const loaded = plan.programState.workouts
      .flatMap((day) => day.exercises)
      .filter((exercise) => exercise.weight > 0);
    expect(loaded.length).toBeGreaterThan(0);
    for (const exercise of loaded) {
      const lb = Math.round(exercise.weight * 2.20462 * 1000) / 1000;
      // On a 5 lb step, or the lb dumbbell rack's 3, 8 or 12.
      expect(lb % 5 === 0 || [3, 8, 12].includes(lb)).toBe(true);
    }
  });
});

/* Run9's starter goal from setup: the plan the server accepts, through the
   same sanitizers and validator completeOnboarding runs. */
describe("the 30-minute goal from setup", () => {
  const starterDraft = (
    overrides: Partial<OnboardingDraft> = {}
  ): OnboardingDraft => ({
    ...draft,
    primaryGoal: "running" as const,
    daysPerWeek: 0,
    runFrequency: "new" as const,
    runMode: "starter" as const,
    ...overrides,
  });

  it("begins at the first stage, from today, and passes the server's checks", () => {
    const plan = buildOnboardingPlan(starterDraft(), "recomp", today);
    expect(plan.profileUpdates.runMode).toBe("starter");
    expect(plan.programState.runPlan).toMatchObject({
      mode: "starter",
      stage: 1,
    });
    expect(
      plan.programState.runDays?.every((d) => d.templateId === "run_walk_1")
    ).toBe(true);
    const profileData = sanitizeProfileData({
      ...plan.profileUpdates,
      starterGoal: { startedOn: today },
    });
    expect(profileData.starterGoal).toEqual({ startedOn: today });
    expect(
      validatePlanPayload({
        profileData,
        programState: sanitizeProgramState(plan.programState).value,
        weekSchedule: plan.weekSchedule,
      })
    ).toEqual([]);
  });

  it("plans two or three runs a week, three unless two are asked for", () => {
    for (const [asked, planned] of [
      [7, 3],
      [3, 3],
      [2, 2],
      [1, 2],
    ] as const) {
      const plan = buildOnboardingPlan(
        starterDraft({ weeklyRunDays: asked }),
        "recomp",
        today
      );
      expect(plan.profileUpdates.weeklyRunDaysTarget).toBe(planned);
    }
  });

  it("is free running for someone who does not run", () => {
    const plan = buildOnboardingPlan(
      starterDraft({ runFrequency: "none", daysPerWeek: 3 }),
      "recomp",
      today
    );
    expect(plan.profileUpdates.runMode).toBe("freeform");
  });
});
