/**
 * Nutr4 — the server scores adherence with NO taper, deliberately.
 *
 * `useEffectiveTargets` contracts a Pro user's calorie target by up to
 * `TAPER_CUT_MAX` in the weeks before a race; `computeAdherenceScore`
 * (functions/lib/perfScoring.js) never hears about it. That is safe only
 * while the deepest cut sits inside the scorer's tolerance band, so a user
 * eating exactly the tapered figure still scores 100 on the calorie factor.
 *
 * This pin drives the SERVER scorer with intake at `1 − TAPER_CUT_MAX` of
 * target on a cut (the narrowest tolerance) and asserts the full score.
 * Deepen the taper past the tolerance and this fails — the moment the
 * taper must be mirrored into functions/ arrives as a red test, not as a
 * user scored 64 for complying with their own plan.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { TAPER_CUT_MAX, CARB_LOAD_BUMP } from "@/lib/taperNutrition";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/perfScoring") as {
  computeAdherenceScore: (
    agg: {
      liftSessions: number;
      runSessions: number;
      mealDaysLogged: number;
      avgDailyCalories: number;
      avgDailyProtein: number;
    },
    targetWorkouts: number,
    targetCalories: number,
    targetProtein: number,
    goal: string
  ) => number;
};

const TARGET = 2500;
const agg = (avgDailyCalories: number) => ({
  liftSessions: 0,
  runSessions: 0,
  mealDaysLogged: 7,
  avgDailyCalories,
  avgDailyProtein: 0,
});

describe("Nutr4 — the taper-blind server scorer cannot penalise a tapering user", () => {
  it("intake at the deepest taper cut scores 100 on a cut (the narrowest tolerance)", () => {
    const tapered = TARGET * (1 - TAPER_CUT_MAX);
    expect(
      server.computeAdherenceScore(agg(tapered), 0, TARGET, 0, "cut")
    ).toBe(100);
  });

  it("the carb-load bump scores 100 too", () => {
    const loaded = TARGET * (1 + CARB_LOAD_BUMP);
    expect(server.computeAdherenceScore(agg(loaded), 0, TARGET, 0, "cut")).toBe(
      100
    );
  });

  it("the control: one percent past the tolerance is no longer 100", () => {
    // Proves the assertion above is discriminating, not a scorer that
    // returns 100 for everything.
    const past = TARGET * (1 - TAPER_CUT_MAX - 0.01);
    expect(
      server.computeAdherenceScore(agg(past), 0, TARGET, 0, "cut")
    ).toBeLessThan(100);
  });
});
