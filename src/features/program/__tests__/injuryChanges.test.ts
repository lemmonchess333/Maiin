import { describe, it, expect } from "vitest";
import { injuryChanges } from "../injuryChanges";
import { contraindicatedFor } from "../injurySubstitutions";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import type { WorkoutDay } from "../programTypes";

const draft: OnboardingDraft = {
  step: 4,
  primaryGoal: "strength",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
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
const planWith = (injuries: string[]) =>
  buildOnboardingPlan({ ...draft, injuries }, "recomp", "2026-09-07")
    .programState.workouts;

describe("injuryChanges (FV3)", () => {
  it("lists what a knee limitation swapped, each from a knee lift to a safe one", () => {
    const { swaps } = injuryChanges(planWith(["knee"]), ["knee"]);
    expect(swaps.length).toBeGreaterThan(0);
    for (const swap of swaps) {
      expect(contraindicatedFor(swap.fromId, ["knee"])).toEqual(["knee"]);
      expect(contraindicatedFor(swap.toId, ["knee"])).toEqual([]);
      // Named from the library, never the raw id.
      expect(swap.fromName).not.toBe(swap.fromId);
    }
  });

  it("names a swap once, however many days it happens on", () => {
    const { swaps } = injuryChanges(planWith(["knee"]), ["knee"]);
    const pairs = swaps.map((swap) => `${swap.fromId}>${swap.toId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("says nothing changed for no limitation", () => {
    expect(injuryChanges(planWith(["none"]), ["none"])).toEqual({
      swaps: [],
      kept: [],
    });
  });

  it("reports a covered lift with no swap as staying", () => {
    const day = {
      dayName: "Custom",
      exercises: [
        { exerciseId: "deadlift", name: "Deadlift", sets: 3 },
        { exerciseId: "deadlift", name: "Deadlift", sets: 3 },
      ],
    } as unknown as WorkoutDay;
    expect(injuryChanges([day], ["lower_back"])).toEqual({
      swaps: [],
      kept: [{ id: "deadlift", name: "Deadlift" }],
    });
  });

  it("ignores a swap made for something else, like the kit", () => {
    const day = {
      dayName: "Custom",
      exercises: [
        {
          exerciseId: "db-bench",
          name: "Dumbbell Bench Press",
          sets: 3,
          swappedFrom: { exerciseId: "bench-press" },
        },
      ],
    } as unknown as WorkoutDay;
    expect(injuryChanges([day], ["knee"]).swaps).toEqual([]);
  });
});
