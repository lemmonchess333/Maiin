import { describe, it, expect } from "vitest";
import {
  estimateAdaptiveTDEE,
  computeWarmupProgress,
  ADAPTIVE_TDEE_DEFAULTS,
  type AdaptiveTdeeInput,
} from "../adaptiveTdee";

/** N consecutive "YYYY-MM-DD" keys from a start date (UTC, deterministic). */
function days(startKey: string, n: number): string[] {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10)
  );
}

const START = "2026-05-01";

function input(over: Partial<AdaptiveTdeeInput>): AdaptiveTdeeInput {
  const ds = days(START, 21);
  return {
    intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 2500 })),
    weighIns: ds.map((d) => ({ dateKey: d, weightKg: 80 })),
    ...over,
  };
}

describe("estimateAdaptiveTDEE", () => {
  // ── Warmup gate ────────────────────────────────────────────────────
  it("not ready when too few trusted intake-days", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE(
      input({
        intakeByDay: ds.slice(0, 5).map((d) => ({ dateKey: d, kcal: 2500 })),
      })
    );
    expect(r.ready).toBe(false);
    expect(r.learnedTDEE).toBeNull();
    expect(r.trustedDays).toBe(5);
  });

  it("not ready when too few weigh-ins", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE(
      input({
        weighIns: ds.slice(0, 5).map((d) => ({ dateKey: d, weightKg: 80 })),
      })
    );
    expect(r.ready).toBe(false);
    expect(r.weighInCount).toBe(5);
  });

  it("not ready when the elapsed span is under the minimum (water-artifact guard)", () => {
    // 8 weigh-ins but all within 8 days → span 7 < 14.
    const shortDs = days(START, 8);
    const r = estimateAdaptiveTDEE(
      input({ weighIns: shortDs.map((d) => ({ dateKey: d, weightKg: 80 })) })
    );
    expect(r.ready).toBe(false);
    expect(r.slopeKgPerDay).toBeNull();
  });

  // ── Core energy-balance math ───────────────────────────────────────
  it("flat weight → learnedTDEE ≈ average intake (slope ~0)", () => {
    const r = estimateAdaptiveTDEE(input({}));
    expect(r.ready).toBe(true);
    expect(r.slopeKgPerDay).toBeCloseTo(0, 4);
    expect(r.learnedTDEE).toBe(2500);
  });

  it("losing ~0.5 kg/week → TDEE meaningfully ABOVE intake (burned more than logged)", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 2000 })),
      weighIns: ds.map((d, i) => ({
        dateKey: d,
        weightKg: 80 - 0.5 * (i / 7),
      })),
    });
    expect(r.ready).toBe(true);
    expect(r.slopeKgPerDay!).toBeLessThan(0);
    // ≈ 2000 + 0.0714×7700 ≈ 2550 (unbiased least-squares on raw weigh-ins).
    expect(r.learnedTDEE!).toBeGreaterThan(2530);
    expect(r.learnedTDEE!).toBeLessThan(2570);
  });

  it("gaining weight → TDEE BELOW intake (ate more than burned)", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 3000 })),
      weighIns: ds.map((d, i) => ({
        dateKey: d,
        weightKg: 80 + 0.5 * (i / 7),
      })),
    });
    expect(r.ready).toBe(true);
    expect(r.slopeKgPerDay!).toBeGreaterThan(0);
    expect(r.learnedTDEE!).toBeLessThan(3000);
  });

  // ── Returns MAINTENANCE, not the deficit intake ────────────────────
  it("in-deficit user → returns maintenance (not their low intake)", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      // eating 1800 while losing 0.5 kg/wk → true maintenance ≈ 2350
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 1800 })),
      weighIns: ds.map((d, i) => ({
        dateKey: d,
        weightKg: 80 - 0.5 * (i / 7),
      })),
    });
    expect(r.ready).toBe(true);
    // ≈ 1800 + 550 ≈ 2350 — maintenance, NOT the 1800 deficit intake.
    expect(r.learnedTDEE!).toBeGreaterThan(2300);
    expect(r.learnedTDEE!).toBeLessThan(2400);
  });

  // ── Trusted-days-only / gross-error exclusion ──────────────────────
  it("excludes gross-error days from the trusted count and the average", () => {
    const ds = days(START, 21);
    const intakeByDay = ds.map((d, i) => ({
      dateKey: d,
      // 5 broken sub-floor days (200 kcal) interleaved; 16 real 2500-kcal days
      kcal: i % 4 === 0 ? 200 : 2500,
    }));
    const r = estimateAdaptiveTDEE({
      intakeByDay,
      weighIns: ds.map((d) => ({ dateKey: d, weightKg: 80 })),
    });
    const realDays = intakeByDay.filter((d) => d.kcal === 2500).length;
    expect(r.trustedDays).toBe(realDays); // the 200-kcal days excluded
    expect(r.learnedTDEE).toBe(2500); // average over trusted days only, flat weight
  });

  it("irregularly-spaced weigh-ins still produce a per-day slope", () => {
    // gaps in weigh-ins; slope must be kg/day against real date offsets
    const ds = days(START, 21);
    const sparse = ds.filter((_, i) => i % 2 === 0); // every other day, 11 weigh-ins
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 2200 })),
      weighIns: sparse.map((d, i) => ({
        dateKey: d,
        weightKg: 80 - 0.5 * (i / 3.5),
      })),
    });
    expect(r.ready).toBe(true);
    expect(r.slopeKgPerDay!).toBeLessThan(0);
    expect(r.learnedTDEE!).toBeGreaterThan(2200);
  });
});

describe("estimateAdaptiveTDEE — spanDays", () => {
  it("reports spanDays even below the gate (for the warmup bar)", () => {
    const ds = days(START, 21);
    // Only 5 weigh-ins spanning 4 days — below every gate, but span must report.
    const r = estimateAdaptiveTDEE(
      input({
        weighIns: ds.slice(0, 5).map((d) => ({ dateKey: d, weightKg: 80 })),
      })
    );
    expect(r.ready).toBe(false);
    expect(r.spanDays).toBe(4);
  });

  it("spanDays is 0 with fewer than two weigh-ins", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE(
      input({ weighIns: [{ dateKey: ds[0], weightKg: 80 }] })
    );
    expect(r.spanDays).toBe(0);
  });

  it("spanDays spans first→last on a full window", () => {
    const r = estimateAdaptiveTDEE(input({}));
    expect(r.spanDays).toBe(20); // 21 consecutive days → 20-day span
    expect(r.ready).toBe(true);
  });
});

describe("the readiness gates at their boundaries", () => {
  /* Three of the five gate constants were movable with this suite green.
     Measured: minTrustedDays 10 -> 4 failed, minSpanDays 14 -> 7 failed,
     but plausibilityFloorKcal 800 -> 400 and minWeighIns 8 -> 3 both
     passed, because no case sat anywhere in those gaps — the sub-floor
     test logs 200 kcal (under either floor) and every ready case supplies
     21 weigh-ins (over either minimum).

     These gates decide whether the app moves a real person's calorie
     target off its own estimate, so the direction of an unnoticed drift
     matters. Dropping the floor lets a half-logged 500 kcal day count as
     real intake and drags the learned TDEE — and therefore the target —
     down. Dropping the weigh-in minimum fits a slope through too few
     points and adapts on noise.

     It takes BOTH halves below to hold this, and the split is the point.
     The boundary cases derive their inputs from the constants, so they
     pin STRICTNESS — that the floor is `>=` and the count `<` — and they
     would pass at any value, because an expectation computed by the code
     path under test is a consistency check, not a behaviour one. The
     literal assertion is what pins the VALUES. Written the derived way
     first, and all five value mutations sailed through; recording that
     here because `computeWarmupProgress`'s tests below have the same
     shape and are equally silent about where the gates sit. */
  const { plausibilityFloorKcal, minWeighIns, minTrustedDays } =
    ADAPTIVE_TDEE_DEFAULTS;

  it("holds the gate constants at the values the product chose", () => {
    /* A whole-object compare, so an added or dropped key fails too. Change
       a number here only alongside the reason it moved. */
    expect(ADAPTIVE_TDEE_DEFAULTS).toEqual({
      windowDays: 21,
      plausibilityFloorKcal: 800,
      minTrustedDays: 10,
      minWeighIns: 8,
      minSpanDays: 14,
      kcalPerKg: 7700,
    });
  });

  it("counts a day exactly at the plausibility floor as real intake", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: plausibilityFloorKcal })),
      weighIns: ds.map((d) => ({ dateKey: d, weightKg: 80 })),
    });
    expect(r.trustedDays).toBe(21);
  });

  it("excludes a day one kcal under the floor", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      // One broken day among 20 real ones.
      intakeByDay: ds.map((d, i) => ({
        dateKey: d,
        kcal: i === 0 ? plausibilityFloorKcal - 1 : 2500,
      })),
      weighIns: ds.map((d) => ({ dateKey: d, weightKg: 80 })),
    });
    expect(r.trustedDays).toBe(20);
  });

  it("is ready at exactly the weigh-in minimum", () => {
    const ds = days(START, 21);
    /* Spread them across the full window so the span gate is satisfied and
       the weigh-in COUNT is the only thing under test. */
    const spread = Array.from({ length: minWeighIns }, (_, i) =>
      Math.round((i * 20) / (minWeighIns - 1))
    );
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 2500 })),
      weighIns: spread.map((i) => ({ dateKey: ds[i], weightKg: 80 })),
    });
    expect(r.weighInCount).toBe(minWeighIns);
    expect(r.ready).toBe(true);
  });

  it("is not ready one weigh-in short, with the span still cleared", () => {
    const ds = days(START, 21);
    const spread = Array.from({ length: minWeighIns - 1 }, (_, i) =>
      Math.round((i * 20) / (minWeighIns - 2))
    );
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds.map((d) => ({ dateKey: d, kcal: 2500 })),
      weighIns: spread.map((i) => ({ dateKey: ds[i], weightKg: 80 })),
    });
    expect(r.weighInCount).toBe(minWeighIns - 1);
    expect(r.spanDays).toBe(20); // span is NOT what is failing here
    expect(r.ready).toBe(false);
  });

  it("is ready at exactly the trusted-day minimum", () => {
    const ds = days(START, 21);
    const r = estimateAdaptiveTDEE({
      intakeByDay: ds
        .slice(0, minTrustedDays)
        .map((d) => ({ dateKey: d, kcal: 2500 })),
      weighIns: ds.map((d) => ({ dateKey: d, weightKg: 80 })),
    });
    expect(r.trustedDays).toBe(minTrustedDays);
    expect(r.ready).toBe(true);
  });
});

describe("computeWarmupProgress", () => {
  const { minTrustedDays, minWeighIns, minSpanDays } = ADAPTIVE_TDEE_DEFAULTS;

  it("is 0 with no data", () => {
    const p = computeWarmupProgress({
      ready: false,
      trustedDays: 0,
      weighInCount: 0,
      spanDays: 0,
    });
    expect(p.fraction).toBe(0);
    expect(p.ready).toBe(false);
  });

  it("tracks the binding (slowest) gate condition", () => {
    // trusted maxed, weigh-ins maxed, but span only half → fraction ~0.5
    const p = computeWarmupProgress({
      ready: false,
      trustedDays: minTrustedDays,
      weighInCount: minWeighIns,
      spanDays: minSpanDays / 2,
    });
    expect(p.fraction).toBeCloseTo(0.5, 5);
  });

  it("clamps below 1.0 until ready, even when all raw ratios are met", () => {
    // All conditions numerically met but ready=false (e.g. window churn):
    // must NOT show a full bar — that would promise an unlock not honored.
    const p = computeWarmupProgress({
      ready: false,
      trustedDays: minTrustedDays + 5,
      weighInCount: minWeighIns + 5,
      spanDays: minSpanDays + 5,
    });
    expect(p.fraction).toBe(0.99);
  });

  it("is exactly 1.0 only when ready", () => {
    const p = computeWarmupProgress({
      ready: true,
      trustedDays: minTrustedDays,
      weighInCount: minWeighIns,
      spanDays: minSpanDays,
    });
    expect(p.fraction).toBe(1);
    expect(p.ready).toBe(true);
  });
});
