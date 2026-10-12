import { describe, expect, it } from "vitest";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { migrateProgramState } from "../migrations";
import { normalizeProgramState, type ProgramState } from "../programTypes";
import { refitSessionsToTime } from "../sessionFit";

/* Lift4 (5): a plan is fitted to the session length the person chose, and
   its main lifts keep at least two sets. The loader runs every stored plan
   through `migrateProgramState`, so the fit has to survive it. */

const answers = (over: Partial<OnboardingDraft>): OnboardingDraft => ({
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 2,
  equipment: "home_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "female",
  ageRange: "25-34",
  heightCm: 168,
  weightKg: 70,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  ...over,
});

const setsOf = (state: ProgramState) =>
  state.workouts.map((d) => d.exercises.map((ex) => ex.sets));
const twoSetMains = (state: ProgramState) =>
  state.workouts
    .flatMap((d) => d.exercises)
    .filter((ex) => ex.isAccessory !== true && ex.sets === 2);
const load = (state: ProgramState) =>
  migrateProgramState(normalizeProgramState(state), "2026-03-09");

describe("a plan fitted to its time, through the loader", () => {
  it("keeps a new 30-minute plan's two-set main lifts", () => {
    const plan = buildOnboardingPlan(
      answers({ sessionMinutes: 30 }),
      "cut",
      "2026-03-09"
    ).programState;
    expect(twoSetMains(plan).length).toBeGreaterThan(0);
    expect(setsOf(load(plan))).toEqual(setsOf(plan));
  });

  it("keeps a plan re-fitted to a shorter session", () => {
    const plan = buildOnboardingPlan(
      answers({ sessionMinutes: 60, daysPerWeek: 3, equipment: "full_gym" }),
      "recomp",
      "2026-03-09"
    ).programState;
    const refitted: ProgramState = {
      ...plan,
      sessionMinutes: 30,
      workouts: refitSessionsToTime(plan.workouts, "general", "beginner", 30),
    };
    expect(twoSetMains(refitted).length).toBeGreaterThan(0);
    expect(setsOf(load(refitted))).toEqual(setsOf(refitted));
  });
});
