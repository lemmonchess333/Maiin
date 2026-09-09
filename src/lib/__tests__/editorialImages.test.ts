/**
 * Editorial imagery manifest (Social uplift v3) — pins the drop-in
 * contract: with no licensed assets committed (the current state),
 * every metric resolves null so surfaces render their designed
 * no-photo fallback; unknown metrics route to the hybrid stem rather
 * than throwing.
 */
import { describe, it, expect } from "vitest";
import { challengeEditorialImage } from "../editorialImages";

describe("challengeEditorialImage", () => {
  const METRICS = [
    "total_km",
    "fastest_effort",
    "total_volume",
    "workout_count",
    "hybrid_score",
  ];

  it("returns a string URL or null for every known metric, never throws", () => {
    for (const m of METRICS) {
      const v = challengeEditorialImage(m);
      expect(v === null || typeof v === "string").toBe(true);
    }
  });

  it("routes unknown metrics through the hybrid fallback stem", () => {
    expect(challengeEditorialImage("some_future_metric")).toBe(
      challengeEditorialImage("hybrid_score")
    );
  });

  it("run metrics share one asset; lift metrics share another", () => {
    expect(challengeEditorialImage("total_km")).toBe(
      challengeEditorialImage("fastest_effort")
    );
    expect(challengeEditorialImage("total_volume")).toBe(
      challengeEditorialImage("workout_count")
    );
  });
});
