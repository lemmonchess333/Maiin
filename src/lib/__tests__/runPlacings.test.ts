import { describe, expect, it } from "vitest";
import {
  placeWords,
  placingGap,
  placingSentence,
  rankedEfforts,
  runPlacings,
  type PlacedRun,
  type RunPlacing,
} from "../runPlacings";
import { rankWords } from "../segments";

/**
 * Your top three (Run29): where a run's 1K, 5K and 10K stand among your
 * own times, 1st to 3rd, from the times Bests lists.
 */

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 1, 8);

let next = 0;
/** An outdoor run on day `day`, timed at the given distances. */
function run(
  day: number,
  efforts: Record<number, number>,
  extra: Partial<PlacedRun> = {}
): PlacedRun {
  next += 1;
  return {
    id: `run-${next}`,
    completedAt: new Date(START + day * DAY),
    distance: 10_500,
    duration: 3200,
    avgPace: 305,
    activityType: "freerun",
    place: null,
    isInvalid: false,
    savedAnyway: false,
    bestEfforts: Object.entries(efforts).map(([distance, time]) => ({
      distance: Number(distance),
      time,
    })),
    ...extra,
  };
}

describe("runPlacings", () => {
  it("places a run 2nd behind one faster earlier time", () => {
    const history = [
      run(1, { 5000: 1510 }),
      run(2, { 5000: 1600 }),
      run(3, { 5000: 1620 }),
    ];
    expect(runPlacings(run(4, { 5000: 1541 }), history)).toEqual([
      { meters: 5000, seconds: 1541, place: 2, bestSeconds: 1510 },
    ]);
  });

  it("places a run 1st when it beats every earlier time", () => {
    const history = [run(1, { 5000: 1510 }), run(2, { 5000: 1600 })];
    expect(runPlacings(run(3, { 5000: 1490 }), history)).toEqual([
      { meters: 5000, seconds: 1490, place: 1, bestSeconds: 1510 },
    ]);
  });

  it("leaves out a 4th and below", () => {
    const history = [
      run(1, { 5000: 1500 }),
      run(2, { 5000: 1510 }),
      run(3, { 5000: 1520 }),
      run(4, { 5000: 1700 }),
    ];
    expect(runPlacings(run(5, { 5000: 1530 }), history)).toEqual([]);
  });

  it("keeps an earlier run at the same time ahead", () => {
    const history = [
      run(1, { 5000: 1500 }),
      run(2, { 5000: 1541 }),
      run(3, { 5000: 1600 }),
      run(4, { 5000: 1650 }),
    ];
    // Level with the 2nd: the earlier one keeps 2nd, this run is 3rd.
    expect(runPlacings(run(5, { 5000: 1541 }), history)[0]?.place).toBe(3);
    // Level with the best: 2nd, not a new best.
    expect(runPlacings(run(6, { 5000: 1500 }), history)[0]?.place).toBe(2);
  });

  it("places one run at two distances, in the order 1K, 5K, 10K", () => {
    const history = [
      run(1, { 1000: 250, 5000: 1500 }),
      run(2, { 1000: 255, 5000: 1520 }),
      run(3, { 1000: 262, 5000: 1600 }),
      run(4, { 1000: 270, 5000: 1610 }),
    ];
    const placings = runPlacings(run(5, { 1000: 258, 5000: 1510 }), history);
    expect(placings.map((p) => [p.meters, p.place])).toEqual([
      [1000, 3],
      [5000, 2],
    ]);
  });

  it("never counts a treadmill or manual run, or an invalid one", () => {
    const history = [
      run(1, { 5000: 1500 }),
      run(2, { 5000: 1600 }),
      run(3, { 5000: 1650 }),
    ];
    // The run itself on a treadmill places nowhere.
    expect(
      runPlacings(run(4, { 5000: 1400 }, { place: "treadmill" }), history)
    ).toEqual([]);
    expect(
      runPlacings(run(4, { 5000: 1400 }, { activityType: "treadmill" }), history)
    ).toEqual([]);
    expect(
      runPlacings(run(4, { 5000: 1400 }, { activityType: "manual" }), history)
    ).toEqual([]);
    // A faster treadmill or saved-anyway run ahead of it moves no one.
    const withIndoor = [
      ...history,
      run(4, { 5000: 1200 }, { place: "treadmill" }),
      run(4, { 5000: 1210 }, { isInvalid: true, savedAnyway: true }),
    ];
    expect(runPlacings(run(5, { 5000: 1550 }), withIndoor)).toEqual([
      { meters: 5000, seconds: 1550, place: 2, bestSeconds: 1500 },
    ]);
  });

  it("claims no place a run could only take for want of earlier runs", () => {
    // A first 5K is the fastest of nothing.
    expect(runPlacings(run(1, { 5000: 1600 }), [])).toEqual([]);
    // Slower than the only earlier one: 2nd of two is last, so nothing.
    expect(runPlacings(run(2, { 5000: 1700 }), [run(1, { 5000: 1600 })])).toEqual(
      []
    );
    // Two earlier: 3rd of three is last, so nothing; between them is 2nd.
    const two = [run(1, { 5000: 1600 }), run(2, { 5000: 1650 })];
    expect(runPlacings(run(3, { 5000: 1700 }), two)).toEqual([]);
    expect(runPlacings(run(3, { 5000: 1620 }), two)[0]?.place).toBe(2);
    // Faster than the only earlier one: a new best.
    expect(
      runPlacings(run(2, { 5000: 1500 }), [run(1, { 5000: 1600 })])[0]?.place
    ).toBe(1);
  });

  it("reads only the runs before it, leaving itself and later ones out", () => {
    const self = run(3, { 5000: 1550 });
    const history = [
      run(1, { 5000: 1500 }),
      run(2, { 5000: 1600 }),
      self,
      run(4, { 5000: 1400 }),
      run(5, { 5000: 1450 }),
    ];
    expect(runPlacings(self, history)[0]?.place).toBe(2);
  });

  it("times an older run by its splits, as Bests does", () => {
    const older = {
      ...run(1, {}),
      bestEfforts: undefined,
      kmSplitSeconds: [300, 300, 300, 300, 300],
    };
    const history = [older, run(2, { 5000: 1600 }), run(3, { 5000: 1650 })];
    expect(runPlacings(run(4, { 5000: 1550 }), history)).toEqual([
      { meters: 5000, seconds: 1550, place: 2, bestSeconds: 1500 },
    ]);
  });
});

describe("rankedEfforts", () => {
  it("lists eligible times fastest first, an earlier one ahead at a tie", () => {
    const a = run(1, { 5000: 1541 });
    const b = run(2, { 5000: 1500 });
    const c = run(3, { 5000: 1541 });
    const t = run(4, { 5000: 1300 }, { place: "treadmill" });
    expect(
      rankedEfforts([c, t, b, a], 5000).map((e) => [e.run.id, e.seconds])
    ).toEqual([
      [b.id, 1500],
      [a.id, 1541],
      [c.id, 1541],
    ]);
  });
});

describe("the words", () => {
  const placing = (place: 1 | 2 | 3, meters = 5000): RunPlacing => ({
    meters,
    seconds: 1541,
    place,
    bestSeconds: 1510,
  });

  it("says the best placing on a 2nd or 3rd", () => {
    expect(placingSentence([placing(2)])).toBe(
      "Ran 5K in 25:41, your 2nd fastest."
    );
    expect(placingSentence([placing(3, 1000), placing(2, 10000)])).toBe(
      "Ran 10K in 25:41, your 2nd fastest."
    );
    // Two at the same place: the longer distance.
    expect(placingSentence([placing(3, 1000), placing(3, 5000)])).toBe(
      "Ran 5K in 25:41, your 3rd fastest."
    );
  });

  it("says nothing with no placing, or with a 1st the reward says", () => {
    expect(placingSentence([])).toBeNull();
    expect(placingSentence([placing(1, 1000), placing(2)])).toBeNull();
  });

  it("gives a row your best, or a new best for a 1st", () => {
    expect(placingGap(placing(2))).toBe("best 25:10");
    expect(placingGap(placing(3))).toBe("best 25:10");
    expect(placingGap(placing(1))).toBe("New best");
  });

  it("names a place as a segment's place is named", () => {
    for (const place of [1, 2, 3] as const)
      expect(placeWords(place)).toBe(rankWords(place, 4));
  });
});
