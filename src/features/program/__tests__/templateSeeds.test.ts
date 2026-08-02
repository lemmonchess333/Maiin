/**
 * Template-path starting loads (P1).
 *
 * The onboarding template branch reaches ~12 of the 90 declared
 * configurations, and it is the ONE path that shipped visibly absurd
 * prescriptions to real users: an 80 kg intermediate was handed a 35 kg
 * dumbbell lateral raise, a 52.5 kg face pull, and an 85 kg leg extension and
 * 85 kg seated calf raise — the knee-dominant COMPOUND's own seed, unscaled.
 *
 * Two independent causes, and the audit had only identified the second:
 *
 *   1. The exercise is absent from `exerciseBank` entirely, so no `loadFactor`
 *      exists and it took the category compound's bodyweight multiple at full
 *      strength. This is the bigger cause — lateral raise, face pull, leg
 *      extension and calf raise are all simply not in the bank.
 *   2. The exercise IS in the bank but under a DIFFERENT category than name
 *      inference produced. `Leg Curl` infers `knee_dominant`; the bank files
 *      `seated-leg-curl` under `hip_dominant` with `loadFactor: 0.25`. The
 *      lookup missed, returned the default 1, and seeded the curl at the
 *      squat's 85 kg instead of 25 kg.
 *
 * Not covered by the golden sweep, because that drives `buildPlan` without an
 * `existingState` and so always takes the generator branch. This pins the
 * other branch directly.
 */
import { describe, it, expect } from "vitest";

import { startingWeightForExercise } from "../startingLoads";
import type { StartingLoadContext } from "../startingLoads";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";

/** The audit's worked example: an 80 kg intermediate male. */
const CTX: StartingLoadContext = {
  bodyweightKg: 80,
  experience: "intermediate",
  sex: "male",
};

/** Seeds the way the template path does — category from the NAME. */
const seedFromTemplate = (name: string, id: string, isAccessory = true) =>
  startingWeightForExercise(
    id,
    inferMovementCategory(name, id),
    CTX,
    isAccessory
  );

describe("template-path load seeds (P1)", () => {
  it("no accessory is seeded at a compound's load", () => {
    // The property, stated once: template accessories are isolation work and
    // must not inherit a squat's or a row's bodyweight multiple. The four
    // below are the measured cases; the ceiling is what stops a new one
    // reappearing.
    const cases: Array<[string, string]> = [
      ["Dumbbell Lateral Raise", "lateral-raise"],
      ["Face Pulls", "face-pulls"],
      ["Leg Extension", "leg-extension"],
      ["Seated Calf Raise", "seated-calf-raise"],
      ["Leg Curl", "seated-leg-curl"],
    ];
    for (const [name, id] of cases) {
      const seed = seedFromTemplate(name, id);
      expect(seed, `${name} seeded at ${seed} kg`).toBeLessThanOrEqual(30);
      expect(seed, `${name} seeded at ${seed} kg`).toBeGreaterThan(0);
    }
  });

  it("a 35 kg dumbbell lateral raise is not a prescription anyone can execute", () => {
    // Named on its own because it is the case that makes the bug obvious.
    expect(seedFromTemplate("Dumbbell Lateral Raise", "lateral-raise")).toBe(
      10
    );
  });

  it("the bank's category wins over a disagreeing caller (cause 2)", () => {
    // Originally: `Leg Curl` INFERRED knee_dominant (the squat pattern, 85 kg)
    // while the bank knew it as hip_dominant with loadFactor 0.25. The stored
    // category table has since fixed the inference too, so the two agree at
    // this call site now — but the seeder must not depend on that, because a
    // caller can still pass a stale or wrong category from persisted state.
    // Passing the OLD wrong value directly proves the guard is real.
    expect(
      startingWeightForExercise("seated-leg-curl", "knee_dominant", CTX, true)
    ).toBe(25);
    expect(seedFromTemplate("Leg Curl", "seated-leg-curl")).toBe(25);
  });

  it("a MAIN lift keeps its full category seed", () => {
    // The counter-case. The conservative factor is gated on assistance work
    // AND absence from the bank — a compound must not be scaled down.
    expect(seedFromTemplate("Barbell Squat", "squat", false)).toBe(85);
    expect(seedFromTemplate("Bench Press", "bench-press", false)).toBe(55);
  });

  it("a lift the bank DOES know keeps its authored factor in any role", () => {
    // `isAccessory` is a volume role, not a load claim: buildFullBody uses
    // the deadlift in an accessory slot, and it is still a deadlift.
    expect(seedFromTemplate("Deadlift", "deadlift", true)).toBe(
      seedFromTemplate("Deadlift", "deadlift", false)
    );
  });

  it("bodyweight lifts stay at 0 whatever the role", () => {
    expect(seedFromTemplate("Pull-Ups", "pull-ups", true)).toBe(0);
  });
});
