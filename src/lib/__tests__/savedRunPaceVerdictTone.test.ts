/**
 * A saved run's pace verdict tone, as the reader hands it to the easier-week
 * nudge: the summary's five tones, "heat" among them for a run started on a
 * hot day and read by feel (Pgm8 (E8)), and nothing for anything else.
 */
import { describe, expect, it } from "vitest";
import { parseSavedRun } from "../savedRuns";

const completedAt = new Date();

describe("parseSavedRun — pace verdict tone", () => {
  it("reads each tone the summary saves, the hot day's among them", () => {
    for (const tone of ["on", "fast", "easy-too-fast", "slow", "heat"]) {
      expect(
        parseSavedRun("r1", { completedAt, paceVerdictTone: tone })
          ?.paceVerdictTone
      ).toBe(tone);
    }
  });

  it("reads no tone from anything else", () => {
    for (const tone of [undefined, null, "hot", "", 3]) {
      expect(
        parseSavedRun("r2", { completedAt, paceVerdictTone: tone })
          ?.paceVerdictTone
      ).toBeNull();
    }
  });
});
