/**
 * normalisePerformanceDoc — Firestore-shape reshape contract.
 *
 * The Cloud Function (functions/performanceEngine.js) writes the
 * weekly performance doc with sub-scores as TOP-LEVEL fields. The
 * consumer-facing type (PerformanceWeekDoc) declares them nested
 * under `breakdown`. The hook's normaliser bridges that gap so
 * downstream surfaces (PerformanceCard, PerformanceTab) can read
 * `currentWeek.breakdown.*` without crashing.
 *
 * Both production-merged surfaces blanket-read `breakdown` and
 * crashed every render when the field was missing — caught in
 * prod after the P2 commit. These tests pin the reshape so a
 * future refactor can't silently regress.
 */
import { describe, it, expect } from "vitest";
import { normalisePerformanceDoc } from "../usePerformance";

describe("normalisePerformanceDoc — Firestore reshape", () => {
  it("derives breakdown from CF flat fields (the common path)", () => {
    const result = normalisePerformanceDoc("2026-05-19", {
      weekKey: "2026-05-19",
      performanceIndex: 72,
      liftLoadScore: 60,
      runLoadScore: 50,
      recoveryScore: 75,
      adherenceScore: 80,
    });
    expect(result.breakdown).toEqual({
      liftLoadScore: 60,
      runLoadScore: 50,
      recoveryScore: 75,
      adherenceScore: 80,
    });
  });

  it("passes through an existing nested breakdown unchanged (future-CF compat)", () => {
    const result = normalisePerformanceDoc("2026-05-19", {
      weekKey: "2026-05-19",
      performanceIndex: 72,
      breakdown: {
        liftLoadScore: 11,
        runLoadScore: 12,
        recoveryScore: 13,
        adherenceScore: 14,
      },
      // Flat fields ignored when nested breakdown exists.
      liftLoadScore: 999,
    });
    expect(result.breakdown.liftLoadScore).toBe(11);
    expect(result.breakdown.runLoadScore).toBe(12);
  });

  it("coerces missing / non-numeric flat fields to 0 (partial early-rollup doc)", () => {
    const result = normalisePerformanceDoc("2026-05-19", {
      weekKey: "2026-05-19",
      performanceIndex: 50,
      // Only some sub-scores present (mid-rollup write).
      liftLoadScore: 40,
      recoveryScore: "not-a-number",
      // runLoadScore + adherenceScore missing entirely.
    });
    expect(result.breakdown.liftLoadScore).toBe(40);
    expect(result.breakdown.runLoadScore).toBe(0);
    expect(result.breakdown.recoveryScore).toBe(0);
    expect(result.breakdown.adherenceScore).toBe(0);
  });

  it("falls back to docId when weekKey is missing on the data", () => {
    const result = normalisePerformanceDoc("2026-05-19", {
      performanceIndex: 60,
    });
    expect(result.weekKey).toBe("2026-05-19");
  });

  it("preserves other top-level fields (loadBand, labels, insight, planAdjustments)", () => {
    const result = normalisePerformanceDoc("2026-05-19", {
      weekKey: "2026-05-19",
      performanceIndex: 72,
      liftLoadScore: 50,
      runLoadScore: 50,
      recoveryScore: 80,
      adherenceScore: 80,
      loadBand: "high",
      labels: { loadBand: "high" },
      insight: { title: "Strong week", bullets: ["b1", "b2"] },
    });
    expect(result.loadBand).toBe("high");
    expect(result.labels?.loadBand).toBe("high");
    expect(result.insight?.title).toBe("Strong week");
  });
});
