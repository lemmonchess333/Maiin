/**
 * Run27 (14): a run on a hot or extreme day never lowers the benchmark; a
 * fast hot run may still raise it. Driven from the run as the run screen
 * saves it (`runDocument`, with `runConfig.hotDay` set at the start on a hot
 * day) and reads it back (`parseSavedRun`), through the efforts every
 * reader takes (`benchmarkEfforts`), to each reader of the best effort: the
 * run summary's offer (`resolvePaceInsight`), a runner's first paces
 * (`resolveFirstPaces`) and the benchmark the app derives
 * (`resolveAutoDerive`).
 */
import { describe, expect, it } from "vitest";
import { runDocument, type FinishedRun } from "../runCompletion";
import { parseSavedRun, type SavedRun } from "../savedRuns";
import { benchmarkEfforts } from "../benchmarkEfforts";
import {
  heatHoldsBenchmark,
  resolveFirstPaces,
  resolvePaceInsight,
  vdotFromRace,
} from "../runPaces";
import { resolveAutoDerive } from "@/hooks/useRunFitnessAutoDerive";
import { DEFAULT_CONFIG } from "@/components/run/runConfigDefaults";
import { freeformPlanMetadata } from "../runPlanMetadata";

const NOW = new Date();

/** A 5K run as "Race effort", finished in `timeS`, saved and read back. */
function savedRace(id: string, timeS: number, hotDay: boolean): SavedRun {
  const run: FinishedRun = {
    points: [],
    distance: 5000,
    elapsed: timeS,
    avgPaceSeconds: timeS / 5,
    calories: 0,
    elevationGain: 0,
    splits: [],
    runConfig: {
      ...DEFAULT_CONFIG,
      activityType: "race",
      planMetadata: freeformPlanMetadata("freeform"),
      // Set by the run screen at the start on a hot day (Run.tsx).
      ...(hotDay ? { hotDay: true } : {}),
    },
    notes: "",
    relativeEffort: null,
    paceVerdictTone: null,
    isInvalid: false,
    invalidReason: null,
    routeQuality: null,
    workPortion: null,
    shoeId: null,
    bestEfforts: [],
  };
  const saved = parseSavedRun(id, runDocument(run, NOW));
  if (!saved) throw new Error("the saved run did not read back");
  return saved;
}

/** A confirmed benchmark: a 22:00 5K, VDOT 44.5. */
const BENCHMARK = {
  benchmark: { distanceM: 5000, timeS: 1320 },
  vdot: null,
  pendingConfirmation: false,
};
const BENCHMARK_VDOT = vdotFromRace(5000, 1320);

describe("the saved run carries its hot day", () => {
  it("reads runConfig.hotDay back as the run's, and nothing on a mild day", () => {
    expect(savedRace("hot", 1500, true).hotDay).toBe(true);
    expect(savedRace("mild", 1500, false).hotDay).toBeUndefined();
  });

  it("marks the effort it gives", () => {
    const [hot] = benchmarkEfforts([savedRace("hot", 1500, true)]);
    const [mild] = benchmarkEfforts([savedRace("mild", 1500, false)]);
    expect(hot).toMatchObject({ kind: "race", hotDay: true, id: "hot" });
    expect(mild.hotDay).toBeUndefined();
  });
});

describe("the run summary's offer (resolvePaceInsight)", () => {
  // A 25:00 5K is VDOT about 38.3, well under the benchmark.
  it("a slow run on a mild day offers slower paces", () => {
    const efforts = benchmarkEfforts([savedRace("mild", 1500, false)]);
    const insight = resolvePaceInsight(BENCHMARK, efforts);
    expect(insight?.direction).toBe("slower");
    expect(insight!.suggestedVdot).toBeLessThan(BENCHMARK_VDOT);
  });

  it("the same run on a hot day leaves the benchmark as it is", () => {
    const efforts = benchmarkEfforts([savedRace("hot", 1500, true)]);
    expect(resolvePaceInsight(BENCHMARK, efforts)).toBeNull();
  });

  it("a fast run on a hot day still raises it", () => {
    // A 20:00 5K is VDOT about 49.8.
    const efforts = benchmarkEfforts([savedRace("hot", 1200, true)]);
    const insight = resolvePaceInsight(BENCHMARK, efforts);
    expect(insight?.direction).toBe("faster");
    expect(insight!.suggestedVdot).toBeGreaterThan(BENCHMARK_VDOT);
    expect(insight!.suggested.sourceRunId).toBe("hot");
  });

  it("a hot run that is the best of the window holds back a slower offer from a mild one under it", () => {
    // Without the hot 23:30, the mild 26:00 offers slower paces; with it,
    // the best recent effort was run in the heat, and nothing lowers.
    const mildOnly = benchmarkEfforts([savedRace("mild", 1560, false)]);
    expect(resolvePaceInsight(BENCHMARK, mildOnly)?.direction).toBe("slower");
    const both = benchmarkEfforts([
      savedRace("hot", 1410, true),
      savedRace("mild", 1560, false),
    ]);
    expect(resolvePaceInsight(BENCHMARK, both)).toBeNull();
  });

  it("a mild run that beats a hot one still lowers as before", () => {
    // The hot 27:00 is not the best: the mild 25:00 is, and it lowers.
    const efforts = benchmarkEfforts([
      savedRace("hot", 1620, true),
      savedRace("mild", 1500, false),
    ]);
    const insight = resolvePaceInsight(BENCHMARK, efforts);
    expect(insight?.direction).toBe("slower");
    expect(insight!.suggested.sourceRunId).toBe("mild");
  });
});

describe("a runner's first paces (resolveFirstPaces)", () => {
  /** Derived from a 22:00 5K, not yet accepted. */
  const PENDING = { ...BENCHMARK, pendingConfirmation: true };

  it("a hot run under the unconfirmed benchmark offers nothing; on a mild day it is offered", () => {
    expect(
      resolveFirstPaces(PENDING, benchmarkEfforts([savedRace("h", 1500, true)]))
    ).toBeNull();
    expect(
      resolveFirstPaces(
        PENDING,
        benchmarkEfforts([savedRace("m", 1500, false)])
      )?.direction
    ).toBe("first");
  });

  it("a hot run over it, or with no benchmark at all, gives first paces", () => {
    expect(
      resolveFirstPaces(PENDING, benchmarkEfforts([savedRace("h", 1200, true)]))
        ?.direction
    ).toBe("first");
    // Nothing to lower: a hot week-2 time trial still gives paces.
    expect(
      resolveFirstPaces(null, benchmarkEfforts([savedRace("h", 1500, true)]))
        ?.direction
    ).toBe("first");
  });
});

describe("the benchmark the app derives (resolveAutoDerive)", () => {
  /** A pending benchmark an old rule set from an easy run (Pgm8 R1), VDOT
   *  44.5: the derive re-reads it from the efforts in the window. */
  const OLD_RULE = {
    benchmark: { distanceM: 5000, timeS: 1320 },
    vdot: 44.5,
    source: "derived" as const,
    pendingConfirmation: true,
    sourceRunId: "easy",
    updatedAt: NOW.toISOString(),
  };
  const easy = (): SavedRun => ({
    ...savedRace("easy", 1320, false),
    activityType: "easy",
  });

  it("a slower mild effort re-derives it lower; the same effort hot keeps it", () => {
    const mild = resolveAutoDerive(
      OLD_RULE,
      [easy(), savedRace("m", 1500, false)],
      NOW
    );
    expect(mild?.runFitness?.vdot).toBeLessThan(44.5);
    expect(
      resolveAutoDerive(OLD_RULE, [easy(), savedRace("h", 1500, true)], NOW)
    ).toBeNull();
  });

  it("a faster hot effort still re-derives it higher", () => {
    const next = resolveAutoDerive(
      OLD_RULE,
      [easy(), savedRace("h", 1200, true)],
      NOW
    );
    expect(next?.runFitness?.vdot).toBeGreaterThan(44.5);
  });

  it("a runner with no benchmark gets one from a hot run: nothing is lowered", () => {
    const next = resolveAutoDerive(null, [savedRace("h", 1500, true)], NOW);
    expect(next?.runFitness?.pendingConfirmation).toBe(true);
    expect(next?.effort?.hotDay).toBe(true);
  });
});

describe("heatHoldsBenchmark", () => {
  const effort = (hotDay?: boolean) => ({
    kind: "race" as const,
    distanceM: 5000,
    timeS: 1500,
    ...(hotDay ? { hotDay } : {}),
  });

  it("holds only a hot effort under the benchmark", () => {
    expect(heatHoldsBenchmark({ effort: effort(true), vdot: 38 }, 44)).toBe(
      true
    );
    expect(heatHoldsBenchmark({ effort: effort(true), vdot: 46 }, 44)).toBe(
      false
    );
    expect(heatHoldsBenchmark({ effort: effort(), vdot: 38 }, 44)).toBe(false);
    expect(heatHoldsBenchmark({ effort: effort(true), vdot: 38 }, 0)).toBe(
      false
    );
  });
});
