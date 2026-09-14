/**
 * Editorial imagery manifest (Social uplift v3) — pins the drop-in
 * contract: every metric resolves to a string URL or to null, so a
 * surface renders either the photo or its designed no-photo fallback
 * and never a broken image; unknown metrics route to the hybrid stem
 * rather than throwing.
 *
 * The assertions are deliberately shape-only, NOT "resolves null". The
 * header said that when no assets were committed; all three
 * `challenge-*` stems have shipped since, so the glob resolves real
 * URLs here and a null-pinning test would have gone red on the commit
 * that added the art.
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
