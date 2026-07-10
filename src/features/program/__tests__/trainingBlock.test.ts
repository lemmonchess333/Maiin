/**
 * Training Blocks (PROGRAM-BLOCK-01) — pure model pins.
 *
 * Locked-decision pins (GsPb1): exactly the 5 presets, 4/8/12
 * durations only, explicit end-of-block outcomes, ≤3 anchors.
 * Date math pins: week counting from startDate, exclusive end,
 * finished detection. Boundary parse guard.
 */
import { describe, it, expect } from "vitest";
import {
  BLOCK_PRESETS,
  BLOCK_DURATIONS,
  blockEndDate,
  blockWeekOf,
  isBlockFinished,
  makeBlockId,
  blockDocPath,
  parseTrainingBlock,
} from "../trainingBlock";

const block = { startDate: "2026-07-06", durationWeeks: 8 as const };

describe("locked decisions (GsPb1)", () => {
  it("ships exactly the five locked presets", () => {
    expect(BLOCK_PRESETS.map((p) => p.value)).toEqual([
      "strength_foundation",
      "muscle_building",
      "consistency_reset",
      "return_to_training",
      "hybrid_support",
    ]);
  });

  it("offers only 4/8/12 week durations", () => {
    expect(BLOCK_DURATIONS).toEqual([4, 8, 12]);
  });
});

describe("block date math", () => {
  it("computes the exclusive end date", () => {
    expect(blockEndDate(block)).toBe("2026-08-31"); // 8 weeks after Jul 6
    expect(blockEndDate({ startDate: "2026-07-06", durationWeeks: 4 })).toBe(
      "2026-08-03"
    );
  });

  it("counts 1-based weeks from the start date", () => {
    expect(blockWeekOf(block, "2026-07-06")).toBe(1);
    expect(blockWeekOf(block, "2026-07-12")).toBe(1);
    expect(blockWeekOf(block, "2026-07-13")).toBe(2);
    expect(blockWeekOf(block, "2026-08-30")).toBe(8);
  });

  it("returns null before the start and after the end", () => {
    expect(blockWeekOf(block, "2026-07-05")).toBeNull();
    expect(blockWeekOf(block, "2026-08-31")).toBeNull();
  });

  it("detects the finished state at the exclusive end", () => {
    expect(isBlockFinished(block, "2026-08-30")).toBe(false);
    expect(isBlockFinished(block, "2026-08-31")).toBe(true);
  });
});

describe("ids and paths", () => {
  it("builds stable readable ids and owner paths", () => {
    expect(makeBlockId("2026-07-06", "strength_foundation")).toBe(
      "2026-07-06-strength_foundation"
    );
    expect(blockDocPath("u1", "2026-07-06-strength_foundation")).toBe(
      "users/u1/trainingBlocks/2026-07-06-strength_foundation"
    );
  });
});

describe("parseTrainingBlock", () => {
  const valid = {
    id: "2026-07-06-strength_foundation",
    preset: "strength_foundation",
    title: "Strength Foundation",
    startDate: "2026-07-06",
    durationWeeks: 8,
    weeklyLiftTarget: 3,
    anchorExerciseIds: ["bench-press", "squat"],
    why: "Stronger for rugby season",
    status: "active",
    createdAt: 1,
  };

  it("round-trips a valid block", () => {
    expect(parseTrainingBlock(valid)).toEqual(valid);
  });

  it("caps anchors at 3 and drops non-strings", () => {
    const parsed = parseTrainingBlock({
      ...valid,
      anchorExerciseIds: ["a", 2, "b", "c", "d"],
    });
    expect(parsed?.anchorExerciseIds).toEqual(["a", "b", "c"]);
  });

  it("keeps only known outcomes", () => {
    expect(
      parseTrainingBlock({ ...valid, status: "completed", outcome: "repeat" })
        ?.outcome
    ).toBe("repeat");
    expect(
      parseTrainingBlock({ ...valid, outcome: "explode" })?.outcome
    ).toBeUndefined();
  });

  it("rejects malformed data", () => {
    expect(parseTrainingBlock(null)).toBeNull();
    expect(parseTrainingBlock({})).toBeNull();
    expect(parseTrainingBlock({ ...valid, durationWeeks: 6 })).toBeNull();
    expect(parseTrainingBlock({ ...valid, preset: "bulk" })).toBeNull();
    expect(parseTrainingBlock({ ...valid, startDate: "6 July" })).toBeNull();
    expect(parseTrainingBlock({ ...valid, status: "paused" })).toBeNull();
  });
});
