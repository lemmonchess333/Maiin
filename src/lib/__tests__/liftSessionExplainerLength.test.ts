/**
 * The session purpose line has to fit on ONE line of the session card.
 *
 * The first version of these lines was capped at 90 characters, which is
 * roughly two lines at 393px. Rendered, the sentence wrapped, separated
 * the day name from the meta line, and pushed the Start button down the
 * card — the owner's report was that Train had become "way too wordy".
 * The cap is now 45 and this file walks every reachable branch to hold it,
 * including the worst case: the longest focus label at a three-digit block
 * week with the pace suffix attached.
 *
 * A length assertion also lives in `liftSessionExplainer.test.ts` for the
 * block branch it already enumerates. This file is the exhaustive one — it
 * exists so a new branch, or a longer word in an existing one, fails here
 * rather than at a capture diff weeks later.
 */
import { describe, expect, it } from "vitest";
import {
  liftSessionExplainer,
  MAX_EXPLAINER_CHARS,
} from "../liftSessionExplainer";
import { FOCUS_ORDER } from "@/features/program/trainingBlock";
import type {
  ActiveTrainingBlock,
  BlockDurationWeeks,
  BlockPace,
} from "@/features/program/programTypes";

/** The whole union — a new duration must be added here, not silently skipped. */
const ALL_DURATIONS: BlockDurationWeeks[] = [4, 8, 12];

const today = "2026-09-07";

const block: ActiveTrainingBlock = {
  id: "test",
  owned: true,
  focus: "strength",
  pace: "full",
  durationWeeks: 8,
  startDate: "2026-08-30",
  goalBefore: "general",
  amnestyWeeksLeft: 1,
  weeklyLiftTarget: 4,
  anchorExerciseIds: [],
  why: "",
  createdAt: 1,
  schemaVersion: 1,
};

/** Every line the function can produce, with a label naming its branch. */
function everyLine(): { branch: string; line: string }[] {
  const out: { branch: string; line: string }[] = [];
  const push = (branch: string, line: string | null) => {
    if (line !== null) out.push({ branch, line });
  };

  for (const variant of ["easier_today", "express30", "express45"] as const) {
    push(variant, liftSessionExplainer({ weekNumber: 2 }, today, variant));
  }
  push(
    "deload",
    liftSessionExplainer({ weekNumber: 2, currentPhase: "deload" }, today)
  );

  // Plain cycle: every week of the mesocycle, with and without an
  // all-double progression set (the two suffixes that branch on it).
  for (let weekNumber = 1; weekNumber <= 8; weekNumber += 1) {
    for (const rules of [[], ["double", "double"], ["linear"]] as const) {
      push(
        `cycle w${weekNumber} ${rules.join("+") || "none"}`,
        liftSessionExplainer({ weekNumber }, today, "full", [...rules])
      );
    }
  }

  // Block: every focus × pace × duration. The denominator is the widest
  // part of the counter, so the longest block is the worst case for
  // length; BlockDurationWeeks is a closed union, so this is exhaustive.
  for (const focus of FOCUS_ORDER) {
    for (const pace of ["full", "lighter", "easing"] as BlockPace[]) {
      for (const durationWeeks of ALL_DURATIONS) {
        push(
          `block ${focus}/${pace}/${durationWeeks}w`,
          liftSessionExplainer(
            {
              weekNumber: 2,
              trainingBlock: { ...block, focus, pace, durationWeeks },
            },
            today
          )
        );
      }
    }
  }
  return out;
}

describe("session purpose lines stay on one line", () => {
  it("produces lines from every branch (the walk is not vacuous)", () => {
    const lines = everyLine();
    expect(lines.length).toBeGreaterThan(50);
    expect(new Set(lines.map((l) => l.line)).size).toBeGreaterThan(8);
  });

  it(`no line exceeds ${MAX_EXPLAINER_CHARS} characters`, () => {
    const tooLong = everyLine()
      .filter(({ line }) => line.length > MAX_EXPLAINER_CHARS)
      .map(({ branch, line }) => `${branch}: ${line.length} — "${line}"`);
    expect(tooLong).toEqual([]);
  });

  it("no line carries an em dash", () => {
    // Six new "statement — explanation" strings landed on the two
    // most-visited screens at once. The repeated sentence shape is what
    // read as machine-written; these use the "fact · fact" middot the rest
    // of the app already uses.
    const dashed = everyLine()
      .filter(({ line }) => line.includes("—"))
      .map(({ branch, line }) => `${branch}: "${line}"`);
    expect(dashed).toEqual([]);
  });
});
