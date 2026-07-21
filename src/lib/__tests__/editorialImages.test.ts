/**
 * Editorial imagery manifest (Social uplift v3) — pins the drop-in
 * contract: with no licensed assets committed (the current state),
 * every metric resolves null so surfaces render their designed
 * no-photo fallback; unknown metrics route to the hybrid stem rather
 * than throwing.
 */
import { describe, it, expect } from "vitest";
import {
  challengeEditorialImage,
  mealPhotoStem,
  mealPhotoImage,
} from "../editorialImages";

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

describe("mealPhotoStem — time-of-day windows", () => {
  it("buckets by the same thresholds as meal slots (<11, <17, else)", () => {
    expect(mealPhotoStem(0)).toBe("food-breakfast");
    expect(mealPhotoStem(8)).toBe("food-breakfast");
    expect(mealPhotoStem(10)).toBe("food-breakfast");
    expect(mealPhotoStem(11)).toBe("food-lunch");
    expect(mealPhotoStem(13)).toBe("food-lunch");
    expect(mealPhotoStem(16)).toBe("food-lunch");
    expect(mealPhotoStem(17)).toBe("food-dinner");
    expect(mealPhotoStem(23)).toBe("food-dinner");
  });

  it("resolves to null or a URL, never throws (drop-in contract)", () => {
    for (const h of [8, 13, 20]) {
      const v = mealPhotoImage(h);
      expect(v === null || typeof v === "string").toBe(true);
    }
  });
});
