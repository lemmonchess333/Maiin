import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  parseArgs,
  goalRaceEntry,
  percentError,
  predictionAfterWeeks,
  summarise,
  buildReport,
  formatReport,
  inRange,
} = require("../scripts/report-race-predictions.js");

/** A prediction as the app records it (src/lib/racePrediction.ts). */
function p(predictedS, weeksDone, planWeeks, reason = "changed") {
  return {
    at: "2027-01-04T08:00:00.000Z",
    reason,
    predictedS,
    vdot: 40,
    source: "race",
    weeksDone,
    planWeeks,
    daysToRace: 10,
  };
}

/** A goal race's run document as the app saves it. */
function raceRun(distance, duration, predictions, extra = {}) {
  return {
    distance: 10_000,
    duration,
    isInvalid: false,
    savedAnyway: false,
    racePrediction: {
      v: 1,
      distance,
      targetDate: "2027-03-28",
      entry: "race",
      goalTimeS: null,
      predictions,
    },
    ...extra,
  };
}

/**
 * Five runners, six goal races:
 * - A, a 10K on a 12-week plan: 52:07 at the start, 50:02 from week 4,
 *   ran 49:10;
 * - B, a 10K on an 8-week plan: 46:40 throughout, ran 48:20;
 * - C, a marathon on an 18-week plan: 4:10:00, then 4:05:00 from week 8,
 *   ran 4:15:00;
 * - C again, a half with a prediction from a plan of unknown length,
 *   ran 1:50:00 against 1:52:00;
 * - D, a 5K Tropos had no prediction for;
 * - E, a 5K on a 6-week plan whose first paces came in week 2 (a time
 *   trial), ran 24:00 against 25:00.
 */
const fixture = [
  {
    runner: "A",
    ...goalRaceEntry(
      raceRun("10k", 2950, [
        p(3127, 0, 12, "first"),
        p(3002, 4, 12),
        p(3002, 11, 12, "race-week"),
      ])
    ),
  },
  {
    runner: "B",
    ...goalRaceEntry(
      raceRun("10k", 2900, [p(2800, 0, 8, "first"), p(2800, 7, 8, "race-week")])
    ),
  },
  {
    runner: "C",
    ...goalRaceEntry(
      raceRun("marathon", 15300, [
        p(15000, 0, 18, "first"),
        p(14700, 8, 18),
        p(14700, 17, 18, "race-week"),
      ])
    ),
  },
  {
    runner: "C",
    ...goalRaceEntry(raceRun("half", 6600, [p(6720, null, null, "first")])),
  },
  { runner: "D", ...goalRaceEntry(raceRun("5k", 1500, [])) },
  {
    runner: "E",
    ...goalRaceEntry(
      raceRun("5k", 1440, [p(1500, 2, 6, "first"), p(1500, 5, 6, "race-week")])
    ),
  },
];

const err = (predicted, ran) => (100 * (ran - predicted)) / ran;
const sd2 = (a, b) => Math.abs(a - b) / Math.SQRT2;

describe("goal-race prediction report", () => {
  it("takes a project, an optional race-date range and --json", () => {
    expect(parseArgs(["--project=demo-tropos"])).toMatchObject({
      project: "demo-tropos",
      json: false,
    });
    expect(
      parseArgs([
        "--project=demo-tropos",
        "--since=2027-01-01",
        "--until=2027-12-31",
        "--json",
      ])
    ).toMatchObject({ since: "2027-01-01", until: "2027-12-31", json: true });
    expect(() => parseArgs([])).toThrow(/--project/);
    expect(() =>
      parseArgs(["--project=demo-tropos", "--since=2027-02-30"])
    ).toThrow(/real date/);
    expect(() =>
      parseArgs([
        "--project=demo-tropos",
        "--since=2027-03-01",
        "--until=2027-01-01",
      ])
    ).toThrow(/since/);
    expect(() => parseArgs(["--project=a", "--uid=x"])).toThrow(/Unknown/);
  });

  it("scores the signed percentage error against the time run", () => {
    // Ran 49:10 against 50:02: 52 s faster, 1.76% of the time run.
    expect(percentError(3002, 2950)).toBeCloseTo(-1.7627, 4);
    expect(percentError(2800, 2900)).toBeCloseTo(3.4483, 4);
    expect(percentError(3000, 3000)).toBe(0);
  });

  it("reads only goal races it can score", () => {
    expect(goalRaceEntry({ duration: 3000 })).toBeNull();
    expect(
      goalRaceEntry(
        raceRun("10k", 3000, [p(3000, 0, 12)], { savedAnyway: true })
      )
    ).toBeNull();
    expect(goalRaceEntry(raceRun("10k", 0, [p(3000, 0, 12)]))).toBeNull();
    expect(goalRaceEntry(raceRun("50k", 3000, [p(3000, 0, 12)]))).toBeNull();
    const run = raceRun("10k", 3000, [p(3000, 0, 12), { predictedS: "x" }]);
    run.racePrediction.v = 2;
    expect(goalRaceEntry(run)).toBeNull();
    run.racePrediction.v = 1;
    expect(goalRaceEntry(run).predictions).toEqual([
      { predictedS: 3000, weeksDone: 0, planWeeks: 12 },
    ]);
  });

  it("takes the prediction that stood after N weeks: the latest made by then", () => {
    const ps = fixture[0].predictions;
    expect(predictionAfterWeeks(ps, 0).predictedS).toBe(3127);
    expect(predictionAfterWeeks(ps, 3).predictedS).toBe(3127);
    expect(predictionAfterWeeks(ps, 4).predictedS).toBe(3002);
    // E's first paces came in week 2: nothing stood after week 0.
    expect(predictionAfterWeeks(fixture[5].predictions, 0)).toBeNull();
  });

  it("summarises mean, sample spread and mean absolute error", () => {
    expect(summarise([])).toEqual({
      n: 0,
      meanPct: null,
      sdPct: null,
      meanAbsPct: null,
    });
    expect(summarise([-2, 4])).toEqual({
      n: 2,
      meanPct: 1,
      sdPct: 4.24,
      meanAbsPct: 3,
    });
    expect(summarise([2.5]).sdPct).toBeNull();
  });

  it("builds the report over several runners", () => {
    const report = buildReport(fixture);
    expect(report).toMatchObject({
      goalRaces: 6,
      runners: 5,
      withPrediction: 5,
      withoutPrediction: 1,
    });
    const a = err(3002, 2950);
    const b = err(2800, 2900);
    const round2 = (x) => Math.round(x * 100) / 100;
    const row = (d) => report.lastBeforeRace.find((r) => r.distance === d);
    expect(row("10k")).toEqual({
      distance: "10k",
      n: 2,
      meanPct: round2((a + b) / 2),
      sdPct: round2(sd2(a, b)),
      meanAbsPct: round2((Math.abs(a) + Math.abs(b)) / 2),
    });
    expect(row("5k")).toMatchObject({ n: 1, meanPct: round2(err(1500, 1440)) });
    expect(row("marathon")).toMatchObject({
      n: 1,
      meanPct: round2(err(14700, 15300)),
    });
    expect(row("half")).toMatchObject({
      n: 1,
      meanPct: round2(err(6720, 6600)),
    });
    expect(row("all").n).toBe(5);

    const weeks = (d, w) =>
      report.byWeeksDone.find((r) => r.distance === d && r.weeksDone === w);
    // After week 0: A's and B's first predictions.
    expect(weeks("10k", 0)).toMatchObject({
      n: 2,
      meanPct: round2((err(3127, 2950) + err(2800, 2900)) / 2),
    });
    // After 4 weeks: A's update and B's unchanged prediction.
    expect(weeks("10k", 4)).toMatchObject({
      n: 2,
      meanPct: round2((a + b) / 2),
    });
    // After 8 weeks: only A's plan reached week 8; B's ended at week 7.
    expect(weeks("10k", 8)).toMatchObject({ n: 1, meanPct: round2(a) });
    expect(weeks("10k", 12)).toBeUndefined();
    // The marathon moved from 4:10:00 to 4:05:00 at week 8.
    expect(weeks("marathon", 0).meanPct).toBe(round2(err(15000, 15300)));
    expect(weeks("marathon", 8).meanPct).toBe(round2(err(14700, 15300)));
    expect(weeks("marathon", 16).n).toBe(1);
    expect(weeks("marathon", 20)).toBeUndefined();
    // E had no prediction after week 0; after week 4 it had its first.
    expect(weeks("5k", 0)).toBeUndefined();
    expect(weeks("5k", 4)).toMatchObject({ n: 1 });
    // A plan of unknown length is in the last view only.
    expect(report.byWeeksDone.some((r) => r.distance === "half")).toBe(false);
  });

  it("prints aggregates only", () => {
    const text = formatReport(buildReport(fixture));
    expect(text).toBe(
      [
        "Goal races: 6 from 5 runners, 5 with a prediction, 1 without.",
        "Error: 100 x (time run - time predicted) / time run; + means slower than predicted.",
        "",
        "The last prediction before the race",
        "Distance  Races   Mean    SD  Mean abs",
        "5K            1  -4.2%     -      4.2%",
        "10K           2  +0.8%  3.7%      2.6%",
        "Half          1  -1.8%     -      1.8%",
        "Marathon      1  +3.9%     -      3.9%",
        "All           5  -0.1%  3.6%      3.0%",
        "",
        "The prediction that stood after N weeks of the plan",
        "Distance  Weeks  Races   Mean    SD  Mean abs",
        "5K            4      1  -4.2%     -      4.2%",
        "10K           0      2  -1.3%  6.7%      4.7%",
        "10K           4      2  +0.8%  3.7%      2.6%",
        "10K           8      1  -1.8%     -      1.8%",
        "Marathon      0      1  +2.0%     -      2.0%",
        "Marathon      4      1  +2.0%     -      2.0%",
        "Marathon      8      1  +3.9%     -      3.9%",
        "Marathon     12      1  +3.9%     -      3.9%",
        "Marathon     16      1  +3.9%     -      3.9%",
        "",
      ].join("\n")
    );
  });

  it("selects races by race date, both ends inclusive", () => {
    expect(inRange("2027-03-28", { since: "2027-03-28" })).toBe(true);
    expect(inRange("2027-03-28", { until: "2027-03-28" })).toBe(true);
    expect(inRange("2027-03-28", { since: "2027-03-29" })).toBe(false);
    expect(inRange("", { since: "2027-01-01" })).toBe(false);
    expect(inRange("2027-03-28", {})).toBe(true);
  });
});
