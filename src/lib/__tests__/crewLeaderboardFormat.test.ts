import { describe, it, expect } from "vitest";
import { formatScore, formatTotalForMetric } from "../crewLeaderboardFormat";

/* These two helpers drive the per-row leaderboard string and the
 * "This week" stat band on the Crew page. The band was added in PR E
 * and is the first surface where the metric total is rendered in
 * value/unit pairs (numbers in JetBrains Mono, units in sans), so the
 * shape contract — `{label, value, unit}` — needs to stay stable. */

const make = (uid: string, score: number) => ({
  uid,
  rank: 1,
  displayName: "Athlete",
  score,
});

describe("formatScore", () => {
  it("renders workout_count with session/sessions agreement", () => {
    expect(formatScore("workout_count", make("u", 1))).toBe("1 session");
    expect(formatScore("workout_count", make("u", 4))).toBe("4 sessions");
  });

  it("renders total_volume in kg with thousands separators", () => {
    expect(formatScore("total_volume", make("u", 12540))).toBe("12,540 kg");
    expect(formatScore("total_volume", make("u", 100))).toBe("100 kg");
  });

  it("renders total_km with one decimal place", () => {
    expect(formatScore("total_km", make("u", 5))).toBe("5.0 km");
    expect(formatScore("total_km", make("u", 5.236))).toBe("5.2 km");
  });

  it("falls back to a 'pts' suffix for hybrid_score and unknown metrics", () => {
    expect(formatScore("hybrid_score", make("u", 1234))).toBe("1,234 pts");
    expect(formatScore("anything_else", make("u", 50))).toBe("50 pts");
  });
});

describe("formatTotalForMetric", () => {
  /* The shape is consumed by the stat band, which renders numbers in
     JetBrains Mono and the unit in Plus Jakarta. Tests pin the value
     vs unit split per metric so a future refactor can't accidentally
     fold the unit back into the value string. */

  it("workout_count: integer value, no unit", () => {
    const r = formatTotalForMetric("workout_count", 7);
    expect(r.label).toBe("Sessions logged");
    expect(r.value).toBe("7");
    expect(r.unit).toBe("");
  });

  it("total_volume: rounded value with thousands separator, kg unit", () => {
    const r = formatTotalForMetric("total_volume", 12540.7);
    expect(r.label).toBe("Volume lifted");
    expect(r.value).toBe("12,541");
    expect(r.unit).toBe("kg");
  });

  it("total_km: one-decimal value, km unit", () => {
    const r = formatTotalForMetric("total_km", 5);
    expect(r).toEqual({ label: "Distance run", value: "5.0", unit: "km" });
  });

  it("hybrid_score: rounded thousands-separator value, pts unit", () => {
    const r = formatTotalForMetric("hybrid_score", 8430.4);
    expect(r).toEqual({ label: "Hybrid score", value: "8,430", unit: "pts" });
  });

  it("unknown metric: falls through to the hybrid_score format", () => {
    const r = formatTotalForMetric("brand_new_metric", 100);
    expect(r.unit).toBe("pts");
    expect(r.value).toBe("100");
  });

  it("zero total still produces a renderable shape (empty-state path)", () => {
    const r = formatTotalForMetric("total_km", 0);
    expect(r.value).toBe("0.0");
    expect(r.unit).toBe("km");
  });
});
