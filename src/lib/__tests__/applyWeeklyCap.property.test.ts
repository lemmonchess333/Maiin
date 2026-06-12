/**
 * Property-based guard for the adaptive-TDEE weekly RATE CAP (Nutr2).
 *
 * The learned calorie target may move at most ±150 kcal per rolling 7 days
 * (`MAX_WEEKLY_STEP_KCAL` / `CAP_CADENCE_DAYS`). This is a TRUST invariant — it
 * stops the adaptive engine from swinging a user's calories wildly between
 * weeks. Example tests pin specific steps; this fuzzes the cap over random
 * learned values + threaded multi-week simulations and asserts the bound holds
 * for ALL of them.
 *
 * Deterministic (seeded PRNG).
 */
import { describe, it, expect } from "vitest";
import {
  applyWeeklyCap,
  MAX_WEEKLY_STEP_KCAL,
  CAP_CADENCE_DAYS,
  type CapState,
} from "../adaptiveTarget";

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

const cal = (rnd: () => number) => 1200 + Math.round(rnd() * 2800); // 1200–4000

describe("applyWeeklyCap rate-cap invariant (property-based)", () => {
  it("a single application never moves the value more than one cap step", () => {
    const rnd = mulberry32(101);
    for (let i = 0; i < 4000; i++) {
      const prevApplied = cal(rnd);
      const prev: CapState = {
        lastApplied: prevApplied,
        // Past the cadence window so a step is allowed.
        lastAppliedAt: new Date(
          Date.now() - (CAP_CADENCE_DAYS + 1) * 86_400_000
        ).toISOString(),
      };
      const r = applyWeeklyCap({
        rawLearned: cal(rnd),
        formulaTarget: cal(rnd),
        prev,
        now: new Date(),
      });
      expect(Math.abs(r.applied - prevApplied)).toBeLessThanOrEqual(
        MAX_WEEKLY_STEP_KCAL
      );
    }
  });

  it("holds the value with zero movement inside the cadence window", () => {
    const rnd = mulberry32(202);
    for (let i = 0; i < 2000; i++) {
      const prevApplied = cal(rnd);
      const prev: CapState = {
        lastApplied: prevApplied,
        // Within the window → must not move regardless of how far learned is.
        lastAppliedAt: new Date(
          Date.now() - rnd() * (CAP_CADENCE_DAYS - 0.5) * 86_400_000
        ).toISOString(),
      };
      const r = applyWeeklyCap({
        rawLearned: cal(rnd),
        formulaTarget: cal(rnd),
        prev,
        now: new Date(),
      });
      expect(r.applied).toBe(prevApplied);
      expect(r.changed).toBe(false);
    }
  });

  it("over a multi-week walk, each weekly step is ≤ cap and converges toward (never overshoots) the target", () => {
    const rnd = mulberry32(303);
    for (let sim = 0; sim < 400; sim++) {
      const formula = cal(rnd);
      const learned = cal(rnd); // a fixed learned target to converge toward
      let prev: CapState | null = null;
      let applied = formula;
      for (let week = 0; week < 30; week++) {
        const now = new Date(Date.now() + week * CAP_CADENCE_DAYS * 86_400_000);
        const r = applyWeeklyCap({
          rawLearned: learned,
          formulaTarget: formula,
          prev,
          now,
        });
        // Each realized weekly step respects the cap.
        expect(Math.abs(r.applied - applied)).toBeLessThanOrEqual(
          MAX_WEEKLY_STEP_KCAL
        );
        // Monotonic convergence: never steps PAST the target.
        if (learned >= applied) expect(r.applied).toBeLessThanOrEqual(learned);
        else expect(r.applied).toBeGreaterThanOrEqual(learned);
        applied = r.applied;
        prev = r.capState;
      }
      // After enough cap-sized steps it reaches the learned target exactly.
      expect(applied).toBe(learned);
    }
  });
});
