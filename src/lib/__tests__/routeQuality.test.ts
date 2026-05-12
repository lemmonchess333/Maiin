/**
 * PR H — route-quality scoring tests.
 *
 * Pins the confidence thresholds + the inter-fix-gap counter so
 * future tuning is deliberate.
 */
import { describe, it, expect } from "vitest";
import { computeRouteQuality, describeRouteConfidence } from "../routeQuality";

describe("computeRouteQuality — good", () => {
  it("a clean 30-minute run is 'good'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(60).fill(8),
      rejectedFixCount: 0,
      backgroundGapMs: 0,
      fixTimestamps: Array.from({ length: 60 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("good");
    expect(q.gapCount).toBe(0);
    expect(q.medianAccuracyM).toBe(8);
  });

  it("a 30s background gap is still 'good'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(60).fill(8),
      rejectedFixCount: 0,
      backgroundGapMs: 30_000,
      fixTimestamps: Array.from({ length: 60 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("good");
  });
});

describe("computeRouteQuality — patchy", () => {
  it("a 90s background gap is 'patchy'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(60).fill(8),
      rejectedFixCount: 0,
      backgroundGapMs: 90_000,
      fixTimestamps: Array.from({ length: 60 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("patchy");
  });

  it("8 rejected fixes is 'patchy'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(40).fill(8),
      rejectedFixCount: 8,
      backgroundGapMs: 0,
      fixTimestamps: Array.from({ length: 40 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("patchy");
  });

  it("two inter-fix gaps ≥ 8s is 'patchy'", () => {
    // 30 fixes at 5s, with two gaps of 10s inserted
    const timestamps = [];
    let t = 0;
    for (let i = 0; i < 30; i++) {
      timestamps.push(t);
      t += i === 10 || i === 20 ? 10_000 : 5000;
    }
    const q = computeRouteQuality({
      acceptedAccuracies: Array(30).fill(8),
      rejectedFixCount: 0,
      backgroundGapMs: 0,
      fixTimestamps: timestamps,
    });
    expect(q.gapCount).toBe(2);
    expect(q.confidence).toBe("patchy");
  });

  it("median accuracy > 25m is 'patchy'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(40).fill(30),
      rejectedFixCount: 0,
      backgroundGapMs: 0,
      fixTimestamps: Array.from({ length: 40 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("patchy");
    expect(q.medianAccuracyM).toBe(30);
  });
});

describe("computeRouteQuality — poor", () => {
  it("a 4-minute background gap is 'poor'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(60).fill(8),
      rejectedFixCount: 0,
      backgroundGapMs: 240_000,
      fixTimestamps: Array.from({ length: 60 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("poor");
  });

  it("25 rejected fixes is 'poor'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(40).fill(8),
      rejectedFixCount: 25,
      backgroundGapMs: 0,
      fixTimestamps: Array.from({ length: 40 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("poor");
  });

  it("fewer than 5 accepted fixes is 'poor'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: [10, 10],
      rejectedFixCount: 0,
      backgroundGapMs: 0,
      fixTimestamps: [0, 5000],
    });
    expect(q.confidence).toBe("poor");
  });

  it("median accuracy > 50m is 'poor'", () => {
    const q = computeRouteQuality({
      acceptedAccuracies: Array(40).fill(100),
      rejectedFixCount: 0,
      backgroundGapMs: 0,
      fixTimestamps: Array.from({ length: 40 }, (_, i) => i * 5000),
    });
    expect(q.confidence).toBe("poor");
  });
});

describe("describeRouteConfidence", () => {
  it("returns honest user-facing labels", () => {
    expect(describeRouteConfidence("good")).toContain("solid");
    expect(describeRouteConfidence("patchy")).toContain("gaps");
    expect(describeRouteConfidence("poor")).toContain("inaccurate");
  });
});
