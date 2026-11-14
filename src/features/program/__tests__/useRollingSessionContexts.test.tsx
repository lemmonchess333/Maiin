// @vitest-environment jsdom
/**
 * "Why this run"'s places in a plan with no race date (Run24 (3)), read
 * once a page: the weeks come from the run generator, fetched only for
 * someone on such a plan, so Home's first paint never carries it.
 */
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import type { UserProfile } from "@/lib/auth";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { migrateProgramState } from "../migrations";
import { normalizeProgramState } from "../programTypes";
import { useRollingSessionContexts } from "../useRollingSessionContexts";

const TODAY = localDateString(new Date());
const MONDAY = localWeekKey(parseLocalDate(TODAY));

const draft: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 0,
  equipment: "full_gym",
  runFrequency: "regular",
  runMode: "freeform",
  weeklyRunDays: 3,
  raceDistance: "10k",
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

function plan(rollingGoal: OnboardingDraft["rollingGoal"]) {
  const built = buildOnboardingPlan(
    { ...draft, rollingGoal },
    "recomp",
    MONDAY
  );
  return {
    profile: { uid: "u", ...built.profileUpdates } as unknown as UserProfile,
    programState: migrateProgramState(
      normalizeProgramState(built.programState),
      MONDAY
    ),
  };
}

describe("useRollingSessionContexts", () => {
  it("reads a plan's weeks once the generator has loaded", async () => {
    const { result } = renderHook(() =>
      useRollingSessionContexts({
        ...plan("build_5k"),
        recentLayoff: "none",
        recentRuns: null,
        today: TODAY,
      })
    );
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.get(MONDAY)).toMatchObject({
      goal: "build_5k",
      opening: true,
      lighter: false,
      longRun: { topKm: 8, holding: false },
    });
  });

  it("is null without a plan with no race date", () => {
    const free = plan(null);
    const { result } = renderHook(() =>
      useRollingSessionContexts({
        ...free,
        recentLayoff: "none",
        recentRuns: null,
        today: TODAY,
      })
    );
    expect(result.current).toBeNull();
  });
});
