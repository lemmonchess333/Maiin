/**
 * What the PI says about a week with only ONE discipline in it.
 *
 * Not a hypothetical segment. CONTEXT.md settles that a permanently
 * run-only USER is a chosen non-goal ("Tropos is a hybrid app… revisit
 * only if Tropos adds a run-only user segment"). This is a different
 * thing: a supported hybrid user having a single-discipline WEEK. A
 * marathoner drops lifting through a peak block; someone with a tweaked
 * shoulder runs and doesn't press; a lifter on holiday runs and doesn't
 * lift. The PI is a WEEKLY score, so these land on it every time.
 *
 * The mechanism, which is explicit rather than accidental:
 *
 *   computeLiftLoadScore: if (agg.liftSessions === 0) return 0;
 *   computeRunLoadScore:  if (agg.runSessions === 0)  return 0;
 *   loadScore = liftW * liftLoadScore + runW * runLoadScore   // 0.5/0.5
 *
 * So a week with one discipline can reach at most half the load score,
 * whatever was actually done in it. Measured (recomp, everything else
 * perfect — 100 recovery, 100 adherence):
 *
 *   5 runs / 70 km,  no lifting  →  PI 68, band "moderate"
 *   6 runs / 110 km, no lifting  →  PI 68, band "moderate"
 *   5 lifts / 40 t,  no running  →  PI 68, band "moderate"
 *
 * Three consequences, in rising order of how much they matter:
 *
 *   1. The score SATURATES. 70 km and 110 km are the same number, because
 *      runLoadScore is already clamped at 100 and the missing half can't
 *      move. The PI stops being able to tell those weeks apart.
 *   2. The COPY is wrong. `getVerbState("moderate", false)` is "cruising",
 *      rendered "Steady" on the Home hero, and Analytics shows "Moderate".
 *      A 110 km week is not steady.
 *   3. No deload is ever offered. Both live triggers need PI ≥ 80 (see
 *      deloadTriggerReachability.test.ts); the ceiling here is 68 on a
 *      recomp goal and 58 on a lean bulk. A user in a peak block — the
 *      person most likely to need one — is structurally excluded.
 *
 * Note the engine uses OPPOSITE conventions for missing data in its two
 * halves. Load treats an absent discipline as zero (worst case).
 * `computeAdherenceScore` omits absent nutrition factors entirely (no
 * penalty — which is why logging no food scores 100). Both are
 * defensible in isolation; together they are inconsistent, and the load
 * side is the one with user-visible consequences.
 *
 * THESE TESTS DO NOT ASSERT THE BEHAVIOUR IS RIGHT. They pin what it
 * currently does, with the numbers, so the trade-off is visible and any
 * change to it is deliberate. Renormalising the weighting onto the
 * trained discipline would fix 1-3 and make the engine internally
 * consistent — but it would also raise the PI of every user who skips a
 * discipline for a week, which is a training-policy call and belongs in a
 * lock, not in a test file.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { scorePerformance as scoreTs } from "../performanceEngine";
import { getVerbState } from "../performanceLine";
import type { WeeklyAggregates, Baseline, LoadBand } from "../performanceTypes";

/* Both copies, with the SERVER first: it is the authoritative one — the
   weekly rollup persists the PI users see, and CONTEXT.md records that the
   client engine is an `@oracle` with zero production consumers. */
const require = createRequire(import.meta.url);
const scoreJs = require("../../../functions/lib/perfScoring")
  .scorePerformance as typeof scoreTs;
const ENGINES: [string, typeof scoreTs][] = [
  ["server (authoritative)", scoreJs],
  ["client (@oracle)", scoreTs],
];

const BASELINE: Baseline = {
  liftTonnage: 12000,
  liftHardSets: 45,
  runKm: 25,
  runLongKm: 10,
  weeksUsed: 4,
};

/** A week where nutrition and bodyweight are perfect, so the only thing
 *  moving the score is the training. */
function week(o: {
  lifts: number;
  runs: number;
  tonnage?: number;
  km?: number;
}): WeeklyAggregates {
  return {
    weekKey: "2026-05-17",
    liftTonnage: o.tonnage ?? 0,
    liftHardSets: o.lifts * 15,
    liftSessions: o.lifts,
    runKm: o.km ?? 0,
    runLongKm: o.runs > 0 ? (o.km ?? 0) / 3 : 0,
    runQualityCount: o.runs > 2 ? 2 : 0,
    runSessions: o.runs,
    mealDaysLogged: 7,
    avgDailyCalories: 2500,
    avgDailyProtein: 160,
    bwCurrent7dAvg: 80,
    bwPrevious7dAvg: 80,
  };
}

const PROFILE = {
  goal: "recomp" as const,
  targetCalories: 2500,
  targetProtein: 160,
};

describe.each(ENGINES)(
  "a single-discipline week [%s]",
  (_label, scorePerformance) => {
    it("caps the load score at half, however much was done", () => {
      const runOnly = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE
      );
      // The run half is already maxed — there is no headroom left in it.
      expect(runOnly.runLoadScore).toBe(100);
      expect(runOnly.liftLoadScore).toBe(0);
      expect(runOnly.performanceIndex).toBe(68);
    });

    it("cannot tell a 70 km week from a 110 km week", () => {
      // The saturation, stated as the equality it is. Both are already at
      // the run-half ceiling, and the lift half is fixed at zero.
      const a = scorePerformance(week({ lifts: 0, runs: 5, km: 70 }), BASELINE, PROFILE);
      const b = scorePerformance(week({ lifts: 0, runs: 6, km: 110 }), BASELINE, PROFILE);
      expect(a.performanceIndex).toBe(b.performanceIndex);
    });

    it("is symmetric — a lift-only week caps the same way", () => {
      const liftOnly = scorePerformance(
        week({ lifts: 5, runs: 0, tonnage: 40000 }),
        BASELINE,
        PROFILE
      );
      expect(liftOnly.liftLoadScore).toBe(100);
      expect(liftOnly.runLoadScore).toBe(0);
      expect(liftOnly.performanceIndex).toBe(68);
    });

    it("tells a 110 km week it is cruising", () => {
      // The user-visible end of it: band → verb → the word on the Home
      // hero. This is the assertion to look at first if the weighting is
      // ever changed, because it is the one a user would notice.
      const scored = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE
      );
      expect(scored.loadBand).toBe("moderate");
      expect(
        getVerbState(scored.loadBand as LoadBand, scored.deloadRecommended)
      ).toBe("cruising");
    });

    it("can never recommend a deload, at any volume", () => {
      /* Both live triggers gate on PI ≥ 80. The ceiling is 68 here, so the
         gate is unreachable by construction rather than by circumstance —
         no amount of running gets there. Swept to make that concrete
         rather than asserted at one point. */
      for (const km of [40, 70, 110, 160, 220]) {
        const scored = scorePerformance(
          week({ lifts: 0, runs: 6, km }),
          BASELINE,
          PROFILE,
          95 // a very high previous week, to arm the sustained trigger too
        );
        expect(scored.performanceIndex).toBeLessThan(80);
        expect(scored.deloadRecommended).toBe(false);
      }
    });

    it("the SAME running with lifting alongside clears the gate easily", () => {
      // Guards the guard: the ceiling is about the missing discipline, not
      // about the week being unremarkable. Add lifting and the identical
      // running load produces a deload recommendation.
      const both = scorePerformance(
        week({ lifts: 4, runs: 6, km: 110, tonnage: 24000 }),
        BASELINE,
        PROFILE,
        95
      );
      expect(both.performanceIndex).toBeGreaterThanOrEqual(85);
      expect(both.deloadRecommended).toBe(true);
    });

    it("a lean-bulk goal lowers the run-only ceiling further", () => {
      /* The goal-aware weighting tilts load toward lifting (lean bulk
         0.65/0.35), so the discipline that is missing is weighted MORE.
         A runner on a lean bulk is capped lower than the same runner on a
         recomp — worth pinning because it is the opposite of what someone
         reading "goal-aware" would expect for a running week. */
      const bulk = scorePerformance(week({ lifts: 0, runs: 6, km: 110 }), BASELINE, {
        goal: "lean bulk",
        targetCalories: 2500,
        targetProtein: 160,
      });
      expect(bulk.performanceIndex).toBeLessThan(68);
    });

    it("a genuinely untrained week still scores near the floor", () => {
      // The convention is not wrong everywhere: no training at all SHOULD
      // score low, and does. The problem is only that one discipline and
      // none are treated on the same scale.
      const nothing = scorePerformance(week({ lifts: 0, runs: 0 }), BASELINE, PROFILE);
      expect(nothing.liftLoadScore).toBe(0);
      expect(nothing.runLoadScore).toBe(0);
      expect(nothing.performanceIndex).toBeLessThan(45);
    });
  }
);
