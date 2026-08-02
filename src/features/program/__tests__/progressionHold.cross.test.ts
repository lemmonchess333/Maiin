import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { blockWeekOf } from "../trainingBlock";
import { isProgressionHeld, EASING_HOLD_WEEKS } from "../represcribe";
import type { ActiveTrainingBlock } from "../programTypes";

/**
 * Parity guard (Blk2 / P6): the "easing back in" progression hold is now
 * double-sited. The client decides it in `useProgram.logExercise`
 * (`isProgressionHeld` over `blockWeekOf`); the server decides it again in the
 * `logExercise` command reducer, via `functions/lib/progressionHold.js`.
 *
 * These copies MUST agree, and the failure mode if they don't is silent: both
 * branches write a plausible-looking exercise, so a returning lifter simply
 * progresses through the window designed to hold them and nothing surfaces it.
 * That is the tested-copy-vs-running-copy rule's exact shape, and this is the
 * sanctioned mitigation.
 *
 * WHAT IS DELIBERATELY NOT MIRRORED: the client passes its LOCAL date in the
 * command (`today`), because programState carries no timezone and the server
 * cannot derive the user's calendar day. The server mirror parses that date as
 * UTC while the client parses as local — which is safe here, and the boundary
 * cases below are the proof rather than the claim. `blockWeekOf` is a
 * DIFFERENCE between two plain YYYY-MM-DD strings, so a consistent parse on
 * either side yields an identical week number in any zone.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/progressionHold") as {
  EASING_HOLD_WEEKS: number;
  blockWeekOf: (
    block: { startDate: string; durationWeeks: number } | undefined,
    today: string
  ) => number | null;
  isProgressionHeld: (
    block: { pace?: string } | undefined,
    blockWeek: number | null
  ) => boolean;
  holdsProgression: (
    block:
      | { pace?: string; startDate: string; durationWeeks: number }
      | undefined,
    today: string
  ) => boolean;
};

const block = (
  pace: string,
  startDate = "2026-03-02",
  durationWeeks = 8
): ActiveTrainingBlock =>
  ({ pace, startDate, durationWeeks }) as unknown as ActiveTrainingBlock;

/* Every day of the first three weeks plus the boundaries that matter: the day
 * before the block starts, each week rollover, the final day, and the day
 * after it ends. Week rollovers are where an off-by-one hides — week 2 → 3 is
 * precisely where the hold stops. */
const DAYS = [
  "2026-03-01", // day before start → null
  "2026-03-02", // week 1, first day
  "2026-03-08", // week 1, last day
  "2026-03-09", // week 2, first day
  "2026-03-15", // week 2, last day  → last held day
  "2026-03-16", // week 3, first day → hold ends
  "2026-04-26", // week 8, last day
  "2026-04-27", // past the end → null
];

describe("progression hold — client vs functions mirror", () => {
  it("EASING_HOLD_WEEKS agrees", () => {
    expect(cf.EASING_HOLD_WEEKS).toBe(EASING_HOLD_WEEKS);
  });

  it("blockWeekOf agrees on every boundary day", () => {
    const b = block("easing");
    for (const today of DAYS) {
      expect(cf.blockWeekOf(b, today), `blockWeekOf @ ${today}`).toBe(
        blockWeekOf(b, today)
      );
    }
  });

  it("isProgressionHeld agrees across paces and weeks", () => {
    for (const pace of ["easing", "standard", "aggressive", "nonsense"]) {
      const b = block(pace);
      for (const week of [null, 1, 2, 3, 8, 99]) {
        expect(
          cf.isProgressionHeld(b, week),
          `isProgressionHeld(${pace}, ${week})`
        ).toBe(isProgressionHeld(b, week));
      }
    }
  });

  it("the composed decision agrees — this is what the reducer calls", () => {
    for (const pace of ["easing", "standard"]) {
      const b = block(pace);
      for (const today of DAYS) {
        expect(cf.holdsProgression(b, today), `${pace} @ ${today}`).toBe(
          isProgressionHeld(b, blockWeekOf(b, today))
        );
      }
    }
  });

  it("an absent block holds nothing on either side", () => {
    expect(cf.holdsProgression(undefined, "2026-03-09")).toBe(false);
    expect(
      isProgressionHeld(undefined, blockWeekOf(block("easing"), "x"))
    ).toBe(false);
  });

  it("only an easing block holds — the pace check is load-bearing", () => {
    // Guards the mirror against being simplified to "is there a block?".
    expect(cf.holdsProgression(block("standard"), "2026-03-09")).toBe(false);
    expect(cf.holdsProgression(block("easing"), "2026-03-09")).toBe(true);
  });

  it("a malformed date is not a hold", () => {
    // The client gets a real date string from localDateString(); the server
    // gets whatever the wire carried. The validator bounds it, but the mirror
    // must not fall open if it ever sees rubbish.
    for (const bad of ["", "not-a-date", "2026-3", "2026-13-40"]) {
      expect(cf.holdsProgression(block("easing"), bad), bad).toBe(false);
    }
  });
});
