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
  raceDistanceKeyFromKm,
  predictedRaceTimesFromFitness,
  prescriptivePaceTableFromFitness,
  raceTargetBand,
  resolveEffortAgreement,
  type RelativeEffort,
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

  it("echoes the WINNING run's provenance (RUN-EV-08)", () => {
    const best = deriveBenchmarkFromRuns([
      {
        distanceM: 5000,
        durationS: 1500,
        id: "run-slow",
        completedAt: new Date("2026-08-01T08:00:00Z"),
      },
      {
        distanceM: 5000,
        durationS: 1200,
        id: "run-fast",
        completedAt: new Date("2026-08-03T08:00:00Z"),
      },
    ]);
    expect(best).toMatchObject({
      distanceM: 5000,
      timeS: 1200,
      sourceRunId: "run-fast",
      sourceRunAt: "2026-08-03T08:00:00.000Z",
    });
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

/**
 * The Easier / About right / Harder tap, finally consumed.
 *
 * It has been stored on every saved run since RUN-03 and read by nothing —
 * RunSummary's own comment conceded "v1 is a stored calibration signal
 * only". The question was whether tapping "Harder" should make future runs
 * easier, which is what a runner reasonably expects it to mean.
 *
 * The answer the evidence supports is: not on its own. Of the adaptive-plan
 * products checked, 3 of 3 collect a subjective rating and 0 route it into
 * the scheduler; Runna's support doc says its thumbs rating goes to "Runna's
 * coaching and product teams" and will play a direct role "in the near
 * future" — future tense. What moves Runna's paces is an objective
 * pace-vs-target trend the user then accepts.
 *
 * So the rating is a CONFIDENCE MODULATOR on that objective trend: it can
 * lower the bar when it agrees, and refuse outright when it disagrees, but
 * it can never originate a suggestion.
 */
describe("resolveEffortAgreement", () => {
  it("pairs easier-with-faster and harder-with-slower", () => {
    /* Not self-evident, so pinned: "faster" means recent efforts imply MORE
       fitness, and a run that felt EASIER than expected is the subjective
       form of that same claim. */
    expect(resolveEffortAgreement("faster", ["easier", "easier"])).toBe(
      "agrees"
    );
    expect(resolveEffortAgreement("slower", ["harder", "harder"])).toBe(
      "agrees"
    );
  });

  it("treats the crossed pairs as evidence disagreeing with itself", () => {
    expect(resolveEffortAgreement("faster", ["harder", "harder"])).toBe(
      "conflicts"
    );
    expect(resolveEffortAgreement("slower", ["easier", "easier"])).toBe(
      "conflicts"
    );
  });

  it("does not let ONE tap count as a pattern", () => {
    /* The load-bearing guardrail: a single tap must not move a training
       block. Both directions, so the rule cannot be half-applied. */
    expect(resolveEffortAgreement("faster", ["easier"])).toBe("neutral");
    expect(resolveEffortAgreement("faster", ["harder"])).toBe("neutral");
  });

  it("counts 'matched' and unrated runs for neither side", () => {
    /* "About right" is the runner saying the session landed where it should
       — consistent with any objective drift, so it is not a vote. null is a
       run they never rated at all. */
    expect(
      resolveEffortAgreement("faster", ["matched", "matched", "matched"])
    ).toBe("neutral");
    expect(resolveEffortAgreement("faster", [null, null, null])).toBe(
      "neutral"
    );
    expect(
      resolveEffortAgreement("faster", ["matched", null, "easier", "easier"])
    ).toBe("agrees");
  });

  it("needs a majority, not just a quorum", () => {
    expect(
      resolveEffortAgreement("faster", ["easier", "easier", "harder", "harder"])
    ).toBe("neutral");
    expect(
      resolveEffortAgreement("faster", ["easier", "easier", "easier", "harder"])
    ).toBe("agrees");
  });
});

describe("resolvePaceInsight — effort as a confidence modulator", () => {
  const BENCH_M = 5000;
  const BENCH_S = 1500; // 25:00 5K
  const fitness = {
    benchmark: { distanceM: BENCH_M, timeS: BENCH_S },
    vdot: null,
  };
  const baseVdot = vdotFromRace(BENCH_M, BENCH_S);

  /**
   * The 5K time whose VDOT sits `delta` above (or, negative, below) the
   * stored benchmark.
   *
   * SOLVED, not hand-picked. The first draft of these tests eyeballed 5K
   * times and two of them landed on the wrong side of the gate — a constant
   * chosen by guessing what a VDOT curve does is one nobody can check, and
   * it silently re-guesses every time a gate is retuned.
   */
  function timeForVdotDelta(delta: number): number {
    let lo = 300;
    let hi = 3600;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (vdotFromRace(BENCH_M, mid) > baseVdot + delta) lo = mid;
      else hi = mid;
    }
    return Math.round((lo + hi) / 2);
  }

  /** Three runs whose BEST effort sits `delta` VDOT off the benchmark. */
  function runsAtDelta(delta: number, effort: RelativeEffort) {
    return [
      {
        distanceM: BENCH_M,
        durationS: timeForVdotDelta(delta),
        relativeEffort: effort,
      },
      { distanceM: BENCH_M, durationS: 2400, relativeEffort: effort },
      { distanceM: BENCH_M, durationS: 2500, relativeEffort: effort },
    ];
  }

  it("a runner who never taps the chips gets exactly today's behaviour", () => {
    /* The compatibility guarantee, and the reason the neutral gate stays the
       caller's `minDeltaVdot` rather than being re-derived. */
    const unrated = runsAtDelta(1.4, null);
    const rated = runsAtDelta(1.4, "matched");
    const bare = unrated.map(({ distanceM, durationS }) => ({
      distanceM,
      durationS,
    }));
    expect(resolvePaceInsight(fitness, unrated)).toEqual(
      resolvePaceInsight(fitness, bare)
    );
    expect(resolvePaceInsight(fitness, rated)).toEqual(
      resolvePaceInsight(fitness, bare)
    );
  });

  it("agreeing taps lower the bar enough to surface a borderline trend", () => {
    /* The user-visible payoff: 1.4 VDOT is under the default 1.5 gate and
       over the 1.3 agreeing one, so the SAME runs produce nothing unrated
       and a suggestion once the runner has said they felt easy. */
    expect(resolvePaceInsight(fitness, runsAtDelta(1.4, null))).toBeNull();
    const ins = resolvePaceInsight(fitness, runsAtDelta(1.4, "easier"));
    expect(ins).not.toBeNull();
    expect(ins!.direction).toBe("faster");
    expect(ins!.effort).toBe("agrees");
  });

  it("conflicting taps refuse a suggestion the times alone would have made", () => {
    /* Runna ships two named statuses whose only job is declining ("Variable
       Pace Detected", "Monitoring Your Pace Data"). A recommendation is not
       owed on every query. */
    const runs = runsAtDelta(4, "harder");
    const bare = runs.map(({ distanceM, durationS }) => ({
      distanceM,
      durationS,
    }));
    expect(resolvePaceInsight(fitness, bare)).not.toBeNull();
    expect(resolvePaceInsight(fitness, runs)).toBeNull();
  });

  it("the ratings can never ORIGINATE a suggestion", () => {
    /* The single most important property, and the owner's stated worry made
       structurally impossible: runs sitting on the stored benchmark produce
       nothing however emphatically they are rated, because there is no
       objective trend for the taps to sharpen. */
    for (const effort of ["easier", "harder", "matched"] as const) {
      expect(resolvePaceInsight(fitness, runsAtDelta(0.2, effort))).toBeNull();
      expect(resolvePaceInsight(fitness, runsAtDelta(-0.2, effort))).toBeNull();
    }
  });

  it("easing off is cheaper to trigger than pushing harder", () => {
    /* Deliberate hysteresis: paces prescribed too easy cost a little
       stimulus, paces prescribed too hard cost an injury. Pinned as the
       RELATIONSHIP between the gates — one delta, both directions — so it
       survives either number being retuned. */
    const delta = 1.2; // over the 1.1 easing gate, under the 1.3 hardening one
    const easing = resolvePaceInsight(fitness, runsAtDelta(-delta, "harder"));
    expect(easing).not.toBeNull();
    expect(easing!.direction).toBe("slower");

    const hardening = resolvePaceInsight(fitness, runsAtDelta(delta, "easier"));
    expect(hardening).toBeNull();
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
