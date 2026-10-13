import { describe, it, expect } from "vitest";
import type { UserProfile } from "@/lib/auth";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import {
  targetKit,
  volumeTargetsFor,
  weeklyVolumeTargets,
} from "../volumeTargets";
import {
  classifyVolume,
  judgementLandmark,
  weeklyVolumeByJudgementMuscle,
  JUDGEMENT_MUSCLE_ORDER,
} from "../volumeModel";
import { normalizeProgramState } from "../programTypes";

describe("weeklyVolumeTargets — what the days and time can fit (Lift4 (5))", () => {
  const targets = (
    days: number,
    sessionMinutes: number,
    experience: "beginner" | "intermediate" = "intermediate"
  ) =>
    weeklyVolumeTargets({
      goal: "hypertrophy",
      experience,
      days,
      sessionMinutes,
    });

  it("never asks past the weekly floor, and keeps the band's ceiling", () => {
    const t = targets(4, 75);
    for (const muscle of JUDGEMENT_MUSCLE_ORDER) {
      const band = judgementLandmark("hypertrophy", muscle, "intermediate");
      expect(t.get(muscle)!.low, muscle).toBeLessThanOrEqual(band.low);
      expect(t.get(muscle)!.high, muscle).toBe(band.high);
    }
  });

  it("asks less of shorter sessions and fewer days", () => {
    const sum = (t: ReturnType<typeof targets>) =>
      [...t.values()].reduce((n, b) => n + b.low, 0);
    expect(sum(targets(4, 30))).toBeLessThan(sum(targets(4, 75)));
    expect(sum(targets(2, 60))).toBeLessThan(sum(targets(4, 60)));
  });

  it("gives a beginner the lower tier's ceiling", () => {
    const beginner = targets(4, 60, "beginner");
    const intermediate = targets(4, 60);
    expect(beginner.get("Chest")!.high).toBeLessThan(
      intermediate.get("Chest")!.high
    );
  });
});

describe("weeklyVolumeTargets — the person's own week", () => {
  const setup: OnboardingDraft = {
    step: 7,
    primaryGoal: "hypertrophy",
    daysPerWeek: 3,
    sessionMinutes: 60,
    equipment: "full_gym",
    runFrequency: "none",
    runMode: "freeform",
    weeklyRunDays: 0,
    raceDistance: "10k",
    raceTargetDate: "",
    injuries: ["none"],
    gender: "female",
    ageRange: "25-34",
    heightCm: 168,
    weightKg: 65,
    heightUnit: "cm",
    weightUnit: "kg",
    trainingWhy: "",
    experience: "intermediate",
  };
  /** A first plan as setup builds it, and the profile it writes. */
  const firstPlan = (answers: Partial<OnboardingDraft>) => {
    const plan = buildOnboardingPlan(
      { ...setup, ...answers },
      "recomp",
      "2026-09-07"
    );
    const profile = {
      weightKg: 65,
      sex: "female",
      ...plan.profileUpdates,
    } as unknown as UserProfile;
    return { state: normalizeProgramState(plan.programState), profile };
  };
  const people: Partial<OnboardingDraft>[] = [
    {},
    { experience: "beginner", daysPerWeek: 2, sessionMinutes: 30 },
    { experience: "beginner", equipment: "home_gym", daysPerWeek: 4 },
    { equipment: "minimal", injuries: ["lower_back"], daysPerWeek: 3 },
    { primaryGoal: "strength", daysPerWeek: 4, sessionMinutes: 30 },
    {
      primaryGoal: "general",
      experience: "advanced",
      daysPerWeek: 5,
      sessionMinutes: 45,
    },
  ];

  it("never reads a first plan, untouched, below its targets", () => {
    // The week that fits is built on the person's kit, injuries, level and
    // bodyweight: a generic full-gym week asked a dumbbell plan for sets it
    // could not hold, and flagged most new plans' muscles below target.
    for (const answers of people) {
      const { state, profile } = firstPlan(answers);
      const targets = weeklyVolumeTargets({
        goal: state.primaryGoal,
        experience: profile.experience,
        days: state.workouts.length,
        sessionMinutes: state.sessionMinutes,
        ...targetKit(profile),
      });
      const low = weeklyVolumeByJudgementMuscle(state.workouts).filter(
        ({ muscle, sets }) =>
          classifyVolume(sets, targets.get(muscle)!) === "low"
      );
      expect(low, JSON.stringify(answers)).toEqual([]);
    }
  });

  it("gives History the targets Train judges the same person against", () => {
    for (const answers of people) {
      const { state, profile } = firstPlan(answers);
      expect(volumeTargetsFor(profile), JSON.stringify(answers)).toEqual(
        weeklyVolumeTargets({
          goal: state.primaryGoal,
          experience: profile.experience,
          days: state.workouts.length,
          sessionMinutes: state.sessionMinutes,
          ...targetKit(profile),
        })
      );
    }
  });

  it("brings the minimum down with a floor lowered to what fits", () => {
    const t = weeklyVolumeTargets({
      goal: "hypertrophy",
      experience: "beginner",
      days: 2,
      sessionMinutes: 30,
    });
    for (const muscle of JUDGEMENT_MUSCLE_ORDER) {
      const { mv, low } = t.get(muscle)!;
      expect(mv, muscle).toBeLessThanOrEqual(low);
    }
  });
});
