import { describe, it, expect } from "vitest";
import { ART_REVIEW_CHECKS, validateArtworkReview } from "../formArtReview";
const asset = (path: string) => ({ path, sha256: "a".repeat(64) });
const expected = {
  exerciseId: "squat",
  version: "v1",
  width: 1024,
  height: 1536,
  reference: asset("reference.webp"),
  cueSha256: "b".repeat(64),
  frames: Array.from({ length: 6 }, (_, i) => asset(`${i + 1}.webp`)),
};
const passing = () => ({
  ...expected,
  decision: "approved",
  reviewer: "reviewer",
  reviewedAt: "2026-09-07T00:00:00Z",
  checks: Object.fromEntries(
    ART_REVIEW_CHECKS.map((key) => [
      key,
      { passed: true, evidence: "Reviewed original stills and playback." },
    ])
  ),
  frames: expected.frames.map((frame) => ({
    ...frame,
    anchors: { heel: { x: 150, y: 1400 }, toe: { x: 260, y: 1400 } },
    invariantDimensions: { plateDiameter: 200, shoeLength: 110 },
  })),
});
describe("artwork release evidence", () => {
  it("accepts a complete review tied to exact assets and cues", () => {
    expect(validateArtworkReview(passing(), expected)).toEqual([]);
  });
  it("rejects missing and malformed evidence", () => {
    for (const value of [null, [], {}, { frames: [null] }])
      expect(validateArtworkReview(value, expected).length).toBeGreaterThan(0);
  });
  it("invalidates approval after a frame, reference, cue or version changes", () => {
    for (const changed of [
      { ...expected, version: "v2" },
      { ...expected, cueSha256: "c".repeat(64) },
      {
        ...expected,
        reference: { ...expected.reference, sha256: "c".repeat(64) },
      },
      {
        ...expected,
        frames: expected.frames.map((frame, i) =>
          i === 2 ? { ...frame, sha256: "c".repeat(64) } : frame
        ),
      },
    ])
      expect(validateArtworkReview(passing(), changed).length).toBeGreaterThan(
        0
      );
  });
  it("catches the observed 23-pixel sole drift and changing plate diameter", () => {
    const review = passing();
    review.frames[4].anchors.heel.y -= 23;
    review.frames[2].invariantDimensions.plateDiameter = 230;
    const errors = validateArtworkReview(review, expected);
    expect(errors.some((error) => error.includes("heel.y"))).toBe(true);
    expect(errors.some((error) => error.includes("plateDiameter"))).toBe(true);
  });
  it("requires every visual check, including both mobile themes", () => {
    for (const key of ART_REVIEW_CHECKS) {
      const review = passing();
      review.checks[key].passed = false;
      expect(validateArtworkReview(review, expected)).toContain(
        `${key}: passing evidence required.`
      );
    }
  });
  it("rejects invalid measured coordinates and dimensions", () => {
    const review = passing();
    review.frames[0].anchors.heel.x = NaN;
    review.frames[2].anchors.toe.x = 1024;
    review.frames[4].invariantDimensions.shoeLength = Infinity;
    expect(
      validateArtworkReview(review, expected).length
    ).toBeGreaterThanOrEqual(3);
  });
});
