/**
 * What the Performance Index does over MONTHS, and what it takes to move it.
 *
 * The PI is well covered per-call — `performanceEngine.test.ts` tables the
 * sub-scores, `performanceScoreBounds.property.test.ts` fuzzes the range,
 * `performanceEngineParity.cross.test.ts` pins client↔server equality. None of
 * them ask the longitudinal question, and the answer is a property of the model
 * rather than of any one branch:
 *
 * ── 1. The PI is FLAT under sustained progression ──
 *
 *   weekly growth   PI, weeks 5-30
 *   0%              82 82 82 … 82
 *   1%              83 83 83 … 83
 *   2%              84 84 84 … 84
 *   5%              88 88 88 … 88
 *
 * An athlete improving 2% a week for half a year — doubling their training
 * load over the period — reads 84 in week 5 and 84 in week 30. The number
 * never moves. That is structural: `computeLiftLoadScore` scores the RATIO of
 * this week to a rolling baseline of recent weeks, so steady growth keeps the
 * ratio constant and the baseline chases the athlete up.
 *
 * ── 2. The PI is scale-invariant ──
 *
 *   8 km/week + 3 t     → 82
 *   30 km/week + 12 t   → 82
 *   120 km/week + 48 t  → 82
 *   600 km/week + 240 t → 82
 *
 * Absolute fitness is invisible to it. A beginner and an elite training with
 * equal consistency score identically.
 *
 * ── 3. The top of the scale is only reachable by a spike the app calls
 *       overreaching ──
 *
 *   this week ÷ last 4 weeks' mean   PI    loadBand
 *   0.50×                             60   moderate
 *   1.00×                             82   high
 *   1.06×                             84   high      ← the whole non-overreach margin
 *   1.07×                             85   OVERREACH
 *   1.25×                             93   overreach
 *   1.50×                            100   overreach
 *
 * With recovery and adherence both perfect, consistent training scores 82, and
 * `computeLoadBand` flips to overreach at 85. So the top FIFTEEN points of the
 * scale sit entirely inside the overreach band, and the margin available to a
 * non-overreaching athlete is two points — ratios 1.03 to 1.06.
 *
 * The corollary is the sharper half: an athlete progressing 5% a week is
 * classified overreach PERMANENTLY (PI 88, every week, for as long as they
 * keep it up), because sustained growth holds the acute:chronic ratio above
 * the threshold rather than crossing it once. A user optimising for a high PI
 * is being pointed at the behaviour the deload logic exists to catch.
 *
 * ── Why this is pinned rather than changed ──
 *
 * None of it is a bug. An acute-to-chronic load ratio is a real and defensible
 * construct, and reading "am I doing more than usual?" is exactly what the
 * deload recommendation needs. The observation is about the gap between that
 * construct and what a 0-100 score called "Performance Index" invites a user
 * to read — a progress or fitness measure, which it structurally is not.
 * Whether to rescale it, rename it, or explain it is a product call, and
 * `docs/training-programming-claude-handoff.md` bars deciding it here.
 *
 * Sits alongside two earlier measurements of the same engine:
 * `singleDisciplineWeek.test.ts` (a lift-only or run-only week caps at 68) and
 * `deloadTriggerReachability.test.ts` (the adherence deload branch fires zero
 * times in 345,600 realistic weeks).
 *
 * ADR-0008: driven through `functions/lib/perfScoring.js`, the copy that
 * actually runs — the client `performanceEngine.ts` is an oracle with no
 * production consumers.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { scorePerformance } = require("../../../functions/lib/perfScoring") as {
  scorePerformance: (
    agg: Record<string, unknown>,
    bl: Record<string, unknown>,
    profile: Record<string, unknown>,
    previousWeekPI?: number
  ) => { performanceIndex: number; liftLoadScore: number; loadBand: string };
};

/**
 * One week of consistent hybrid training, scaled by a fitness `level`.
 * Recovery and adherence are held PERFECT throughout, so every number below
 * is the load component talking and nothing else.
 */
const weekAgg = (level: number) => ({
  liftSessions: 3,
  liftTonnage: 12000 * level,
  liftHardSets: 45 * level,
  runSessions: 3,
  runKm: 30 * level,
  runLongKm: 12 * level,
  runQualityCount: 1,
  mealDaysLogged: 6,
  workoutCount: 6,
  avgCalories: 2500,
  avgProtein: 160,
  bwCurrent7dAvg: 80,
  bwPrevious7dAvg: 80,
});

const PROFILE = {
  goal: "recomp",
  weeklyWorkoutsTarget: 6,
  targetCalories: 2500,
  targetProtein: 160,
};

/** The rolling baseline: the mean of the preceding weeks' levels. */
const baselineFrom = (levels: number[]) => {
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const a = weekAgg(mean);
  return {
    liftTonnage: a.liftTonnage,
    liftHardSets: a.liftHardSets,
    runKm: a.runKm,
    runLongKm: a.runLongKm,
    weeksUsed: 4,
  };
};

/** PI for a week at `level` against a baseline of the previous four. */
const piFor = (level: number, prevLevels: number[], prev?: number) =>
  scorePerformance(weekAgg(level), baselineFrom(prevLevels), PROFILE, prev);

/** Twenty-six scored weeks of compounding growth. */
function progression(growthPerWeek: number): number[] {
  const level = (w: number) => Math.pow(1 + growthPerWeek, w);
  const out: number[] = [];
  for (let w = 4; w < 30; w++) {
    out.push(
      piFor(level(w), [w - 4, w - 3, w - 2, w - 1].map(level), out.at(-1))
        .performanceIndex
    );
  }
  return out;
}

describe("performance index — flat under sustained progression", () => {
  it.each([
    { growth: 0, pi: 82 },
    { growth: 0.01, pi: 83 },
    { growth: 0.02, pi: 84 },
    { growth: 0.05, pi: 88 },
  ])(
    "$growth per week reads $pi in week 5 and still $pi in week 30",
    ({ growth, pi }) => {
      const series = progression(growth);
      expect(series).toHaveLength(26);
      expect(new Set(series), `PI moved: ${series.join(",")}`).toEqual(
        new Set([pi])
      );
    }
  );

  it("half a year of 2%/week doubles the training load and moves the PI by 2", () => {
    /* The size of the gap, stated as a ratio rather than left implicit. The
       athlete's actual work roughly doubles; the score they are shown moves
       from 82 (flat) to 84. */
    expect(Math.pow(1.02, 26)).toBeGreaterThan(1.6);
    expect(progression(0.02)[0] - progression(0)[0]).toBe(2);
  });
});

describe("performance index — absolute fitness is invisible", () => {
  it("scores a beginner and an elite identically when both are consistent", () => {
    const level = (x: number) => piFor(x, [x, x, x, x]).performanceIndex;
    // 8 km/week to 600 km/week — a 80× span of real training.
    expect([level(0.25), level(1), level(4), level(20)]).toEqual([
      82, 82, 82, 82,
    ]);
  });
});

describe("performance index — the top of the scale is the overreach band", () => {
  it("consistent training tops out at 82 with everything else perfect", () => {
    /* Recovery 100 and adherence 100 in this fixture, so 82 is the ceiling on
       "trained exactly as much as usual". The remaining 18 points are only
       available for doing MORE than usual. */
    const s = piFor(1, [1, 1, 1, 1]);
    expect(s.performanceIndex).toBe(82);
    expect(s.loadBand).toBe("high");
  });

  it.each([
    { ratio: 1.1, pi: 86, band: "overreach" },
    { ratio: 1.25, pi: 93, band: "overreach" },
    { ratio: 1.5, pi: 100, band: "overreach" },
  ])(
    "$ratio× the recent average → PI $pi, band $band",
    ({ ratio, pi, band }) => {
      const s = piFor(ratio, [1, 1, 1, 1]);
      expect(s.performanceIndex).toBe(pi);
      expect(s.loadBand).toBe(band);
    }
  );

  it("leaves a two-point margin before overreach, and no more", () => {
    /* The first sweep of this asserted that EVERY point above steady training
       is overreach, and that was wrong — there is a narrow window where the
       score rises and the band does not. Pinning the real boundary, both
       sides, because the width of that window is the whole question: how much
       better than usual can an athlete be scored before the app calls it
       overreaching? */
    const steady = piFor(1, [1, 1, 1, 1]);
    expect(steady.performanceIndex).toBe(82);

    const rises: number[] = [];
    for (let r = 1.01; r <= 2.0; r += 0.01) {
      const s = piFor(r, [1, 1, 1, 1]);
      if (s.loadBand !== "overreach") {
        rises.push(s.performanceIndex);
      } else {
        expect(s.performanceIndex).toBeGreaterThanOrEqual(85);
      }
    }
    // Everything scoreable without an overreach label: 82 through 84.
    expect(Math.max(...rises)).toBe(84);
    // So the top fifteen points of a hundred-point scale are overreach-only.
    expect(piFor(1.07, [1, 1, 1, 1]).loadBand).toBe("overreach");
    expect(piFor(1.06, [1, 1, 1, 1]).loadBand).toBe("high");
  });

  it("classifies sustained 5%/week progression as permanent overreach", () => {
    /* Not a threshold crossed once and cleared: steady growth HOLDS the
       acute:chronic ratio above the line, so the label never lifts while the
       athlete keeps progressing at that rate. */
    const level = (w: number) => Math.pow(1.05, w);
    for (const w of [4, 12, 20, 29]) {
      const s = piFor(level(w), [w - 4, w - 3, w - 2, w - 1].map(level));
      expect(s.performanceIndex, `week ${w}`).toBe(88);
      expect(s.loadBand, `week ${w}`).toBe("overreach");
    }
    // While 2%/week stays inside "high" — the boundary is between them.
    const l2 = (w: number) => Math.pow(1.02, w);
    expect(piFor(l2(20), [16, 17, 18, 19].map(l2)).loadBand).toBe("high");
  });

  it("and doing LESS is scored below it, so the scale is not one-sided", () => {
    expect(piFor(0.75, [1, 1, 1, 1]).performanceIndex).toBe(71);
    expect(piFor(0.5, [1, 1, 1, 1]).performanceIndex).toBe(60);
  });
});
