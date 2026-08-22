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
 *      STATUS 2026-08-11 — half-fixed, and only the half that was a lie.
 *      The VERB still reads "Steady" (that follows the band, and the band
 *      is the scoring question below). The supporting LINE now names the
 *      running: `getLine`'s cruising branch consults the same
 *      run/liftAheadOfBaseline signals the sharpening branch always had,
 *      which a single-discipline week could never reach. Pinned by "but
 *      the supporting LINE names the running" below.
 *   3. No deload is ever offered. Both live triggers need PI ≥ 80 (see
 *      deloadTriggerReachability.test.ts); the ceiling here is 68 on a
 *      recomp goal and 58 on a lean bulk. A user in a peak block — the
 *      person most likely to need one — is structurally excluded.
 *      STATUS 2026-08-12 — FIXED, and the only one of the three that was.
 *      The deload question is now asked against `deloadIndex`, which takes
 *      the load half from the discipline actually trained when exactly one
 *      was. Consequences 1 and 2 are unchanged BY DESIGN: the PI still
 *      saturates and still reads "Steady", because the displayed score keeps
 *      meaning "load against your own baseline" and renormalising it would
 *      raise the PI of every user who skips a discipline for a week. Only
 *      the question changed, not the number.
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
import { getVerbState, getLine } from "../performanceLine";
import type {
  WeeklyAggregates,
  Baseline,
  LoadBand,
  PerformanceSignals,
} from "../performanceTypes";

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
      const a = scorePerformance(
        week({ lifts: 0, runs: 5, km: 70 }),
        BASELINE,
        PROFILE
      );
      const b = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE
      );
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

    it("but the supporting LINE names the running (LIFT-EV-10 copy half)", () => {
      /* The band above is the ceiling and stays. What was fixed is what the
         card SAYS underneath it: the run-volume line lived only in the
         `sharpening` branch, which a single-discipline week cannot reach, so
         a 110 km week was described as "Holding a steady rhythm".

         Composition, not hand-fed constants — each link is real or pinned
         elsewhere:
           runVolume            ← this scorePerformance call (authoritative)
           runVolume → signal   ← computeSignals' >1.05 threshold, pinned in
                                  functions/__tests__/performanceEngine.test.js
                                  ("runAheadOfBaseline only fires above 5%")
           signal → line        ← the assertion below */
      const scored = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE
      );
      // 110 km against a 25 km baseline — the biggest fact about the week.
      expect(scored.runVolume).toBeCloseTo(4.4, 3);

      const signals: PerformanceSignals = {
        bothLoadsStrong: false,
        liftAheadOfBaseline: 0,
        runAheadOfBaseline: scored.runVolume > 1.05 ? scored.runVolume - 1 : 0,
        recoveryWeak: false,
        adherenceWeak: false,
        deloadFlag: scored.deloadRecommended,
        lifetimeWeeks: BASELINE.weeksUsed,
        daysSinceLastTraining: 0,
      };

      const state = getVerbState(
        scored.loadBand as LoadBand,
        scored.deloadRecommended
      );
      expect(state).toBe("cruising");
      expect(getLine(state, signals)).toBe("Run volume 340% up");
      // The regression this guards, stated as the string it used to be.
      expect(getLine(state, signals)).not.toBe("Holding a steady rhythm");
    });

    it("a lift-only week gets the lifting line, symmetrically", () => {
      const scored = scorePerformance(
        week({ lifts: 5, runs: 0, tonnage: 40000 }),
        BASELINE,
        PROFILE
      );
      const signals: PerformanceSignals = {
        bothLoadsStrong: false,
        liftAheadOfBaseline:
          scored.liftProgression > 1.05 ? scored.liftProgression - 1 : 0,
        runAheadOfBaseline: 0,
        recoveryWeak: false,
        adherenceWeak: false,
        deloadFlag: scored.deloadRecommended,
        lifetimeWeeks: BASELINE.weeksUsed,
        daysSinceLastTraining: 0,
      };
      const state = getVerbState(
        scored.loadBand as LoadBand,
        scored.deloadRecommended
      );
      expect(state).toBe("cruising");
      expect(getLine(state, signals)).toMatch(
        /^Lifting load \d+% above baseline$/
      );
    });

    it("a week only slightly above baseline still reads as steady", () => {
      /* Guards the guard: the new branches must not fire on every cruising
         week, or the generic line becomes unreachable and "Steady" stops
         meaning anything. 28 km against a 25 km baseline is 12% up — real,
         but under the 20% the run line requires — and the lifting is inside
         computeSignals' 5% noise floor. Both derived from the engine, so if
         a threshold moves this test moves with it. */
      const scored = scorePerformance(
        week({ lifts: 3, runs: 3, km: 28, tonnage: 12500 }),
        BASELINE,
        PROFILE
      );
      const signals: PerformanceSignals = {
        bothLoadsStrong: false,
        liftAheadOfBaseline:
          scored.liftProgression > 1.05 ? scored.liftProgression - 1 : 0,
        runAheadOfBaseline: scored.runVolume > 1.05 ? scored.runVolume - 1 : 0,
        recoveryWeak: false,
        adherenceWeak: false,
        deloadFlag: false,
        lifetimeWeeks: 4,
        daysSinceLastTraining: 0,
      };
      expect(signals.runAheadOfBaseline).toBeGreaterThan(0);
      expect(signals.runAheadOfBaseline).toBeLessThan(0.2);
      expect(signals.liftAheadOfBaseline).toBeLessThan(0.15);
      expect(getLine("cruising", signals)).toBe("Holding a steady rhythm");
    });

    it("CAN now be offered a deload, which it never could before", () => {
      /* The fix. Every deload trigger gates at 80+, and a single-discipline
         week caps the composite at 68 — so the athlete carrying the most load
         in the app was excluded by construction, not by circumstance. The
         deload question is now asked against `deloadIndex`, which takes the
         load half from the discipline actually trained.

         Swept rather than asserted at one point, because the old behaviour was
         "no amount of running gets there". */
      for (const km of [70, 110, 160, 220]) {
        const scored = scorePerformance(
          week({ lifts: 0, runs: 6, km }),
          BASELINE,
          PROFILE,
          95 // a very high previous week, arming the sustained trigger
        );
        expect(scored.deloadRecommended).toBe(true);
      }
    });

    it("without leaving the displayed score any different", () => {
      /* The boundary of the change, and the reason it is safe: the PI still
         means "load against your own baseline". Only the question asked of it
         changed. */
      const scored = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE,
        95
      );
      expect(scored.performanceIndex).toBe(68);
      expect(scored.loadBand).toBe("moderate");
      expect(scored.deloadIndex).toBe(100);
    });

    it("still says no when nothing has armed a trigger", () => {
      /* Guards the guard. A renormalised index that recommended a deload for
         every big single-discipline week would just be a new nag — the defect
         #1955 fixed on the other trigger. Good recovery, good adherence and no
         prior overreach must stay silent however much was run. */
      const scored = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        PROFILE
      );
      expect(scored.recoveryScore).toBeGreaterThanOrEqual(80);
      expect(scored.deloadRecommended).toBe(false);
    });

    it("changes nothing for a week that trained both, or neither", () => {
      /* The renormalisation applies ONLY when exactly one discipline has
         sessions. For everyone else `deloadIndex` IS the PI, so this is a
         no-op for the overwhelming majority of weeks — asserted as the
         equality rather than left to the reader. */
      const both = scorePerformance(
        week({ lifts: 4, runs: 6, km: 110, tonnage: 24000 }),
        BASELINE,
        PROFILE
      );
      expect(both.deloadIndex).toBe(both.performanceIndex);

      /* Deliberately LOPSIDED: heavy lifting, token running. A composite
         weights those together; `max(lift, run)` would not. The symmetric
         fixture above cannot tell the two apart — both disciplines max out,
         so every candidate formula agrees — and a mutation replacing the
         both-trained branch with a max() slipped through it. */
      const lopsided = scorePerformance(
        week({ lifts: 5, runs: 1, km: 4, tonnage: 40000 }),
        BASELINE,
        PROFILE
      );
      expect(lopsided.liftLoadScore).toBeGreaterThan(
        lopsided.runLoadScore + 30
      );
      expect(lopsided.deloadIndex).toBe(lopsided.performanceIndex);

      const neither = scorePerformance(
        week({ lifts: 0, runs: 0 }),
        BASELINE,
        PROFILE
      );
      expect(neither.deloadIndex).toBe(neither.performanceIndex);
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
      const bulk = scorePerformance(
        week({ lifts: 0, runs: 6, km: 110 }),
        BASELINE,
        {
          goal: "lean bulk",
          targetCalories: 2500,
          targetProtein: 160,
        }
      );
      expect(bulk.performanceIndex).toBeLessThan(68);
    });

    it("a genuinely untrained week still scores near the floor", () => {
      // The convention is not wrong everywhere: no training at all SHOULD
      // score low, and does. The problem is only that one discipline and
      // none are treated on the same scale.
      const nothing = scorePerformance(
        week({ lifts: 0, runs: 0 }),
        BASELINE,
        PROFILE
      );
      expect(nothing.liftLoadScore).toBe(0);
      expect(nothing.runLoadScore).toBe(0);
      expect(nothing.performanceIndex).toBeLessThan(45);
    });
  }
);
