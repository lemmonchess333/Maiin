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
  presetProgrammeGoal,
} from "../trainingBlock";

const block = { startDate: "2026-07-06", durationWeeks: 8 as const };

describe("presetProgrammeGoal (Blk1 hand-off mapping)", () => {
  it("maps the three goal-flavoured presets to a truthful PrimaryGoal", () => {
    expect(presetProgrammeGoal("strength_foundation")).toBe("strength");
    expect(presetProgrammeGoal("muscle_building")).toBe("hypertrophy");
    expect(presetProgrammeGoal("hybrid_support")).toBe("running");
  });

  it("offers NOTHING for the habit presets — one-tap create stays", () => {
    expect(presetProgrammeGoal("consistency_reset")).toBeNull();
    expect(presetProgrammeGoal("return_to_training")).toBeNull();
  });
});

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
    expect(makeBlockId("2026-07-06", 1751760000000)).toBe(
      "2026-07-06-1751760000000"
    );
    expect(blockDocPath("u1", "2026-07-06-1751760000000")).toBe(
      "users/u1/trainingBlocks/2026-07-06-1751760000000"
    );
  });

  // The id was `${startDate}-${preset}`, and the archive write is a
  // no-merge setDoc — so ending a block and starting another of the same
  // kind on the same calendar day silently overwrote the row just
  // completed. Live data loss, and Blk2's one-tap "change focus" makes it
  // easy to hit.
  it("distinguishes two blocks started on the same day", () => {
    expect(makeBlockId("2026-07-06", 1)).not.toBe(makeBlockId("2026-07-06", 2));
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

  /* ─── Blk2 · relax, never tighten ──────────────────────────────
     This parse is all-or-nothing and useTrainingBlock filters the nulls
     out SILENTLY, so a field made required here deletes every existing
     block from the user's history with nothing logged. Same for the
     return literal: a field it doesn't name is stripped on read and then
     destroyed by the next full-document write. ── */

  it("still parses a pre-Blk2 block, preset and all", () => {
    // `valid` above IS a pre-Blk2 doc — this pins that retiring the preset
    // vocabulary doesn't strand the blocks written under it.
    const parsed = parseTrainingBlock(valid);
    expect(parsed).not.toBeNull();
    expect(parsed?.preset).toBe("strength_foundation");
  });

  it("parses a Blk2 block that has focus/pace and no preset", () => {
    const { preset: _preset, ...noPreset } = valid;
    const parsed = parseTrainingBlock({
      ...noPreset,
      focus: "strength",
      pace: "easing",
      goalBefore: "hypertrophy",
      owned: true,
      endedEarly: true,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.preset).toBeUndefined();
    // Carried explicitly, or the next write destroys them.
    expect(parsed?.focus).toBe("strength");
    expect(parsed?.pace).toBe("easing");
    expect(parsed?.goalBefore).toBe("hypertrophy");
    expect(parsed?.owned).toBe(true);
    expect(parsed?.endedEarly).toBe(true);
  });

  it("drops Blk2 fields with values outside their vocabulary", () => {
    const parsed = parseTrainingBlock({
      ...valid,
      focus: "powerlifting",
      pace: "sprint",
      owned: "yes",
    });
    expect(parsed?.focus).toBeUndefined();
    expect(parsed?.pace).toBeUndefined();
    expect(parsed?.owned).toBeUndefined();
  });

  it("rejects malformed data", () => {
    expect(parseTrainingBlock(null)).toBeNull();
    expect(parseTrainingBlock({})).toBeNull();
    expect(parseTrainingBlock({ ...valid, durationWeeks: 6 })).toBeNull();
    // Absent is legal; PRESENT-and-unrecognised is still malformed.
    expect(parseTrainingBlock({ ...valid, preset: "bulk" })).toBeNull();
    expect(parseTrainingBlock({ ...valid, startDate: "6 July" })).toBeNull();
    expect(parseTrainingBlock({ ...valid, status: "paused" })).toBeNull();
  });
});
