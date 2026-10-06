/**
 * The fat-loss profile keeps general's mains and its volume.
 *
 * The fat-loss rep numbers lived in three places: the profile table, its
 * server mirror (`represcribe.cross.test.ts` pins that one) and the
 * fat-loss circuit template. No new plan starts from a template since Lift4
 * (5), so the template's copy is no longer one a new user receives, and what
 * stays worth pinning is the profile's own reasoning.
 */
import { describe, it, expect } from "vitest";

import { goalProfileFor } from "../programEngine";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { volumeLandmark } from "../volumeModel";
import type { Goal } from "../programTypes";

describe("the fat-loss profile itself", () => {
  it("prescribes the same mains as `general` — a deficit is not its own stimulus", () => {
    // Fleck & Kraemer p.179: "To maintain strength gains the intensity should
    // be maintained, but the volume and frequency of training can be reduced."
    // The old row inverted it — dropped intensity, held volume.
    const fatLoss = goalProfileFor("fat_loss");
    const general = goalProfileFor("general");
    expect(fatLoss.mainReps).toBe(general.mainReps);
    expect(fatLoss.mainRepsMax).toBe(general.mainRepsMax);
  });

  it("does NOT cut volume — Roth 2023 found volume does not spare lean mass", () => {
    // The counterpart to the intensity half: resistance training volume does
    // not influence lean-mass preservation during energy restriction (Roth
    // et al. 2023, Scand J Med Sci Sports), so neither the focus nor a cut
    // reduces it (Lift4 (4)).
    expect(goalProfileFor("fat_loss").volumeMultiplier).toBe(1.0);
    expect(volumeLandmark("fat_loss")).toEqual(volumeLandmark("hypertrophy"));
  });

  it("builds the same plan on a cut, a lean bulk or a recomp", () => {
    // A cut or a bulk is the nutrition targets' business; the lifting
    // doesn't read the nutrition phase (Lift4 (4)).
    const plan = (nutritionPhase: Goal) =>
      buildPlan({
        primaryGoal: "fat_loss",
        nutritionPhase,
        experience: "intermediate",
        bodyweightKg: 80,
        sex: "male",
        liftDays: 4,
        preferredSplit: "auto",
        runMode: "freeform",
        weeklyRunDays: 0,
        equipment: "full_gym",
        injuries: [],
        currentDate: "2026-03-08",
      } as PlanBuilderInput).programState.workouts.map((day) => ({
        dayName: day.dayName,
        // Each build mints fresh instance ids; everything else must match.
        exercises: day.exercises.map(({ instanceId: _id, ...ex }) => ex),
      }));
    const recomp = plan("recomp");
    expect(plan("cut")).toEqual(recomp);
    expect(plan("lean bulk")).toEqual(recomp);
  });
});
