/**
 * The calorie target is set once, from the body you had then. Maintenance
 * moves as the body does; the stored target does not.
 *
 * The numbers below are computed through the app's own `calculateTDEE`
 * rather than hand-written, so if the BMR equation or the activity
 * multipliers ever change, these move with them instead of quietly becoming
 * fiction.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  resolveTargetDrift,
  shouldShowTargetDrift,
  MATERIAL_DRIFT_KG_PER_WEEK,
} from "../targetDrift";
import { calculateTDEE } from "../tdee";
import { offsetFromWeeklyRate, KCAL_PER_KG } from "../macroConstants";

/** Maintenance for a 180 cm, 35 y male at moderate activity. */
const maintenanceAt = (kg: number) =>
  calculateTDEE(kg, 180, 35, "moderate", "cut", "male").tdee;

/** The target as set at 90 kg for a −0.5 kg/wk cut, then held. */
const HELD_TARGET = calculateTDEE(
  90,
  180,
  35,
  "moderate",
  "cut",
  "male",
  offsetFromWeeklyRate(-0.5)
).targetCalories;

describe("resolveTargetDrift", () => {
  it("reports no drift on the day the target was set", () => {
    const d = resolveTargetDrift(HELD_TARGET, maintenanceAt(90), -0.5);
    expect(d).not.toBeNull();
    expect(d!.effectiveRateKgPerWeek).toBeCloseTo(-0.5, 2);
    expect(d!.driftKgPerWeek).toBeCloseTo(0, 2);
    expect(d!.material).toBe(false);
  });

  it("tracks the pace eroding as the body shrinks", () => {
    /* The measured decay. Asserted as an ordered sequence rather than at one
       point, because the shape — monotonic, accelerating in relative terms —
       is what makes this worth telling the user about at all. */
    const rates = [90, 86, 82, 78].map(
      (kg) =>
        resolveTargetDrift(HELD_TARGET, maintenanceAt(kg), -0.5)!
          .effectiveRateKgPerWeek
    );
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]); // less negative = slower
    }
    expect(rates[0]).toBeCloseTo(-0.5, 2);
    expect(rates[3]).toBeCloseTo(-0.33, 2);
  });

  it("stays quiet until the gap is worth a line", () => {
    // 4 kg in, the gap is real but small; by 12 kg it is a third of the pace.
    expect(
      resolveTargetDrift(HELD_TARGET, maintenanceAt(86), -0.5)!.material
    ).toBe(false);
    expect(
      resolveTargetDrift(HELD_TARGET, maintenanceAt(78), -0.5)!.material
    ).toBe(true);
  });

  it("catches a maintainer who has stopped maintaining", () => {
    /* Intended rate 0 is not a special case to skip — a maintainer whose
       maintenance has moved is now drifting in one direction with nothing
       telling them. */
    const d = resolveTargetDrift(maintenanceAt(90), maintenanceAt(78), 0);
    expect(d!.intendedRateKgPerWeek).toBe(0);
    expect(d!.effectiveRateKgPerWeek).toBeGreaterThan(0); // now a surplus
    expect(d!.material).toBe(true);
  });

  it("works in the gaining direction too", () => {
    const target = calculateTDEE(
      70,
      180,
      35,
      "moderate",
      "lean bulk",
      "male",
      offsetFromWeeklyRate(0.25)
    ).targetCalories;
    // Grown into a bigger body: the same surplus is now a smaller one.
    const d = resolveTargetDrift(target, maintenanceAt(82), 0.25);
    expect(d!.effectiveRateKgPerWeek).toBeLessThan(0.25);
    expect(d!.material).toBe(true);
  });

  it("returns null rather than a guess on missing or malformed input", () => {
    expect(resolveTargetDrift(null, 2800, -0.5)).toBeNull();
    expect(resolveTargetDrift(2325, null, -0.5)).toBeNull();
    expect(resolveTargetDrift(0, 2800, -0.5)).toBeNull();
    expect(resolveTargetDrift(2325, 0, -0.5)).toBeNull();
    expect(resolveTargetDrift(NaN, 2800, -0.5)).toBeNull();
  });

  it("treats a missing intended rate as maintenance, not as no-drift", () => {
    /* `undefined` must not short-circuit to "nothing to see" — a profile with
       no stored rate is a maintainer by default, and the drift is still real. */
    const d = resolveTargetDrift(
      maintenanceAt(90),
      maintenanceAt(78),
      undefined
    );
    expect(d!.intendedRateKgPerWeek).toBe(0);
    expect(d!.material).toBe(true);
  });

  it("puts the threshold exactly where the constant says", () => {
    /* Guards the boundary against quietly moving with a refactor. The daily
       offset for a given weekly rate is `rate × KCAL_PER_KG / 7` — the same
       conversion `offsetFromWeeklyRate` uses. (An earlier draft of this test
       multiplied by 7 twice and demanded a 693 kcal offset for a 0.09 kg/wk
       drift; the code was right and the test was wrong.) */
    const maintenance = 2800;
    const offsetFor = (rateKgPerWeek: number) =>
      Math.round((rateKgPerWeek * KCAL_PER_KG) / 7);

    const atThreshold = resolveTargetDrift(
      maintenance + offsetFor(MATERIAL_DRIFT_KG_PER_WEEK),
      maintenance,
      0
    );
    expect(atThreshold!.material).toBe(true);

    const under = resolveTargetDrift(
      maintenance + offsetFor(0.09),
      maintenance,
      0
    );
    expect(under!.material).toBe(false);
  });
});

describe("shouldShowTargetDrift", () => {
  const material = resolveTargetDrift(HELD_TARGET, maintenanceAt(78), -0.5);

  it("shows a material drift to an ordinary user", () => {
    expect(
      shouldShowTargetDrift({
        drift: material,
        isManualOverride: false,
        isAdaptiveEngaged: false,
      })
    ).toBe(true);
  });

  it("says nothing to someone who pinned their own number", () => {
    /* Recalculating would overwrite exactly the thing they chose, so the
       offer would be worse than useless. The sub-floor notice covers them. */
    expect(
      shouldShowTargetDrift({
        drift: material,
        isManualOverride: true,
        isAdaptiveEngaged: false,
      })
    ).toBe(false);
  });

  it("says nothing to a user whose adaptive target is already tracking", () => {
    // Describing a problem the app is actively solving.
    expect(
      shouldShowTargetDrift({
        drift: material,
        isManualOverride: false,
        isAdaptiveEngaged: true,
      })
    ).toBe(false);
  });

  it("says nothing when there is no drift, or nothing to measure", () => {
    const none = resolveTargetDrift(HELD_TARGET, maintenanceAt(90), -0.5);
    expect(
      shouldShowTargetDrift({
        drift: none,
        isManualOverride: false,
        isAdaptiveEngaged: false,
      })
    ).toBe(false);
    expect(
      shouldShowTargetDrift({
        drift: null,
        isManualOverride: false,
        isAdaptiveEngaged: false,
      })
    ).toBe(false);
  });
});

describe("SettingsNutrition wires the recalculation to the persist recipe", () => {
  /* Found by mutation: replacing the page's `onRecalculate` with a no-op left
     every component test green, because those assert only that the callback
     fires. The button's whole value is that it writes the SAME payload the
     reactive save writes — a bespoke write here would be a second copy of
     "what does a goal change persist?", which is the drift this codebase
     keeps paying for. */
  const SOURCE = readFileSync(
    new URL("../../pages/settings/SettingsNutrition.tsx", import.meta.url),
    "utf8"
  );

  it("hands the shared payload straight to updateProfile", () => {
    expect(SOURCE).toMatch(
      /onRecalculate=\{\(\)\s*=>\s*updateProfile\(payload\)\}/
    );
  });

  it("does not hand-roll a target write alongside it", () => {
    // The payload builder is the only thing that should produce these fields.
    const call = SOURCE.slice(
      SOURCE.indexOf("onRecalculate="),
      SOURCE.indexOf("onRecalculate=") + 200
    );
    expect(call).not.toContain("targetCalories:");
    expect(call).not.toContain("targetProtein:");
  });
});
