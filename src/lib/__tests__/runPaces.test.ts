import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  vdotFromRace,
  predictRaceTimeS,
  trainingBands,
  paceTableFromFitness,
  resolveSessionPaces,
  bestEffort,
  derivedFitness,
  effortVdot,
  vdotFromTempoPace,
  parseRaceTimeToSeconds,
  resolvePaceInsight,
  raceDistanceKeyFromKm,
  predictedRaceTimesFromFitness,
  prescriptivePaceTableFromFitness,
  raceTargetBand,
  benchmarkFromRaceTime,
  manualRunFitness,
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

/* Pgm8 R1: a benchmark is derived from efforts only, a race whole and a
   tempo by its work, read as threshold pace. */
describe("vdotFromTempoPace", () => {
  const tempoPace = (vdot: number) => {
    const [fast, slow] = trainingBands(vdot).threshold;
    return Math.round((fast + slow) / 2);
  };

  it("gives back the VDOT whose tempo pace was held, across the range", () => {
    for (const vdot of [25, 30, 35, 40, 45, 50, 60, 70]) {
      // The prescribed pace is whole seconds: within a tenth.
      expect(Math.abs(vdotFromTempoPace(tempoPace(vdot)) - vdot)).toBeLessThan(
        0.15
      );
    }
  });

  it("reads a tempo above the same run read as a race of its length", () => {
    // 20 minutes at VDOT 40's tempo pace is a 20-minute "race" at 95% of
    // VO2max, against threshold's 86–88%: about 3 VDOT low.
    const pace = tempoPace(40);
    const asRace = vdotFromRace((1200 / pace) * 1000, 1200);
    expect(vdotFromTempoPace(pace) - asRace).toBeGreaterThan(2.5);
  });

  it("returns 0 for a pace that isn't one", () => {
    expect(vdotFromTempoPace(0)).toBe(0);
    expect(vdotFromTempoPace(-300)).toBe(0);
    expect(vdotFromTempoPace(Number.NaN)).toBe(0);
  });
});

describe("bestEffort and derivedFitness", () => {
  const race = (distanceM: number, timeS: number, id?: string) => ({
    kind: "race" as const,
    distanceM,
    timeS,
    ...(id ? { id } : {}),
  });

  it("reads a race by its finish and a tempo by its pace", () => {
    expect(effortVdot(race(5000, 1200))).toBe(vdotFromRace(5000, 1200));
    expect(effortVdot({ kind: "tempo", distanceM: 4000, timeS: 1200 })).toBe(
      vdotFromTempoPace(300)
    );
  });

  it("picks the effort implying the highest VDOT", () => {
    const best = bestEffort([
      race(5000, 1500), // 25:00 5K
      race(5000, 1200), // 20:00 5K, the best
      race(10000, 3000), // 50:00 10K
    ]);
    expect(best?.effort).toMatchObject({ distanceM: 5000, timeS: 1200 });
    expect(bestEffort([])).toBeNull();
  });

  it("passes over a VDOT no one has run", () => {
    // 5 km in 9:00 would be VDOT 120: a bad recording, not an effort.
    const best = bestEffort([race(5000, 540), race(5000, 1500)]);
    expect(best?.effort.timeS).toBe(1500);
  });

  it("stores a race as run, and a tempo as its VDOT with no race result", () => {
    expect(
      derivedFitness({
        effort: {
          ...race(5000, 1200, "run-fast"),
          completedAt: new Date("2026-08-03T08:00:00Z"),
        },
        vdot: vdotFromRace(5000, 1200),
      })
    ).toEqual({
      benchmark: { distanceM: 5000, timeS: 1200 },
      vdot: Math.round(vdotFromRace(5000, 1200) * 10) / 10,
      sourceRunId: "run-fast",
      sourceRunAt: "2026-08-03T08:00:00.000Z",
    });
    expect(
      derivedFitness({
        effort: { kind: "tempo", distanceM: 4000, timeS: 1200, id: "t" },
        vdot: 41.38,
      })
    ).toEqual({ benchmark: null, vdot: 41.4, sourceRunId: "t" });
  });

  it("a tempo's VDOT alone still gives every pace and prediction", () => {
    const fitness = { benchmark: null, vdot: 41.4 };
    expect(paceTableFromFitness(fitness)?.vdot).toBe(41.4);
    expect(predictedRaceTimesFromFitness(fitness)?.["5k"]).toBeGreaterThan(0);
  });
});

describe("prescriptivePaceTableFromFitness — RUN-EV-08 two-tier consent", () => {
  const derived = {
    benchmark: { distanceM: 5000, timeS: 1200 },
    vdot: null,
  };

  it("an unconfirmed auto-derived benchmark yields NO prescription table", () => {
    expect(
      prescriptivePaceTableFromFitness({
        ...derived,
        pendingConfirmation: true,
      })
    ).toBeNull();
    // …while the measurement table still resolves for the same fitness.
    expect(
      paceTableFromFitness({ ...derived, pendingConfirmation: true })
    ).not.toBeNull();
  });

  it("a confirmed (or non-flagged) benchmark prescribes identically to the measurement table", () => {
    expect(
      prescriptivePaceTableFromFitness({
        ...derived,
        pendingConfirmation: false,
      })
    ).toEqual(paceTableFromFitness(derived));
    expect(prescriptivePaceTableFromFitness(derived)).toEqual(
      paceTableFromFitness(derived)
    );
  });

  it("null/absent fitness stays null", () => {
    expect(prescriptivePaceTableFromFitness(null)).toBeNull();
    expect(prescriptivePaceTableFromFitness(undefined)).toBeNull();
  });
});

describe("parseRaceTimeToSeconds", () => {
  it("parses mm:ss and h:mm:ss", () => {
    expect(parseRaceTimeToSeconds("22:30")).toBe(22 * 60 + 30);
    expect(parseRaceTimeToSeconds("1:45:00")).toBe(3600 + 45 * 60);
  });
  it("reads the iPhone decimal pad's separators as a colon", () => {
    // The time boxes open the decimal pad, which has "." (or "," in some
    // languages) and no ":".
    expect(parseRaceTimeToSeconds("22.30")).toBe(22 * 60 + 30);
    expect(parseRaceTimeToSeconds("1.45.00")).toBe(3600 + 45 * 60);
    expect(parseRaceTimeToSeconds("1,45,00")).toBe(3600 + 45 * 60);
    expect(parseRaceTimeToSeconds("22 30")).toBe(22 * 60 + 30);
    expect(parseRaceTimeToSeconds("22.90")).toBeNull();
    expect(parseRaceTimeToSeconds("22..30")).toBeNull();
    expect(parseRaceTimeToSeconds("22::30")).toBeNull();
  });
  it("is what the time boxes' keypad can type", () => {
    for (const [file, id] of [
      ["src/components/settings/RunFitnessSection.tsx", "benchmark-time"],
      ["src/components/program/RunPlanSettings.tsx", "ps-race-time"],
    ]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      const input = src.slice(src.indexOf(`id="${id}"`)).split("/>")[0];
      expect(input, file).toContain('inputMode="decimal"');
    }
  });
  it("rejects malformed input", () => {
    expect(parseRaceTimeToSeconds("")).toBeNull();
    expect(parseRaceTimeToSeconds("90")).toBeNull();
    expect(parseRaceTimeToSeconds("22:90")).toBeNull();
    expect(parseRaceTimeToSeconds("a:bc")).toBeNull();
    expect(parseRaceTimeToSeconds("0:00")).toBeNull();
  });
});

/* A race time the person typed, in Settings or at setup (adaptive paces
   §10.2): read as a benchmark, then stored as their own. */
describe("benchmarkFromRaceTime and manualRunFitness", () => {
  it("reads a time as a benchmark at its distance, VDOT to a tenth", () => {
    expect(benchmarkFromRaceTime("5k", "22:30")).toEqual({
      benchmark: { distanceM: 5000, timeS: 1350 },
      vdot: 43.4,
    });
    expect(benchmarkFromRaceTime("10k", "48:00")).toEqual({
      benchmark: { distanceM: 10000, timeS: 2880 },
      vdot: 42,
    });
    expect(benchmarkFromRaceTime("half", "1:45:00")).toMatchObject({
      benchmark: { distanceM: 21097.5, timeS: 6300 },
    });
  });

  it("refuses a time that doesn't read as one", () => {
    expect(benchmarkFromRaceTime("5k", "22")).toEqual({ error: "format" });
    expect(benchmarkFromRaceTime("5k", "22:75")).toEqual({ error: "format" });
    expect(benchmarkFromRaceTime("5k", "0:00")).toEqual({ error: "format" });
  });

  it("refuses a time faster than anyone has raced", () => {
    // The records sit at VDOT 85 to 87: a 12:35 5K reads, a 12:00 one
    // (90.1) or a 25:00 10K (90.4) doesn't.
    expect(benchmarkFromRaceTime("5k", "12:35")).not.toHaveProperty("error");
    expect(benchmarkFromRaceTime("5k", "12:00")).toEqual({
      error: "implausible",
    });
    expect(benchmarkFromRaceTime("10k", "25:00")).toEqual({
      error: "implausible",
    });
  });

  it("keeps a slow time: a 45-minute 5K is a benchmark too", () => {
    expect(benchmarkFromRaceTime("5k", "45:00")).toEqual({
      benchmark: { distanceM: 5000, timeS: 2700 },
      vdot: 18.7,
    });
  });

  it("stores a typed benchmark as the person's own, never pending (RUN-EV-08)", () => {
    const entry = benchmarkFromRaceTime("5k", "22:30");
    if ("error" in entry) throw new Error("22:30 reads as a 5K");
    expect(
      manualRunFitness(entry, new Date("2026-10-08T07:00:00.000Z"))
    ).toEqual({
      benchmark: { distanceM: 5000, timeS: 1350 },
      vdot: 43.4,
      source: "manual",
      updatedAt: "2026-10-08T07:00:00.000Z",
      pendingConfirmation: false,
    });
  });
});

describe("resolvePaceInsight", () => {
  const fitness = { benchmark: { distanceM: 5000, timeS: 1500 }, vdot: null }; // 25:00 5K
  const race = (distanceM: number, timeS: number) => ({
    kind: "race" as const,
    distanceM,
    timeS,
  });

  it("returns null without fitness or without an effort", () => {
    expect(resolvePaceInsight(null, [race(5000, 1200)])).toBeNull();
    expect(resolvePaceInsight(fitness, [])).toBeNull();
  });

  it("suggests a FASTER benchmark when a recent effort implies higher fitness", () => {
    // One race is enough since Pgm8 R1: the person decides.
    const ins = resolvePaceInsight(fitness, [race(5000, 1200)]); // 20:00
    expect(ins).not.toBeNull();
    expect(ins!.direction).toBe("faster");
    expect(ins!.suggestedVdot).toBeGreaterThan(ins!.currentVdot);
    expect(ins!.suggested.benchmark).toEqual({ distanceM: 5000, timeS: 1200 });
  });

  it("suggests SLOWER when even the best recent effort is well below the mark", () => {
    const fastFitness = {
      benchmark: { distanceM: 5000, timeS: 1080 },
      vdot: null,
    }; // 18:00
    const efforts = [
      race(5000, 1560), // 26:00 — all slow
      race(5000, 1620),
      race(8000, 2520),
    ];
    const ins = resolvePaceInsight(fastFitness, efforts);
    expect(ins).not.toBeNull();
    expect(ins!.direction).toBe("slower");
  });

  it("returns null when recent fitness matches the stored mark (small delta)", () => {
    const efforts = [race(5000, 1500), race(5000, 1510), race(5000, 1495)];
    expect(resolvePaceInsight(fitness, efforts)).toBeNull();
  });

  it("suggests from a tempo's work, storing no race result", () => {
    // 20 minutes at 4:45 /km is a VDOT-44 tempo, over the stored 38.3.
    const ins = resolvePaceInsight(fitness, [
      { kind: "tempo", distanceM: (1200 / 285) * 1000, timeS: 1200 },
    ]);
    expect(ins?.direction).toBe("faster");
    expect(ins?.suggested.benchmark).toBeNull();
    expect(ins?.suggestedVdot).toBe(ins?.suggested.vdot);
  });
});

describe("raceDistanceKeyFromKm", () => {
  it("maps template distances to race keys", () => {
    expect(raceDistanceKeyFromKm(5)).toBe("5k");
    expect(raceDistanceKeyFromKm(10)).toBe("10k");
    expect(raceDistanceKeyFromKm(21.1)).toBe("half");
    expect(raceDistanceKeyFromKm(42.2)).toBe("marathon");
    expect(raceDistanceKeyFromKm(undefined)).toBeUndefined();
  });
});

describe("predictedRaceTimesFromFitness (Analytics race predictions)", () => {
  const fitness = {
    benchmark: { distanceM: 5000, timeS: 1500 }, // 25:00 5K
    vdot: null,
  };

  it("returns null with no usable fitness", () => {
    expect(predictedRaceTimesFromFitness(null)).toBeNull();
    expect(predictedRaceTimesFromFitness(undefined)).toBeNull();
    expect(
      predictedRaceTimesFromFitness({ benchmark: null, vdot: null })
    ).toBeNull();
    expect(
      predictedRaceTimesFromFitness({
        benchmark: { distanceM: 0, timeS: 0 },
        vdot: null,
      })
    ).toBeNull();
  });

  it("benchmark path matches predictRaceTimeS exactly (single source)", () => {
    const times = predictedRaceTimesFromFitness(fitness)!;
    expect(times["5k"]).toBe(1500); // identity at the benchmark distance
    expect(times["10k"]).toBe(
      Math.round(predictRaceTimeS(fitness.benchmark, 10000))
    );
    expect(times.half).toBe(
      Math.round(predictRaceTimeS(fitness.benchmark, 21097.5))
    );
    expect(times.marathon).toBe(
      Math.round(predictRaceTimeS(fitness.benchmark, 42195))
    );
  });

  it("times increase with distance and per-km pace degrades (Riegel)", () => {
    const t = predictedRaceTimesFromFitness(fitness)!;
    expect(t["10k"]).toBeGreaterThan(t["5k"]);
    expect(t.half).toBeGreaterThan(t["10k"]);
    expect(t.marathon).toBeGreaterThan(t.half);
    expect(t.marathon / 42.195).toBeGreaterThan(t["5k"] / 5);
  });

  it("vdot-only path synthesises an equivalent 5K (matches the paces table)", () => {
    const vdotOnly = { benchmark: null, vdot: 50 };
    const times = predictedRaceTimesFromFitness(vdotOnly)!;
    // The paces table's 5k race PACE comes from the same synthesised effort —
    // the two surfaces must agree (pace is the rounded per-km of the time).
    const table = paceTableFromFitness(vdotOnly)!;
    expect(Math.round(times["5k"] / 5)).toBe(table.race["5k"]);
    // VDOT 50 5K is ~19:30–20:00 territory.
    expect(times["5k"]).toBeGreaterThan(1100);
    expect(times["5k"]).toBeLessThan(1250);
  });

  it("prefers the stored benchmark over the cached vdot for projections", () => {
    const withBoth = {
      benchmark: { distanceM: 5000, timeS: 1500 },
      vdot: 60, // stale/fast cache — must not distort the Riegel reference
    };
    expect(predictedRaceTimesFromFitness(withBoth)!["5k"]).toBe(1500);
  });
});

describe("raceTargetBand — the shared goal-gap scale", () => {
  it("pins the band boundaries against literals", () => {
    // Shared by the feasibility verdict (display) and the goal-pace
    // enrichment gate (prescription) — these literals are the contract.
    expect(raceTargetBand(-3)).toBe("on_track");
    expect(raceTargetBand(0)).toBe("on_track");
    expect(raceTargetBand(0.1)).toBe("within_reach");
    expect(raceTargetBand(2)).toBe("within_reach");
    expect(raceTargetBand(2.1)).toBe("stretch");
    expect(raceTargetBand(4)).toBe("stretch");
    expect(raceTargetBand(4.1)).toBe("long_shot");
  });
});
