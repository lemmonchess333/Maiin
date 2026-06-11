import { describe, it, expect } from "vitest";
import {
  vdotFromRace,
  predictRaceTimeS,
  trainingBands,
  paceTableFromFitness,
  resolveSessionPaces,
  deriveBenchmarkFromRuns,
  parseRaceTimeToSeconds,
  resolvePaceInsight,
} from "../runPaces";

describe("vdotFromRace", () => {
  it("matches the known Daniels value for a 20:00 5K (~49.8)", () => {
    const vdot = vdotFromRace(5000, 20 * 60);
    expect(vdot).toBeGreaterThan(49);
    expect(vdot).toBeLessThan(51);
  });

  it("a faster time at the same distance gives a higher VDOT", () => {
    expect(vdotFromRace(5000, 18 * 60)).toBeGreaterThan(
      vdotFromRace(5000, 22 * 60)
    );
  });

  it("returns 0 for nonsensical input (treated as no benchmark)", () => {
    expect(vdotFromRace(0, 1200)).toBe(0);
    expect(vdotFromRace(5000, 0)).toBe(0);
    expect(vdotFromRace(-5000, 1200)).toBe(0);
    expect(vdotFromRace(5000, Number.NaN)).toBe(0);
  });
});

describe("trainingBands — ordering & shape", () => {
  const b = trainingBands(50);

  it("each band is [fast, slow] (fast ≤ slow in sec/km)", () => {
    for (const key of [
      "easy",
      "marathon",
      "threshold",
      "interval",
      "repetition",
    ] as const) {
      expect(b[key][0]).toBeLessThanOrEqual(b[key][1]);
    }
  });

  it("intensities order easy → marathon → threshold → interval → repetition (slower → faster)", () => {
    // Compare the fast edge of each: easy is slowest (largest sec/km),
    // repetition fastest (smallest).
    expect(b.easy[0]).toBeGreaterThan(b.marathon[0]);
    expect(b.marathon[0]).toBeGreaterThan(b.threshold[0]);
    expect(b.threshold[0]).toBeGreaterThan(b.interval[0]);
    expect(b.interval[0]).toBeGreaterThan(b.repetition[0]);
  });

  it("a fitter runner (higher VDOT) gets faster paces", () => {
    const fit = trainingBands(60);
    expect(fit.threshold[0]).toBeLessThan(b.threshold[0]);
    expect(fit.easy[0]).toBeLessThan(b.easy[0]);
  });

  it("VDOT 50 threshold pace is plausible (~4:00–4:35/km)", () => {
    expect(b.threshold[0]).toBeGreaterThan(240);
    expect(b.threshold[1]).toBeLessThan(275);
  });
});

describe("predictRaceTimeS (Riegel)", () => {
  const benchmark = { distanceM: 5000, timeS: 20 * 60 };

  it("predicts a slower per-km pace at longer distances", () => {
    const pace10k = predictRaceTimeS(benchmark, 10000) / 10;
    const paceMarathon = predictRaceTimeS(benchmark, 42195) / 42.195;
    expect(paceMarathon).toBeGreaterThan(pace10k);
  });

  it("returns the benchmark time at the benchmark distance (~identity)", () => {
    expect(predictRaceTimeS(benchmark, 5000)).toBeCloseTo(20 * 60, 0);
  });
});

describe("paceTableFromFitness", () => {
  it("returns null when there is no usable benchmark", () => {
    expect(paceTableFromFitness(null)).toBeNull();
    expect(paceTableFromFitness({ benchmark: null, vdot: null })).toBeNull();
    expect(
      paceTableFromFitness({
        benchmark: { distanceM: 0, timeS: 0 },
        vdot: null,
      })
    ).toBeNull();
  });

  it("derives a full table from a benchmark, with race paces ordered by distance", () => {
    const t = paceTableFromFitness({
      benchmark: { distanceM: 5000, timeS: 20 * 60 },
      vdot: null,
    });
    expect(t).not.toBeNull();
    expect(t!.vdot).toBeGreaterThan(49);
    // race pace gets slower as the distance grows
    expect(t!.race["5k"]).toBeLessThan(t!.race["10k"]);
    expect(t!.race["10k"]).toBeLessThan(t!.race.half);
    expect(t!.race.half).toBeLessThan(t!.race.marathon);
  });

  it("works from a cached vdot alone (no stored benchmark)", () => {
    const t = paceTableFromFitness({ benchmark: null, vdot: 50 });
    expect(t).not.toBeNull();
    expect(t!.vdot).toBe(50);
    expect(t!.race["5k"]).toBeGreaterThan(0);
  });
});

describe("resolveSessionPaces", () => {
  const table = paceTableFromFitness({
    benchmark: { distanceM: 5000, timeS: 20 * 60 },
    vdot: null,
  })!;

  it("falls back to the template pace when there is no table", () => {
    expect(resolveSessionPaces("tempo", null, { fallbackPace: 270 })).toEqual({
      targetPace: 270,
    });
    expect(resolveSessionPaces("intervals", null)).toEqual({});
  });

  it("tempo → personalized threshold target pace", () => {
    const r = resolveSessionPaces("tempo", table);
    expect(r.targetPace).toBeGreaterThan(table.threshold[0] - 1);
    expect(r.targetPace).toBeLessThan(table.threshold[1] + 1);
    expect(r.band).toEqual(table.threshold);
  });

  it("intervals → personalized interval work pace (not a target)", () => {
    const r = resolveSessionPaces("intervals", table);
    expect(r.workPace).toBeGreaterThan(0);
    expect(r.targetPace).toBeUndefined();
  });

  it("race → the predicted race pace for the chosen distance", () => {
    const r = resolveSessionPaces("race", table, { raceDistanceKey: "10k" });
    expect(r.targetPace).toBe(table.race["10k"]);
  });

  it("easy/long expose the easy band but set no target pace", () => {
    const r = resolveSessionPaces("easy", table);
    expect(r.targetPace).toBeUndefined();
    expect(r.workPace).toBeUndefined();
    expect(r.band).toEqual(table.easy);
  });
});

describe("deriveBenchmarkFromRuns", () => {
  it("picks the effort implying the highest VDOT", () => {
    const best = deriveBenchmarkFromRuns([
      { distanceM: 5000, durationS: 1500 }, // 25:00 5K — slower
      { distanceM: 5000, durationS: 1200 }, // 20:00 5K — fastest VDOT
      { distanceM: 10000, durationS: 3000 }, // 50:00 10K
    ]);
    expect(best).toEqual({ distanceM: 5000, timeS: 1200 });
  });

  it("ignores runs shorter than 2km and returns null when nothing qualifies", () => {
    expect(
      deriveBenchmarkFromRuns([{ distanceM: 800, durationS: 200 }])
    ).toBeNull();
    expect(deriveBenchmarkFromRuns([])).toBeNull();
  });
});

describe("parseRaceTimeToSeconds", () => {
  it("parses mm:ss and h:mm:ss", () => {
    expect(parseRaceTimeToSeconds("22:30")).toBe(22 * 60 + 30);
    expect(parseRaceTimeToSeconds("1:45:00")).toBe(3600 + 45 * 60);
  });
  it("rejects malformed input", () => {
    expect(parseRaceTimeToSeconds("")).toBeNull();
    expect(parseRaceTimeToSeconds("90")).toBeNull();
    expect(parseRaceTimeToSeconds("22:90")).toBeNull();
    expect(parseRaceTimeToSeconds("a:bc")).toBeNull();
    expect(parseRaceTimeToSeconds("0:00")).toBeNull();
  });
});

describe("resolvePaceInsight", () => {
  const fitness = { benchmark: { distanceM: 5000, timeS: 1500 }, vdot: null }; // 25:00 5K

  it("returns null without fitness or with too few runs", () => {
    expect(
      resolvePaceInsight(null, [{ distanceM: 5000, durationS: 1200 }])
    ).toBeNull();
    expect(
      resolvePaceInsight(fitness, [{ distanceM: 5000, durationS: 1200 }])
    ).toBeNull();
  });

  it("suggests a FASTER benchmark when recent runs imply higher fitness", () => {
    const runs = [
      { distanceM: 5000, durationS: 1200 }, // 20:00 — much faster (VDOT ~50)
      { distanceM: 5000, durationS: 1230 },
      { distanceM: 10000, durationS: 2550 },
    ];
    const ins = resolvePaceInsight(fitness, runs);
    expect(ins).not.toBeNull();
    expect(ins!.direction).toBe("faster");
    expect(ins!.suggestedVdot).toBeGreaterThan(ins!.currentVdot);
  });

  it("suggests SLOWER when even the best recent effort is well below the mark", () => {
    const fastFitness = {
      benchmark: { distanceM: 5000, timeS: 1080 },
      vdot: null,
    }; // 18:00
    const runs = [
      { distanceM: 5000, durationS: 1560 }, // 26:00 — all slow
      { distanceM: 5000, durationS: 1620 },
      { distanceM: 8000, durationS: 2520 },
    ];
    const ins = resolvePaceInsight(fastFitness, runs);
    expect(ins).not.toBeNull();
    expect(ins!.direction).toBe("slower");
  });

  it("returns null when recent fitness matches the stored mark (small delta)", () => {
    const runs = [
      { distanceM: 5000, durationS: 1500 },
      { distanceM: 5000, durationS: 1510 },
      { distanceM: 5000, durationS: 1495 },
    ];
    expect(resolvePaceInsight(fitness, runs)).toBeNull();
  });
});
