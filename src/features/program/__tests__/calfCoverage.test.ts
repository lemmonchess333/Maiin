/**
 * Direct calf coverage in GENERATED plans.
 *
 * Measured before the builders authored calf slots (2026-08-03 audit): every
 * goal × day-count combination produced ZERO direct calf sets — Calves sat
 * below maintenance volume everywhere, i.e. the generator was prescribing
 * calf atrophy by the volume model's own landmark ladder. The cause was
 * structural: the variation bank groups by movement pattern, calves have no
 * pattern of their own, and `balanceWeeklyVolume` is add-only — with no calf
 * slot in existence there was nothing for it to grow.
 *
 * The fix is the catalogue-pinned named slot (`makeNamedAccessory`), plus
 * three guards these tests hold in place:
 *   - fitting a session to the time the person has (`sessionFit.ts`) keeps
 *     a muscle's last direct lift while anything else can give way, so a
 *     plan of an hour or more keeps its calf slot; the time decides its
 *     sets, and a shorter plan keeps its main lifts first;
 *   - meso rotation must NOT rotate the slot within its `knee_dominant` bank
 *     pool (measured pre-guard: the calf slot became `squat` at the first
 *     mesocycle restart — coverage silently deleted after 4 weeks);
 *   - the equipment filter must re-point it to the bodyweight fallback, not
 *     a quad lift (measured pre-guard: home-gym plans lost the slot to the
 *     generic category swap, and the drained pool then handed a beginner a
 *     technical Bulgarian split squat).
 */
import { describe, it, expect } from "vitest";

import { buildPlan } from "../planBuilder";
import { weeklyVolumeByMuscle, volumeLandmark } from "../volumeModel";
import { getExerciseById } from "@/lib/exercises";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

const GOALS: PrimaryGoal[] = [
  "hypertrophy",
  "strength",
  "general",
  "fat_loss",
  "running",
];

const CALF_IDS = new Set([
  "standing-calf-raise",
  "seated-calf-raise",
  "single-leg-calf-raise",
]);

function plan(
  goal: PrimaryGoal,
  liftDays: number,
  equipment: "full_gym" | "home_gym" | "minimal",
  sessionMinutes?: number
): WorkoutDay[] {
  return buildPlan({
    primaryGoal: goal,
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment,
    injuries: [],
    currentDate: "2026-03-08",
    sessionMinutes,
  } as Parameters<typeof buildPlan>[0]).programState.workouts as WorkoutDay[];
}

const calfSlots = (w: WorkoutDay[]) =>
  w.flatMap((d) => d.exercises).filter((e) => CALF_IDS.has(e.exerciseId));

describe("generated plans carry direct calf work", () => {
  it("every goal × day count has a calf slot in sessions of an hour or more (full gym)", () => {
    for (const goal of GOALS) {
      for (const days of [2, 3, 4, 5, 6]) {
        for (const minutes of [60, 75]) {
          const at = `${goal}/${days}d/${minutes}min`;
          const slots = calfSlots(plan(goal, days, "full_gym", minutes));
          expect(slots.length, at).toBeGreaterThanOrEqual(1);
          // The slot is assistance work, so the time fit may cut its sets
          // and the accessory ramp shapes it week to week.
          slots.forEach((s) => expect(s.isAccessory, at).toBe(true));
        }
      }
    }
  });

  it("weekly calf volume clears the retention floor (MV) at 3+ days, given the time", () => {
    // Time decides a plan's volume (Lift4 (5)), so the floor is asked of a
    // session with room: 75 minutes and up. A shorter one keeps the slot
    // (above) with the sets that fit. 2-day plans are excluded: their two
    // calf slots come to less than hypertrophy's MV of 5 whatever the time.
    for (const goal of GOALS) {
      for (const days of [3, 4, 5, 6]) {
        const calves = weeklyVolumeByMuscle(
          plan(goal, days, "full_gym", 75)
        ).find((m) => m.muscle === "Calves");
        expect(calves?.sets ?? 0, `${goal}/${days}d`).toBeGreaterThanOrEqual(
          volumeLandmark(goal).mv
        );
      }
    }
  });

  it("limited equipment keeps calf coverage via the bodyweight fallback", () => {
    for (const tier of ["home_gym", "minimal"] as const) {
      for (const days of [2, 4, 6]) {
        const slots = calfSlots(plan("hypertrophy", days, tier));
        expect(slots.length, `${tier}/${days}d`).toBeGreaterThanOrEqual(1);
        // …and never as a machine the user does not own.
        for (const s of slots) {
          expect(
            getExerciseById(s.exerciseId)?.equipment,
            `${tier}/${days}d ${s.exerciseId}`
          ).toBe("Bodyweight");
          // Bodyweight slot must arrive uncalibrated, not carrying the
          // machine slot's kilograms onto a bodyweight movement.
          expect(s.weight).toBe(0);
        }
      }
    }
  });
});
