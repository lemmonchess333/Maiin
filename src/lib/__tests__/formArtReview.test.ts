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

  const jumping = () => ({
    ...passing(),
    contactPhases: [
      {
        name: "Planted hands",
        frames: [1, 2, 3, 4, 5],
        referenceFrame: 2,
        anchorNames: ["heel", "toe"],
        dimensionNames: ["plateDiameter", "shoeLength"],
        evidence: "Contacts remain fixed during these floor beats.",
      },
    ],
    airborneFrames: [
      {
        frame: 6,
        takeoffFrame: 5,
        landingFrame: 1,
        evidence: "Both feet clear the same floor; scale and landing reviewed.",
      },
    ],
  });

  it("checks grounded phases without falsely fixing an airborne body to the floor", () => {
    const review = jumping();
    review.frames[5].anchors.heel.y = 800;
    review.frames[5].anchors.toe.y = 800;
    expect(validateArtworkReview(review, expected)).toEqual([]);
    review.frames[3].anchors.heel.y -= 5;
    expect(validateArtworkReview(review, expected)).toContain(
      "Frame 4: fixed anchor heel.y drift."
    );
    review.frames[2].invariantDimensions.shoeLength = 130;
    expect(validateArtworkReview(review, expected)).toContain(
      "Frame 3: invariant shoeLength drift."
    );
  });

  it("does not let phases omit frames or disguise grounded drift as flight", () => {
    const review = jumping();
    review.contactPhases[0].frames = [1, 2, 3, 4];
    const errors = validateArtworkReview(review, expected);
    expect(errors).toContain("Frame 5: no contact-phase or airborne evidence.");
    expect(errors.some((e) => e.includes("measured takeoff"))).toBe(true);
    const overlap = jumping();
    overlap.airborneFrames[0].frame = 3;
    expect(
      validateArtworkReview(overlap, expected).some((e) =>
        e.includes("unique flight")
      )
    ).toBe(true);
  });

  it("rejects empty phases, singleton phases and invalid frame references", () => {
    const base = jumping();
    for (const change of [
      { frames: [2] },
      { frames: [1, 1] },
      { frames: [0, 2] },
      { frames: [1, 7] },
      { frames: [1, 2.5] },
      { referenceFrame: 6 },
      { anchorNames: [] },
      { anchorNames: ["heel", "heel"] },
      { dimensionNames: ["shoeLength"] },
      { evidence: "" },
    ]) {
      expect(
        validateArtworkReview(
          { ...base, contactPhases: [{ ...base.contactPhases[0], ...change }] },
          expected
        ).length
      ).toBeGreaterThan(0);
    }
    expect(
      validateArtworkReview({ ...base, contactPhases: [] }, expected).length
    ).toBeGreaterThan(0);
    expect(
      validateArtworkReview({ ...base, airborneFrames: undefined }, expected)
        .length
    ).toBeGreaterThan(0);
  });

  it("rejects invented measurement names, invalid values and missing flight evidence", () => {
    const review = jumping();
    review.contactPhases[0].anchorNames = ["heel", "invented"];
    expect(validateArtworkReview(review, expected).length).toBeGreaterThan(0);
    const bad = jumping();
    bad.frames[1].anchors.heel.x = NaN;
    expect(validateArtworkReview(bad, expected).length).toBeGreaterThan(0);
    const flight = jumping();
    flight.airborneFrames[0].evidence = "";
    expect(
      validateArtworkReview(flight, expected).some((e) =>
        e.includes("unique flight")
      )
    ).toBe(true);
  });
});
