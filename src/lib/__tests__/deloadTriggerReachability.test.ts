/**
 * Can each deload trigger actually fire?
 *
 * `shouldRecommendDeload` has three branches, and both copies of the engine
 * unit-test all three by calling it with hand-picked scalars:
 *
 *   shouldRecommendDeload(70, 60, 49) === true
 *
 * That pins the FUNCTION. It says nothing about whether those scalars are
 * reachable — whether any week a real user could log produces them. A branch
 * can be fully unit-tested and still never fire for anybody, and nothing in
 * the suite could tell the difference. This file closes that gap by driving
 * `scorePerformance` from AGGREGATES, the way the rollup does.
 *
 * What the sweep found (2026-08-11, 345,600 combinations of realistic weekly
 * volumes × goals × nutrition × bodyweight deltas):
 *
 *   PI ≥ 80 && recovery < 45   — 13,242 hits   LIVE
 *   PI ≥ 85 && prevPI ≥ 85     — 33,973 hits   LIVE
 *   PI ≥ 70 && adherence < 50  —      0 hits   UNREACHABLE
 *
 * The adherence branch is commented "High load with poor adherence (burning
 * out)", and it is self-defeating: the dominant term in `adherenceScore` is
 * workout adherence (`min(sessions/target, 1.2) * 100`), so the high load the
 * branch requires DRIVES ADHERENCE UP. The two conditions pull against each
 * other. Its only hits came from combinations a real week cannot contain —
 * 25 tonnes lifted across two sessions.
 *
 * Concretely, for the user it is meant to catch: 6 lifts + 5 runs on 1200 kcal
 * against a 2500 target scores adherence 73 — and 61 with protein missed too,
 * which is the floor. Both sit well above the gate of 50.
 *
 * These tests therefore do two different jobs:
 *
 *   1. Assert the two LIVE branches fire from realistic aggregates. That is
 *      the anti-vacuous half — if a scoring change quietly makes a real
 *      trigger unreachable, this fails.
 *   2. Pin the MEASURED adherence floor for a high-load week. It does NOT
 *      assert "the branch never fires", which would lock the defect in. It
 *      records where the number actually sits, so that if the scoring changes
 *      and the floor crosses 50, whoever made the change learns that they
 *      just brought a dormant trigger to life.
 *
 * The gap is bounded, which is why this is a pin and not an emergency: the
 * sustained-overreach branch catches the same persistently-hammering user one
 * week later. A one-week burnout signal is missed; a two-week one is not.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  scorePerformance as scoreTs,
  computeAdherenceScore,
} from "../performanceEngine";
import type { WeeklyAggregates, Baseline } from "../performanceTypes";

/* Run every case through BOTH copies. ADR-0008: pin the RUNNING copy, and
   the running copy here is the SERVER one — `functions/lib/perfScoring.js`
   is what the weekly rollup persists, so it decides the deload flag users
   actually see. The client engine only previews it.

   performanceEngineParity.cross.test.ts already proves the two agree
   byte-for-byte, so this could in principle test either. Testing both costs
   one loop and removes the need to reason about which. */
const require = createRequire(import.meta.url);
const scoreJs = require("../../../functions/lib/perfScoring")
  .scorePerformance as typeof scoreTs;

const ENGINES: [string, typeof scoreTs][] = [
  ["server (functions/lib/perfScoring.js — authoritative)", scoreJs],
  ["client (src/lib/performanceEngine.ts — preview)", scoreTs],
];

const BASELINE: Baseline = {
  liftTonnage: 12000,
  liftHardSets: 45,
  runKm: 25,
  runLongKm: 10,
  weeksUsed: 4,
};

/**
 * A week's aggregates built from SESSION COUNTS, so the volume can't exceed
 * what those sessions could plausibly contain. The first sweep let tonnage
 * float free of session count and produced 25 tonnes in two sessions — which
 * is how a branch that no user can reach still looked reachable.
 */
function week(o: {
  lifts: number;
  runs: number;
  kgPerLift?: number;
  kmPerRun?: number;
  mealDays?: number;
  calories?: number;
  protein?: number;
  bwDelta?: number;
}): WeeklyAggregates {
  const lifts = o.lifts;
  const runs = o.runs;
  const kmPerRun = o.kmPerRun ?? 10;
  const mealDays = o.mealDays ?? 5;
  return {
    weekKey: "2026-05-17",
    liftTonnage: lifts * (o.kgPerLift ?? 6000),
    liftHardSets: lifts * 15,
    liftSessions: lifts,
    runKm: runs * kmPerRun,
    runLongKm: runs > 0 ? kmPerRun * 1.6 : 0,
    runQualityCount: runs > 2 ? 1 : 0,
    runSessions: runs,
    mealDaysLogged: mealDays,
    avgDailyCalories: mealDays >= 3 ? (o.calories ?? 2500) : 0,
    avgDailyProtein: mealDays >= 3 ? (o.protein ?? 160) : 0,
    bwCurrent7dAvg: 80 + (o.bwDelta ?? 0),
    bwPrevious7dAvg: 80,
  };
}

const PROFILE = {
  goal: "recomp" as const,
  targetCalories: 2500,
  targetProtein: 160,
};

describe.each(ENGINES)(
  "deload triggers — reachable from real aggregates [%s]",
  (_label, scorePerformance) => {
    it("recovery branch fires: hard week with a big bodyweight swing", () => {
      /* recovery = 60 base − 15 (>2kg swing) − 10 (>8 sessions), with meal
       logging too sparse to add its +15 back. The only route below 45. */
      const scored = scorePerformance(
        week({ lifts: 5, runs: 5, kmPerRun: 14, mealDays: 0, bwDelta: -2.5 }),
        BASELINE,
        PROFILE
      );
      expect(scored.recoveryScore).toBeLessThan(45);
      expect(scored.performanceIndex).toBeGreaterThanOrEqual(80);
      expect(scored.deloadRecommended).toBe(true);
    });

    it("sustained branch fires: a second consecutive very high week", () => {
      const agg = week({ lifts: 5, runs: 5, kmPerRun: 14 });
      const scored = scorePerformance(agg, BASELINE, PROFILE, 88);
      expect(scored.performanceIndex).toBeGreaterThanOrEqual(85);
      expect(scored.deloadRecommended).toBe(true);

      // And the SAME week after an easy one does not — the branch is about
      // repetition, so a one-week spike must not trip it.
      expect(
        scorePerformance(agg, BASELINE, PROFILE, 40).deloadRecommended
      ).toBe(false);
    });

    it("an ordinary week recommends nothing", () => {
      // Guards the guard: if everything tripped a deload the assertions above
      // would pass for the wrong reason.
      expect(
        scorePerformance(week({ lifts: 3, runs: 3 }), BASELINE, PROFILE)
          .deloadRecommended
      ).toBe(false);
    });
  }
);

describe.each(ENGINES)(
  "adherence branch — where the number actually sits [%s]",
  (_label, scorePerformance) => {
    /* Not "this never fires" — that would lock the defect in. These record the
     measured floor, so a scoring change that crosses it is visible. */

    it("the worst realistic nutrition still leaves a high-load week above the gate", () => {
      // The exact user the branch is commented for: training hard, badly
      // under-fuelled. 11 sessions against a target of ~4 maxes the workout
      // term, and that term is what the score is mostly made of.
      const scored = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 7, calories: 1200 }),
        BASELINE,
        PROFILE
      );
      expect(scored.performanceIndex).toBeGreaterThanOrEqual(70);
      expect(scored.adherenceScore).toBe(73);
      // 73 > 50, so the branch does not fire for the case it names.
      expect(scored.deloadRecommended).toBe(false);
    });

    it("missing calories AND protein reaches 61 — the floor, still above 50", () => {
      // The floor, found by making every nutrition factor fail at once. Even
      // then it sits 11 points above the gate, because the maxed workout term
      // is averaged in at full weight and cannot be pulled down.
      const scored = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 7, calories: 1200, protein: 90 }),
        BASELINE,
        PROFILE
      );
      expect(scored.adherenceScore).toBe(61);
      expect(scored.deloadRecommended).toBe(false);
    });

    it("the direction of the calorie error does not matter", () => {
      // Over- and under-eating by comparable margins land identically: the gap
      // is not about which way the nutrition went, it is about the workout
      // term dominating either way.
      const under = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 7, calories: 1200 }),
        BASELINE,
        PROFILE
      ).adherenceScore;
      const over = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 7, calories: 4000 }),
        BASELINE,
        PROFILE
      ).adherenceScore;
      expect(over).toBe(under);
    });

    it("logging NO food scores better than logging it badly", () => {
      /* The perverse half, and the reason the floor sits where it does:
       `computeAdherenceScore` averages only the factors present, so a user
       with no nutrition data is scored on workouts alone. Diligently logging
       a bad week is punished; logging nothing is not.

       Pinned rather than fixed — "average the factors you have" is a
       defensible default, and penalising absent data would punish everyone
       who does not use food logging. But it belongs on the record, because
       it is what makes the adherence signal nearly inert in the PI. */
      const logged = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 7, calories: 1200, protein: 90 }),
        BASELINE,
        PROFILE
      ).adherenceScore;
      const unlogged = scorePerformance(
        week({ lifts: 6, runs: 5, mealDays: 0 }),
        BASELINE,
        PROFILE
      ).adherenceScore;
      expect(unlogged).toBe(100);
      expect(unlogged).toBeGreaterThan(logged);
    });

    it("the workout term alone saturates at 100 from the target upward", () => {
      // Why the floor is high: the term is min(sessions/target, 1.2) × 100, so
      // everything from "hit the target" to "trained twice as much" is one
      // value. Load cannot pull adherence down, only up.
      const noNutrition = (sessions: number) =>
        computeAdherenceScore(
          {
            ...week({ lifts: sessions, runs: 0, mealDays: 0 }),
            bwCurrent7dAvg: null,
            bwPrevious7dAvg: null,
          },
          4,
          2500,
          160,
          "recomp"
        );
      expect(noNutrition(2)).toBe(50);
      expect(noNutrition(4)).toBe(100);
      expect(noNutrition(8)).toBe(100);
      expect(noNutrition(11)).toBe(100);
    });
  }
);
