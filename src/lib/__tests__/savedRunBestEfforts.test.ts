/**
 * A saved run's best efforts, as the reader hands them on: a new run's
 * post compares its own fastest 1K, 5K and 10K with them (Soc15). Read
 * from the history the finish screen already holds, so no new read.
 */
import { describe, expect, it } from "vitest";
import { parseSavedRun } from "../savedRuns";

const completedAt = new Date();

describe("parseSavedRun — best efforts", () => {
  it("reads each effort's distance and time, as the run saved them", () => {
    const run = parseSavedRun("r1", {
      completedAt,
      distance: 10400,
      bestEfforts: [
        { distance: 1000, time: 262.4, label: "1K" },
        { distance: 5000, time: 1420, label: "5K" },
      ],
    });
    expect(run?.bestEfforts).toEqual([
      { distance: 1000, time: 262.4 },
      { distance: 5000, time: 1420 },
    ]);
  });

  it("leaves out an effort it can't read, and has none for a run that kept none", () => {
    const mixed = parseSavedRun("r2", {
      completedAt,
      bestEfforts: [
        { distance: 1000, time: 0 },
        { distance: "5K", time: 1400 },
        null,
        { distance: 10000, time: 2900 },
      ],
    });
    expect(mixed?.bestEfforts).toEqual([{ distance: 10000, time: 2900 }]);
    for (const bestEfforts of [undefined, [], "1K"]) {
      const run = parseSavedRun("r3", { completedAt, bestEfforts });
      expect(run).not.toHaveProperty("bestEfforts");
    }
  });
});
