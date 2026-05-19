/**
 * performanceInsights — P2b contract tests.
 *
 * Pins:
 *   - Score-band boundaries (39/40, 69/70 inclusive)
 *   - Priority ordering of special cases (baseline → deload →
 *     decline → lowest-sub-score)
 *   - Determinism: same (uid + weekKey) returns identical insight
 *     across calls
 *   - Lowest-sub-score wins; tie-breaking is load → recovery →
 *     adherence
 *   - Tone guard: no exclamation marks (calm voice rule)
 */
import { describe, it, expect } from "vitest";
import { buildPerformanceInsight, scoreBand } from "../performanceInsights";

describe("scoreBand — band boundaries", () => {
  it("0-39 is low (boundary)", () => {
    expect(scoreBand(0)).toBe("low");
    expect(scoreBand(39)).toBe("low");
  });

  it("40-69 is medium (boundary)", () => {
    expect(scoreBand(40)).toBe("medium");
    expect(scoreBand(69)).toBe("medium");
  });

  it("70-100 is high (boundary)", () => {
    expect(scoreBand(70)).toBe("high");
    expect(scoreBand(100)).toBe("high");
  });
});

describe("buildPerformanceInsight — priority order", () => {
  it("first 3 weeks return baseline copy regardless of scores", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 20,
      recoveryScore: 20,
      adherenceScore: 20,
      weeksAvailable: 3,
      delta: null,
    });
    expect(result.source).toBe("baseline");
  });

  it("deload loadBand wins over a sharp PI decline (deload-before-decline)", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 50,
      recoveryScore: 80,
      adherenceScore: 75,
      weeksAvailable: 8,
      delta: -25,
      loadBand: "deload",
    });
    expect(result.source).toBe("deload");
  });

  it("delta < -10 triggers decline insight when not in deload or baseline", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 75,
      recoveryScore: 75,
      adherenceScore: 75,
      weeksAvailable: 8,
      delta: -15,
    });
    expect(result.source).toBe("decline");
  });

  it("delta of -10 exactly does NOT trigger decline (strict less-than)", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 75,
      recoveryScore: 75,
      adherenceScore: 75,
      weeksAvailable: 8,
      delta: -10,
    });
    expect(result.source).not.toBe("decline");
  });

  it("falls through to lowest-sub-score insight when no special case applies", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 80,
      recoveryScore: 30,
      adherenceScore: 75,
      weeksAvailable: 8,
      delta: 5,
    });
    expect(result.source).toBe("recovery");
  });
});

describe("buildPerformanceInsight — lowest-sub-score selection", () => {
  it("picks the lowest-scoring sub-score's template", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 30, // lowest
      recoveryScore: 70,
      adherenceScore: 90,
      weeksAvailable: 8,
      delta: 0,
    });
    expect(result.source).toBe("load");
  });

  it("tie-breaks lowest in order load → recovery → adherence", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 50,
      recoveryScore: 50,
      adherenceScore: 50,
      weeksAvailable: 8,
      delta: 0,
    });
    // All tied at 50 (medium) — load wins.
    expect(result.source).toBe("load");
  });

  it("uses the band of the lowest sub-score, not the others", () => {
    const result = buildPerformanceInsight({
      uid: "u-1",
      weekKey: "2026-05-10",
      loadScore: 25, // low
      recoveryScore: 95,
      adherenceScore: 95,
      weeksAvailable: 8,
      delta: 0,
    });
    // Headline should be the LOAD-LOW template — content varies by hash
    // but source pins the band.
    expect(result.source).toBe("load");
    // All low templates open with one of the documented headlines.
    expect(["Load is light", "Light week", "Quiet week"]).toContain(result.headline);
  });
});

describe("buildPerformanceInsight — determinism", () => {
  it("same (uid, weekKey, inputs) returns the same variant on repeat calls", () => {
    const input = {
      uid: "u-deterministic",
      weekKey: "2026-05-10",
      loadScore: 30,
      recoveryScore: 70,
      adherenceScore: 80,
      weeksAvailable: 8,
      delta: 5,
    };
    const a = buildPerformanceInsight(input);
    const b = buildPerformanceInsight(input);
    expect(a.headline).toBe(b.headline);
    expect(a.body).toBe(b.body);
  });

  it("different weekKey produces a potentially-different variant (rotation)", () => {
    // Generate a handful of weeks; collect the distinct headlines.
    // With 3 variants per band a hash hitting different remainders
    // for different weeks should produce at least 2 distinct headlines
    // across 6 weeks of similar input.
    const inputs = ["2026-04-05", "2026-04-12", "2026-04-19", "2026-04-26", "2026-05-03", "2026-05-10"];
    const headlines = new Set(
      inputs.map((weekKey) =>
        buildPerformanceInsight({
          uid: "u-rotate",
          weekKey,
          loadScore: 30,
          recoveryScore: 70,
          adherenceScore: 80,
          weeksAvailable: 8,
          delta: 5,
        }).headline,
      ),
    );
    expect(headlines.size).toBeGreaterThan(1);
  });
});

describe("buildPerformanceInsight — tone guards", () => {
  it("no template body uses exclamation marks (calm voice)", () => {
    // Cover every priority path + band combo.
    const scenarios = [
      { weeksAvailable: 2 }, // baseline
      { weeksAvailable: 8, loadBand: "deload" },
      { weeksAvailable: 8, delta: -20 },
      { weeksAvailable: 8, loadScore: 20, recoveryScore: 70, adherenceScore: 70 },
      { weeksAvailable: 8, loadScore: 70, recoveryScore: 20, adherenceScore: 70 },
      { weeksAvailable: 8, loadScore: 70, recoveryScore: 70, adherenceScore: 20 },
      { weeksAvailable: 8, loadScore: 80, recoveryScore: 80, adherenceScore: 80 },
    ];
    for (const s of scenarios) {
      const result = buildPerformanceInsight({
        uid: "u-tone",
        weekKey: "2026-05-10",
        loadScore: 50,
        recoveryScore: 50,
        adherenceScore: 50,
        delta: null,
        ...s,
      });
      expect(result.body).not.toMatch(/!/);
      expect(result.headline).not.toMatch(/!/);
    }
  });
});
