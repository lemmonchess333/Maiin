import { describe, it, expect } from "vitest";
import { estimateAdaptiveTDEE, type AdaptiveTdeeInput } from "../adaptiveTdee";

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
