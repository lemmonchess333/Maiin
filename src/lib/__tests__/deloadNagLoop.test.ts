/**
 * The deload recommendation cannot tell "overreaching" from "progressing".
 *
 * `shouldRecommendDeload`'s second branch is
 *
 *     currentPI >= 85 && previousWeekPI >= 85
 *
 * — two consecutive weeks running hot, which is a reasonable thing to catch.
 * Under a rolling-baseline PI it is also what steady improvement looks like,
 * because sustained growth HOLDS the acute:chronic ratio above the line rather
 * than crossing it once (measured in `performanceIndexOverTime.test.ts`).
 *
 * So the trigger has a cliff, and it is a sharp one:
 *
 *   weekly growth in training load   weeks recommending a deload (of 26)
 *   0%                                0
 *   2.0%                              0
 *   2.6%                              0
 *   2.8%                             25   ← every week from the second onward
 *   5.0%                             25
 *   8.0%                             25
 *
 * Two tenths of a percentage point separates "never suggests a deload" from
 * "suggests one every week, indefinitely". Above the cliff it never clears on
 * its own: the athlete is not overreaching in any transient sense, they are
 * improving at a steady rate, and the condition is re-satisfied every week for
 * as long as they keep it up.
 *
 * This is user-facing, not internal. `DeloadBanner` renders off
 * `resolveDeloadRecommended`, carries an Apply CTA that really does cut the
 * week's volume, and its dismissal is scoped per-week — so the affected user
 * gets the banner again every week and dismisses it every week. Applying it
 * would drop the ratio, clear the flag, and let the cycle restart.
 *
 * Whether 2.8%/week of tonnage growth is "a lot" is exactly the question, and
 * it is a training-policy one: for a novice adding load every session it is
 * ordinary, and CLAUDE.md's design-for-the-user-base rule says the cold-start
 * segment is the one to design for. Nothing is changed here — fixing it means
 * deciding how the trigger should distinguish acceleration from a sustained
 * level, which `docs/training-programming-claude-handoff.md` bars deciding in
 * a test file.
 *
 * Companion to `deloadTriggerReachability.test.ts`, which measured the OTHER
 * two branches over 345,600 realistic weeks (recovery 13,242 hits, sustained
 * 33,973, adherence 0). This one asks what the sustained branch does to a
 * single user over time rather than how often it fires across a population.
 *
 * ADR-0008: driven through `functions/lib/perfScoring.js`, the running copy.
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
  ) => { performanceIndex: number; deloadRecommended: boolean };
};

/** Consistent hybrid training, scaled by a `level`. Recovery + adherence perfect. */
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

const baselineFrom = (levels: number[]) => {
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const a = weekAgg(mean);
  return {
    liftTonnage: a.liftTonnage,
    liftHardSets: a.liftHardSets,
    runKm: a.runKm,
    runLongKm: a.runLongKm,
    // >= 3 or `scorePerformance` gates the recommendation off entirely.
    weeksUsed: 4,
  };
};

/** 26 weeks of compounding growth; returns each week's (PI, deload) pair. */
function run(growthPerWeek: number) {
  const level = (w: number) => Math.pow(1 + growthPerWeek, w);
  const out: { week: number; pi: number; deload: boolean }[] = [];
  let prev: number | undefined;
  for (let w = 4; w < 30; w++) {
    const s = scorePerformance(
      weekAgg(level(w)),
      baselineFrom([w - 4, w - 3, w - 2, w - 1].map(level)),
      PROFILE,
      prev
    );
    out.push({ week: w, pi: s.performanceIndex, deload: s.deloadRecommended });
    prev = s.performanceIndex;
  }
  return out;
}

const deloadWeeks = (growth: number) => run(growth).filter((r) => r.deload).length;

describe("deload trigger — steady progression reads as sustained overreach", () => {
  it.each([
    { growth: 0, weeks: 0 },
    { growth: 0.02, weeks: 0 },
    { growth: 0.026, weeks: 0 },
    { growth: 0.028, weeks: 25 },
    { growth: 0.05, weeks: 25 },
    { growth: 0.08, weeks: 25 },
  ])(
    "$growth per week → a deload recommended in $weeks of 26 weeks",
    ({ growth, weeks }) => {
      expect(deloadWeeks(growth)).toBe(weeks);
    }
  );

  it("flips on a two-tenths-of-a-percent difference in progression", () => {
    /* The cliff itself, stated as the pair. Nothing about the athlete changes
       qualitatively between these two — one is improving very slightly faster
       than the other, and only one of them is told to back off, every week. */
    expect(deloadWeeks(0.026)).toBe(0);
    expect(deloadWeeks(0.028)).toBe(25);
    expect(run(0.026)[0].pi).toBe(84);
    expect(run(0.028)[0].pi).toBe(85); // the branch's threshold, exactly
  });

  it("never clears on its own once above the cliff", () => {
    /* Not a transient warning that resolves. Week 5 and week 29 are the same
       state: the athlete is progressing steadily and the condition is
       re-satisfied every week for as long as they keep going. */
    const rows = run(0.05);
    expect(rows[0].deload).toBe(false); // week 4 — no previous week yet
    for (const r of rows.slice(1)) {
      expect(r.deload, `week ${r.week}`).toBe(true);
      expect(r.pi, `week ${r.week}`).toBe(88);
    }
  });

  it("needs the previous week too — a single hot week does not fire it", () => {
    /* The branch is doing what it was written to do; the problem is what
       "two hot weeks" means under a rolling baseline, not the guard. A
       one-week spike against a steady history is correctly ignored. */
    const spike = scorePerformance(
      weekAgg(1.5),
      baselineFrom([1, 1, 1, 1]),
      PROFILE,
      82 // last week was ordinary
    );
    expect(spike.performanceIndex).toBe(100);
    expect(spike.deloadRecommended).toBe(false);

    // The same spike a second week running does fire it, which is correct.
    const second = scorePerformance(
      weekAgg(1.5),
      baselineFrom([1, 1, 1, 1]),
      PROFILE,
      100
    );
    expect(second.deloadRecommended).toBe(true);
  });

  it("is gated off entirely until the baseline is deep enough", () => {
    /* The one thing that stops this reaching a brand-new user in their first
       fortnight: `weeksUsed >= 3`. Worth pinning next to the cliff, since it
       is the only reason the nag does not start on day one. */
    const shallow = {
      ...baselineFrom([1, 1, 1, 1]),
      weeksUsed: 2,
    };
    const s = scorePerformance(weekAgg(1.5), shallow, PROFILE, 100);
    expect(s.performanceIndex).toBe(100);
    expect(s.deloadRecommended).toBe(false);
  });
});
