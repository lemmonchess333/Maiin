/**
 * `attestedWeeklyRateKg` — can the stored weekly rate's SIGN be trusted?
 *
 * Pre-NUTR-M2 profiles stored the rate unsigned, so a legacy cutter reads
 * `+0.5`. Two consumers read the field and only one defended against that:
 * `goalReachedOffer` has cross-checked the sign against `program.goal` since
 * NUTR-M2, while `goalCalorieOffset` passed the raw value to
 * `offsetFromWeeklyRate` — turning a legacy cutter's intended −550 kcal
 * deficit into a +550 SURPLUS, then letting `applyWeeklyCap` walk the target
 * up 150/week so it looked like the adaptive engine working.
 *
 * The tests below are mostly about the AMBIGUOUS cases, because the happy
 * path is where the two consumers already agreed. What was missing was one
 * shared answer to "is this field's sign meaningful?".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { attestedWeeklyRateKg } from "@/lib/goalWeightPlan";

describe("attestedWeeklyRateKg", () => {
  it("trusts a correctly-signed rate", () => {
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: -0.5, program: { goal: "cut" } })
    ).toBe(-0.5);
    expect(
      attestedWeeklyRateKg({
        weeklyRateKg: 0.25,
        program: { goal: "lean bulk" },
      })
    ).toBe(0.25);
  });

  it("rejects the legacy unsigned cutter — the case this exists for", () => {
    // +0.5 with a cut phase. Sign says gain, phase says lose. Believing the
    // sign hands a dieting user a surplus.
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: 0.5, program: { goal: "cut" } })
    ).toBeNull();
  });

  it("rejects a negative rate under a bulk phase", () => {
    // The mirror-image contradiction. Rejected for the same reason rather
    // than silently believing whichever signal is checked first.
    expect(
      attestedWeeklyRateKg({
        weeklyRateKg: -0.5,
        program: { goal: "lean bulk" },
      })
    ).toBeNull();
  });

  it("rejects any rate under recomp, which should carry none", () => {
    // recomp is maintenance: `resolveGoalWeightPlan` writes rate 0 for it, so
    // a non-zero rate here is stale state from a previous goal.
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: -0.5, program: { goal: "recomp" } })
    ).toBeNull();
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: 0.5, program: { goal: "recomp" } })
    ).toBeNull();
  });

  it("rejects absent, zero, non-finite and phase-less input", () => {
    // One "can I trust this?" question for callers instead of four separate
    // guards each consumer has to remember.
    expect(attestedWeeklyRateKg({ weeklyRateKg: 0, program: { goal: "cut" } })).toBeNull();
    expect(attestedWeeklyRateKg({ program: { goal: "cut" } })).toBeNull();
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: NaN, program: { goal: "cut" } })
    ).toBeNull();
    expect(attestedWeeklyRateKg({ weeklyRateKg: -0.5 })).toBeNull();
    expect(attestedWeeklyRateKg(null)).toBeNull();
    expect(attestedWeeklyRateKg(undefined)).toBeNull();
  });

  it("preserves magnitude, not just direction", () => {
    // The consumer multiplies it into a calorie offset, so a helper that
    // returned a normalised ±1 would pass every direction assertion above
    // and silently flatten every user's deficit to the same size.
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: -0.75, program: { goal: "cut" } })
    ).toBe(-0.75);
    expect(
      attestedWeeklyRateKg({ weeklyRateKg: -0.25, program: { goal: "cut" } })
    ).toBe(-0.25);
  });
});

describe("both consumers actually route through it", () => {
  /* A reachability check. The helper is only worth anything if the two
     readers of `weeklyRateKg` use it, and the failure mode is silent in both
     directions: `goalCalorieOffset` reading the raw field again compiles and
     every test above still passes, and so does re-inlining the rule in
     `goalReachedOffer`.

     Asserted against source because `goalCalorieOffset` is private to
     `useAdaptiveTdee` and only observable through the hook's active adaptive
     path, which needs a Pro subscription plus a populated trailing window —
     a rig that would test the fixture, not the wiring. */
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  const read = (rel: string) =>
    strip(
      readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), "../..", rel),
        "utf8"
      )
    );

  it("useAdaptiveTdee's goalCalorieOffset calls it, and no longer reads the raw field", () => {
    const src = read("hooks/useAdaptiveTdee.ts");
    expect(src).toMatch(/attestedWeeklyRateKg\(profile\)/);
    // The raw read is the regression. `profile?.weeklyRateKg` reappearing
    // here is exactly the bug coming back.
    expect(src).not.toMatch(/profile\?\.weeklyRateKg/);
  });

  it("goalReachedOffer uses the shared rule rather than its own copy", () => {
    const src = read("lib/goalWeightPlan.ts");
    // One definition of phaseDirection in the file: the helper's. A second
    // means the rule was re-inlined and the two can drift again.
    expect(src.match(/phaseDirection/g)?.length).toBeLessThanOrEqual(3);
    expect(src).toMatch(/const rate = attestedWeeklyRateKg\(profile\)/);
  });
});
