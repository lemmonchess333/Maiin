/**
 * A deload is recommended on the TRANSITION into overreach, not on the state.
 *
 * `shouldRecommendDeload`'s sustained branch asks for two consecutive weeks at
 * PI ≥ 85 — a reasonable thing to catch. Under a rolling-baseline PI it is also
 * what steady improvement looks like, because sustained growth HOLDS the
 * acute:chronic ratio above the line rather than crossing it once (measured in
 * `performanceIndexOverTime.test.ts`).
 *
 * So before the transition guard, the trigger had a cliff — and above it, it
 * never stopped:
 *
 *   weekly growth   weeks recommending a deload, of 26
 *                   before          after
 *   0%                0               0
 *   2.0%              0               0
 *   2.6%              0               0
 *   2.8%             25               1
 *   5.0%             25               1
 *   8.0%             25               1
 *
 * Two tenths of a percentage point used to separate "never suggests a deload"
 * from "suggests one every week, indefinitely", and it never cleared on its own:
 * the athlete was not overreaching in any transient sense, they were improving
 * at a steady rate, and the condition was re-satisfied every week for as long as
 * they kept it up.
 *
 * That is user-facing. `DeloadBanner` renders off `resolveDeloadRecommended`,
 * carries an Apply CTA that really does cut the week's volume, and its dismissal
 * is scoped per-week — so the affected athlete got the banner again every week
 * and dismissed it every week.
 *
 * The guard now takes a third reading, `weekBeforePreviousPI`, and stays quiet
 * when the athlete was ALREADY in the band. Recommending the same action every
 * week while nothing has changed is a notification defect whichever way the
 * underlying training question is answered — so this deliberately changes WHEN
 * the existing recommendation fires and not WHAT counts as overreach. The
 * thresholds are untouched.
 *
 * What still fires, asserted below so the guard is not mistaken for a mute:
 *
 *   - a genuine spike from a steady baseline;
 *   - the same spike a second week running;
 *   - a RE-escalation after the athlete came back down — the edge re-arms.
 *
 * Absent third reading (legacy caller, or a user with only two weeks of
 * history) reads as "not yet in the band", so a cold-start athlete's first
 * crossing is as loud as it ever was.
 *
 * ADR-0008: driven through `functions/lib/perfScoring.js`, the running copy.
 * `functions/performanceEngine.js` reads the perf docs at −1 and −2 windows to
 * supply both, and this harness threads both the same way — an earlier version
 * passed only the previous week, which left the new parameter permanently
 * undefined and made every assertion here describe the pre-fix behaviour while
 * appearing to exercise the new one.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { scorePerformance as scoreTs } from "../performanceEngine";
import type { WeeklyAggregates, Baseline } from "../performanceTypes";

const require = createRequire(import.meta.url);
const { scorePerformance } = require("../../../functions/lib/perfScoring") as {
  scorePerformance: (
    agg: Record<string, unknown>,
    bl: Record<string, unknown>,
    profile: Record<string, unknown>,
    previousWeekPI?: number,
    weekBeforePreviousPI?: number
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

/**
 * 26 weeks of compounding growth; returns each week's (PI, deload) pair.
 *
 * Threads BOTH prior PIs, exactly as `functions/performanceEngine.js` now does
 * — it reads the perf docs at −1 and −2 windows. An earlier version of this
 * harness passed only the previous week, which left the transition-edge
 * parameter permanently undefined and made every assertion below describe the
 * pre-fix behaviour while appearing to exercise the new one.
 */
function run(growthPerWeek: number) {
  const level = (w: number) => Math.pow(1 + growthPerWeek, w);
  const out: { week: number; pi: number; deload: boolean }[] = [];
  let prev: number | undefined;
  let prev2: number | undefined;
  for (let w = 4; w < 30; w++) {
    const s = scorePerformance(
      weekAgg(level(w)),
      baselineFrom([w - 4, w - 3, w - 2, w - 1].map(level)),
      PROFILE,
      prev,
      prev2
    );
    out.push({ week: w, pi: s.performanceIndex, deload: s.deloadRecommended });
    prev2 = prev;
    prev = s.performanceIndex;
  }
  return out;
}

const deloadWeeks = (growth: number) =>
  run(growth).filter((r) => r.deload).length;

describe("deload trigger — steady progression is told once, not weekly", () => {
  it.each([
    { growth: 0, weeks: 0 },
    { growth: 0.02, weeks: 0 },
    { growth: 0.026, weeks: 0 },
    { growth: 0.028, weeks: 1 },
    { growth: 0.05, weeks: 1 },
    { growth: 0.08, weeks: 1 },
  ])(
    "$growth per week → a deload recommended in $weeks of 26 weeks",
    ({ growth, weeks }) => {
      expect(deloadWeeks(growth)).toBe(weeks);
    }
  );

  it("still marks the crossing, then goes quiet", () => {
    /* The athlete is not silenced — they are told once, when they enter the
       band, and not again while they simply stay there. */
    const rows = run(0.05);
    /* Week 5 is the earliest possible: the branch needs two readings, and week
       4 is the first scored week in this harness, so week 5 is the first with a
       previous. A real user mid-streak when this shipped has BOTH prior docs
       and is suppressed immediately — no retroactive burst on deploy. */
    expect(rows.filter((r) => r.deload).map((r) => r.week)).toEqual([5]);
    // Every week of the streak is the SAME state; only the first is announced.
    for (const r of rows.slice(1)) expect(r.pi, `week ${r.week}`).toBe(88);
  });

  it("the 2.6 / 2.8% cliff is still where the band starts", () => {
    /* Unchanged: the fix moved the notification, not the threshold. */
    expect(run(0.026)[0].pi).toBe(84);
    expect(run(0.028)[0].pi).toBe(85); // the branch's threshold, exactly
    expect(deloadWeeks(0.026)).toBe(0);
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

  it("re-arms after the athlete comes back down", () => {
    /* The property that separates a transition guard from a mute. A spike, a
       recovery, then a SECOND spike must be announced again — otherwise one
       overreach in January would silence the rest of the year. */
    const spike = () => baselineFrom([1, 1, 1, 1]);
    // In the band, already announced → quiet.
    expect(
      scorePerformance(weekAgg(1.5), spike(), PROFILE, 100, 100)
        .deloadRecommended
    ).toBe(false);
    // Came back down: two ordinary weeks.
    expect(
      scorePerformance(weekAgg(1.0), spike(), PROFILE, 100, 100)
        .deloadRecommended
    ).toBe(false);
    // Escalates again from a settled baseline → announced.
    expect(
      scorePerformance(weekAgg(1.5), spike(), PROFILE, 100, 82)
        .deloadRecommended
    ).toBe(true);
  });

  it("leaves the other two branches alone", () => {
    /* Only the sustained branch takes the transition guard. Poor recovery and
       poor adherence are states worth repeating — an athlete who is still not
       recovering has not stopped needing to hear it — so they are untouched
       even with both prior readings in the band. */
    /* Reaching the recovery branch needs PI >= 80 AND recovery < 45 at the
       same time, which takes a HIGH load alongside the poor recovery — a big
       weight swing, no meal logging, and a session count over the 8 that trips
       the overtraining penalty. Tanking recovery alone drags the PI under 80
       and misses the branch entirely. */
    const poorRecovery = {
      ...weekAgg(1.5),
      liftSessions: 6,
      runSessions: 4,
      bwCurrent7dAvg: 80,
      bwPrevious7dAvg: 83.5,
      mealDaysLogged: 0,
    };
    const r = scorePerformance(
      poorRecovery,
      baselineFrom([1, 1, 1, 1]),
      PROFILE,
      100,
      100
    );
    expect(r.performanceIndex).toBeGreaterThanOrEqual(80);
    expect(r.deloadRecommended).toBe(true);
  });
});

/**
 * The same question for a run-only athlete, where the deload is asked against
 * `deloadIndex` rather than the composite PI.
 *
 * A single-discipline week caps the composite at 68 (recomp), so before
 * `deloadIndex` the sustained branch could never fire for this athlete; after
 * it, the branch fires on a figure the transition guard has to see in the
 * SAME units for the two prior weeks. `functions/performanceEngine.js` reads
 * both priors through `priorDeloadIndex` (pinned at source level in
 * functions/__tests__/performanceEngine.test.js), falling back to
 * `performanceIndex` on docs written before the field existed. `priorReading`
 * below is that fallback, and the harness carries each week's doc forward
 * through it exactly as the engine reads the perf docs at −1 and −2 windows.
 *
 * Measured with this fixture (4 runs, one of them quality, perfect recovery
 * and adherence), the deload index sits at 88 / 91 / 94 for 3 / 5 / 8% weekly
 * growth while the displayed PI stays at 62 / 63 / 65: in the band every week
 * of the block, which is exactly the state the transition guard exists for.
 */
const ENGINES: [string, typeof scoreTs][] = [
  ["server (authoritative)", scorePerformance as unknown as typeof scoreTs],
  ["client (@oracle)", scoreTs],
];

const RUN_PROFILE = {
  goal: "recomp",
  weeklyWorkoutsTarget: 4,
  targetCalories: 2500,
  targetProtein: 160,
};

/** A run-only week at a `level` of the athlete's starting volume. */
const runOnlyWeek = (level: number): WeeklyAggregates => ({
  weekKey: "2026-05-17",
  liftTonnage: 0,
  liftHardSets: 0,
  liftSessions: 0,
  runKm: 30 * level,
  runLongKm: 12 * level,
  runQualityCount: 1,
  runSessions: 4,
  mealDaysLogged: 6,
  avgDailyCalories: 2500,
  avgDailyProtein: 160,
  bwCurrent7dAvg: 80,
  bwPrevious7dAvg: 80,
});

/** The four weeks before, averaged, as the rolling baseline. */
const runBaseline = (levels: number[]): Baseline => {
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return {
    liftTonnage: 0,
    liftHardSets: 0,
    runKm: 30 * mean,
    runLongKm: 12 * mean,
    weeksUsed: 4,
  };
};

type PerfDocLike = { performanceIndex: number; deloadIndex?: number };

/** `priorDeloadIndex` in functions/performanceEngine.js, on a stored doc. */
const priorReading = (doc: PerfDocLike | undefined) =>
  doc == null
    ? undefined
    : typeof doc.deloadIndex === "number"
      ? doc.deloadIndex
      : doc.performanceIndex;

/** Compounding growth from a level of 1. */
const growing = (growth: number, weeks = 30) =>
  Array.from({ length: weeks }, (_, w) => Math.pow(1 + growth, w));

/**
 * Scores weeks 4..end of `levels` and returns the weeks a deload was offered.
 * `legacyDocs` stores the first N docs without `deloadIndex`, as a user whose
 * history predates the field has them.
 */
function offeredWeeks(score: typeof scoreTs, levels: number[], legacyDocs = 0) {
  const docs: PerfDocLike[] = [];
  const offered: number[] = [];
  for (let w = 4; w < levels.length; w++) {
    const s = score(
      runOnlyWeek(levels[w]),
      runBaseline(levels.slice(w - 4, w)),
      RUN_PROFILE,
      priorReading(docs[docs.length - 1]),
      priorReading(docs[docs.length - 2])
    );
    if (s.deloadRecommended) offered.push(w);
    docs.push(
      docs.length < legacyDocs
        ? { performanceIndex: s.performanceIndex }
        : { performanceIndex: s.performanceIndex, deloadIndex: s.deloadIndex }
    );
  }
  return offered;
}

describe.each(ENGINES)(
  "deload trigger — a run-only athlete is told on the transition [%s]",
  (_label, score) => {
    it.each([0.03, 0.05, 0.08])(
      "%s per week for 26 weeks → one offer, on entering the band",
      (growth) => {
        const levels = growing(growth);
        // The block is sustained: every week of it is in the band, and the
        // displayed PI never is (the single-discipline cap).
        for (let w = 4; w < levels.length; w++) {
          const s = score(
            runOnlyWeek(levels[w]),
            runBaseline(levels.slice(w - 4, w)),
            RUN_PROFILE
          );
          expect(s.deloadIndex, `week ${w}`).toBeGreaterThanOrEqual(85);
          expect(s.performanceIndex, `week ${w}`).toBeLessThan(85);
        }
        /* Week 5 is the first with a previous reading (week 4 is the first
           scored), so it is the earliest the branch can fire. */
        expect(offeredWeeks(score, levels)).toEqual([5]);
      }
    );

    it("a history of legacy docs is offered once, after the first new doc", () => {
      /* The deploy-day case. The first three docs have no `deloadIndex`, so
         the priors fall back to the composite PI (63), which is under the
         band. The first offer comes when the previous doc is a new one and
         the one before it is not; after that the guard sees two in-band
         readings and stays quiet. */
      expect(offeredWeeks(score, growing(0.05), 3)).toEqual([8]);
    });

    it("re-arms for a second block after an easy fortnight", () => {
      /* At most once per sustained block, not once ever: two easy weeks at
         60% drop the index out of the band, and the next climb back into it
         is announced. */
      const levels: number[] = [];
      let level = 1;
      for (let w = 0; w < 30; w++) {
        if (w === 14 || w === 15) {
          levels.push(level * 0.6);
          continue;
        }
        levels.push(level);
        level *= 1.05;
      }
      expect(offeredWeeks(score, levels)).toEqual([5, 17]);
    });

    it("would nag every week if the two priors were read in mixed units", () => {
      /* Why both priors must go through the same reader. With the previous
         week in deload units and the one before in composite units, the guard
         never sees the athlete already in the band, so the offer repeats every
         week from the second on: the #1955 nag, on this trigger. */
      const levels = growing(0.05);
      const docs: PerfDocLike[] = [];
      let offers = 0;
      for (let w = 4; w < levels.length; w++) {
        const s = score(
          runOnlyWeek(levels[w]),
          runBaseline(levels.slice(w - 4, w)),
          RUN_PROFILE,
          docs[docs.length - 1]?.deloadIndex,
          docs[docs.length - 2]?.performanceIndex
        );
        if (s.deloadRecommended) offers++;
        docs.push({
          performanceIndex: s.performanceIndex,
          deloadIndex: s.deloadIndex,
        });
      }
      expect(offers).toBe(25);
    });
  }
);
