/**
 * Property-based guard for generateRacePlanV2 — the race-plan generator, the
 * most complex correctness surface in the run arc.
 *
 * The plan's timing FLAGS must be internally consistent and agree with the
 * timing classifier the rest of the UI branches on (`classifyRaceTiming`, pinned
 * separately in D14). A drift between the generator's `compressed`/`belowFloor`
 * and the classifier would show the user one story (e.g. "finish-safely") while
 * the plan was built for another. This fuzzes random distances + race dates and
 * asserts:
 *   - totalWeeks respects the hard 2-week floor
 *   - belowFloor ⟹ compressed (documented implication)
 *   - the (compressed, belowFloor) pair EXACTLY matches classifyRaceTiming for
 *     the realized totalWeeks
 *   - weeks is a well-formed array of per-week run lists
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import { generateRacePlanV2, classifyRaceTiming } from "../runScheduler";
import { generateSchedule } from "@/lib/scheduleUtils";
import {
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTANCES = ["5k", "10k", "half", "marathon"] as const;
const CURRENT = "2026-06-01";

/** A target date `daysAhead` days after CURRENT. */
function targetDate(daysAhead: number): string {
  const d = parseLocalDate(CURRENT);
  d.setDate(d.getDate() + daysAhead);
  return localDateString(d);
}

describe("generateRacePlanV2 timing-flag consistency (property-based)", () => {
  it("flags are internally consistent and match classifyRaceTiming for the realized totalWeeks", () => {
    const rnd = mulberry32(861);
    for (let i = 0; i < 3000; i++) {
      const distance = DISTANCES[Math.floor(rnd() * DISTANCES.length)];
      const liftDays = Math.floor(rnd() * 5);
      const weeklyRunDays = 1 + Math.floor(rnd() * 5);
      const daysAhead = 3 + Math.floor(rnd() * 230); // ~0.5..33 weeks out
      const weekSchedule = generateSchedule(liftDays, weeklyRunDays);

      const plan = generateRacePlanV2({
        weekSchedule,
        raceGoal: { distance, targetDate: targetDate(daysAhead) },
        weeklyRunDays,
        currentDate: CURRENT,
        weekStart: localWeekKey(parseLocalDate(CURRENT)),
      });

      // totalWeeks >= 1. The old hard 2-week floor was relaxed for a race in
      // the CURRENT week (R2): a same-week race gets a 1-week plan ending on
      // race day, since there's no room for two forward weeks before it.
      expect(plan.totalWeeks).toBeGreaterThanOrEqual(1);
      // Documented implication.
      if (plan.belowFloor) expect(plan.compressed).toBe(true);

      // The generator's flags must match the classifier for the SAME weeks.
      const timing = classifyRaceTiming({
        distance,
        weeksRemaining: plan.totalWeeks,
      });
      const expected =
        timing === "healthy"
          ? { compressed: false, belowFloor: false }
          : timing === "compressible"
            ? { compressed: true, belowFloor: false }
            : { compressed: true, belowFloor: true };
      expect({
        compressed: plan.compressed,
        belowFloor: plan.belowFloor,
      }).toEqual(expected);

      // weeks is a well-formed array of per-week run lists.
      expect(Array.isArray(plan.weeks)).toBe(true);
      for (const wk of plan.weeks) expect(Array.isArray(wk)).toBe(true);
    }
  });
});
