import { describe, expect, it } from "vitest";
import {
  fastestEfforts,
  fastestStretch,
  runEffortSeconds,
  SPLIT_MIN_SECONDS,
} from "../runEfforts";

/**
 * A run's time over 1, 5 or 10 km: the one figure the finish screen
 * celebrates, Bests lists and the Running page compares (App1 Q15).
 */

describe("fastestStretch", () => {
  it("finds the quickest whole kilometres in a row", () => {
    expect(fastestStretch([300, 290, 280, 295, 310], 1)).toBe(280);
    expect(fastestStretch([300, 290, 280, 295, 310], 2)).toBe(570);
    expect(fastestStretch([300, 290, 280, 295, 310], 5)).toBe(1475);
  });

  it("needs the run to have gone that far", () => {
    expect(fastestStretch([300, 290, 280, 295], 5)).toBeNull();
  });

  it("skips a stretch holding a kilometre no one ran", () => {
    // A GPS jump: a 30-second kilometre.
    const splits = [300, 30, 280, 295, 310, 305, 300];
    expect(fastestStretch(splits, 1)).toBe(280);
    // 280 + 295 + 310 + 305 + 300: the only five in a row without it.
    expect(fastestStretch(splits, 5)).toBe(1490);
    expect(fastestStretch([SPLIT_MIN_SECONDS - 1], 1)).toBeNull();
  });
});

describe("runEffortSeconds", () => {
  const splits = [300, 290, 280, 295, 310, 305];

  it("is the run's saved best effort at the distance", () => {
    expect(
      runEffortSeconds(
        {
          bestEfforts: [{ distance: 5000, time: 1440 }],
          kmSplitSeconds: splits,
        },
        5000
      )
    ).toBe(1440);
  });

  it("falls back to the splits for a distance it saved no effort at", () => {
    // Saved before best efforts were kept.
    expect(runEffortSeconds({ kmSplitSeconds: splits }, 5000)).toBe(1475);
    expect(
      runEffortSeconds(
        {
          bestEfforts: [{ distance: 1000, time: 270 }],
          kmSplitSeconds: splits,
        },
        5000
      )
    ).toBe(1475);
  });

  it("is nothing for a run that timed none", () => {
    // A treadmill or manual run keeps neither.
    expect(runEffortSeconds({}, 1000)).toBeNull();
    expect(runEffortSeconds({ kmSplitSeconds: [300, 300] }, 5000)).toBeNull();
    expect(
      runEffortSeconds({ bestEfforts: [{ distance: 5000, time: 0 }] }, 5000)
    ).toBeNull();
  });
});

describe("fastestEfforts", () => {
  it("names the run holding each distance's fastest time, in order", () => {
    const old = { id: "old", kmSplitSeconds: [300, 300, 300, 300, 300] };
    const fresh = {
      id: "fresh",
      bestEfforts: [
        { distance: 1000, time: 270 },
        { distance: 5000, time: 1520 },
      ],
    };
    expect(fastestEfforts([old, fresh], [1000, 5000, 10000])).toEqual([
      { meters: 1000, seconds: 270, run: fresh },
      { meters: 5000, seconds: 1500, run: old },
    ]);
  });

  it("keeps a tie with the run that comes first", () => {
    const first = { id: "first", bestEfforts: [{ distance: 1000, time: 280 }] };
    const second = {
      id: "second",
      bestEfforts: [{ distance: 1000, time: 280 }],
    };
    expect(fastestEfforts([first, second], [1000])[0].run).toBe(first);
  });
});
