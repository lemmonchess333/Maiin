/**
 * Block review view model (PROGRAM-BLOCK-01) — pins.
 *
 *   - window filtering (start inclusive, exclusive end)
 *   - per-week bucketing and consistency (capped at 1)
 *   - anchor first-half vs second-half best-set delta; anchors with
 *     no block data are omitted
 *   - thin data: empty block → calm verdict, never an error
 *   - no bodyweight anywhere in the model (locked: weight is not a
 *     block metric)
 */
import { describe, it, expect } from "vitest";
import { buildBlockReview } from "../blockReviewViewModel";
import type { ReviewWorkoutDoc } from "../blockReviewViewModel";
import type { TrainingBlock } from "../trainingBlock";

const block: TrainingBlock = {
  id: "2026-07-06-strength_foundation",
  preset: "strength_foundation",
  title: "Strength Foundation",
  startDate: "2026-07-06",
  durationWeeks: 4,
  weeklyLiftTarget: 3,
  anchorExerciseIds: ["bench-press", "squat"],
  why: "",
  status: "active",
  createdAt: 1,
};

function lift(date: string, weightKg = 60): ReviewWorkoutDoc {
  return {
    date,
    exercises: [
      {
        exerciseId: "bench-press",
        exerciseName: "Bench Press",
        sets: [{ reps: 5, weightKg }],
      },
    ],
  };
}

describe("buildBlockReview", () => {
  it("filters to the block window (inclusive start, exclusive end)", () => {
    const review = buildBlockReview(block, [
      lift("2026-07-05"), // before
      lift("2026-07-06"), // week 1
      lift("2026-08-02"), // week 4 (last day)
      lift("2026-08-03"), // exclusive end — out
    ]);
    expect(review.completedLifts).toBe(2);
    expect(review.weeklyCounts).toEqual([1, 0, 0, 1]);
  });

  it("computes consistency against target, capped at 1", () => {
    const review = buildBlockReview(block, [
      lift("2026-07-06"),
      lift("2026-07-07"),
      lift("2026-07-08"),
    ]);
    expect(review.plannedLifts).toBe(12);
    expect(review.consistency).toBeCloseTo(3 / 12);

    const overachiever = buildBlockReview(
      { ...block, weeklyLiftTarget: 1, durationWeeks: 4 },
      [
        "2026-07-06",
        "2026-07-07",
        "2026-07-13",
        "2026-07-20",
        "2026-07-27",
      ].map((d) => lift(d))
    );
    expect(overachiever.consistency).toBe(1);
  });

  it("reports anchor first-half vs second-half best-set delta", () => {
    const review = buildBlockReview(block, [
      lift("2026-07-06", 60), // week 1 (first half)
      lift("2026-07-14", 62.5), // week 2 (first half, mid=2)
      lift("2026-07-21", 65), // week 3 (second half)
      lift("2026-08-01", 67.5), // week 4
    ]);
    expect(review.anchors).toHaveLength(1);
    expect(review.anchors[0]).toMatchObject({
      exerciseId: "bench-press",
      exerciseName: "Bench Press",
      startBestKg: 62.5,
      endBestKg: 67.5,
      deltaKg: 5,
    });
  });

  it("omits anchors with no block data (squat never trained)", () => {
    const review = buildBlockReview(block, [lift("2026-07-06")]);
    expect(review.anchors.map((a) => a.exerciseId)).toEqual(["bench-press"]);
  });

  it("half-only anchor data yields null delta, not a fake number", () => {
    const review = buildBlockReview(block, [lift("2026-07-06", 60)]);
    expect(review.anchors[0].startBestKg).toBe(60);
    expect(review.anchors[0].endBestKg).toBeNull();
    expect(review.anchors[0].deltaKg).toBeNull();
  });

  it("an empty block gets a calm verdict, never an error", () => {
    const review = buildBlockReview(block, []);
    expect(review.isEmpty).toBe(true);
    expect(review.consistency).toBe(0);
    expect(review.verdict).toMatch(/quiet block/i);
    expect(review.weeklyCounts).toEqual([0, 0, 0, 0]);
  });

  it("verdicts scale with consistency and never shame", () => {
    const high = buildBlockReview(
      { ...block, weeklyLiftTarget: 1 },
      ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"].map((d) =>
        lift(d)
      )
    );
    expect(high.verdict).toMatch(/showed up/i);
    const low = buildBlockReview(block, [lift("2026-07-06")]);
    expect(low.verdict).not.toMatch(/fail|behind|only|should/i);
  });

  it("never surfaces bodyweight — weight is not a block metric", () => {
    const review = buildBlockReview(block, [lift("2026-07-06")]);
    expect(JSON.stringify(review)).not.toMatch(/bodyweight|weightLoss/i);
  });
});
