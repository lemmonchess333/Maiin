// @vitest-environment jsdom
/**
 * Pgm8 R1: the runs a benchmark may be derived from, efforts only. jsdom for
 * the one case that reads this phone's offline queue.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  benchmarkEffortOf,
  benchmarkEfforts,
  type EffortRun,
} from "../benchmarkEfforts";
import { parseSavedRun, withQueuedRuns } from "../savedRuns";
import { queueDurableWrite } from "../offlineQueue";

const at = new Date("2026-10-01T08:00:00Z");

const run = (over: Partial<EffortRun> = {}): EffortRun => ({
  id: "r",
  distance: 5000,
  duration: 1500,
  avgPace: 300,
  activityType: "race",
  isInvalid: false,
  savedAnyway: false,
  completedAt: at,
  ...over,
});

const tempo = (over: Partial<EffortRun> = {}) =>
  run({
    activityType: "tempo",
    distance: 5500,
    duration: 1800,
    avgPace: 327,
    workPortion: { seconds: 1200, meters: 4000 },
    ...over,
  });

describe("benchmarkEffortOf", () => {
  it("reads a race whole, with the run it came from", () => {
    expect(benchmarkEffortOf(run())).toEqual({
      kind: "race",
      distanceM: 5000,
      timeS: 1500,
      id: "r",
      completedAt: at,
    });
  });

  it("reads no race under 2 km", () => {
    expect(
      benchmarkEffortOf(run({ distance: 1600, duration: 400 }))
    ).toBeNull();
    expect(
      benchmarkEffortOf(run({ distance: 2000, duration: 500 }))
    ).not.toBeNull();
  });

  it("reads a tempo by its work segments, not the whole run", () => {
    expect(benchmarkEffortOf(tempo())).toMatchObject({
      kind: "tempo",
      distanceM: 4000,
      timeS: 1200,
    });
  });

  it("reads no tempo without its work recorded, cut short, or pinned to a goal pace", () => {
    expect(benchmarkEffortOf(tempo({ workPortion: null }))).toBeNull();
    expect(
      benchmarkEffortOf(tempo({ workPortion: { seconds: 300, meters: 1000 } }))
    ).toBeNull();
    expect(benchmarkEffortOf(tempo({ workPacePinned: true }))).toBeNull();
    // Ten minutes of work is enough.
    expect(
      benchmarkEffortOf(tempo({ workPortion: { seconds: 600, meters: 2000 } }))
    ).not.toBeNull();
  });

  it("never reads an easy, long, interval, free or guided run, work segments or not", () => {
    for (const activityType of [
      "easy",
      "long",
      "intervals",
      "freerun",
      "guided",
    ]) {
      expect(
        benchmarkEffortOf(
          run({
            activityType,
            workPortion: { seconds: 1200, meters: 4000 },
          })
        )
      ).toBeNull();
    }
    expect(benchmarkEffortOf(run())).not.toBeNull();
  });

  it("reads nothing the figures can't vouch for: a typed distance, an invalid run", () => {
    expect(benchmarkEffortOf(run({ activityType: "treadmill" }))).toBeNull();
    expect(benchmarkEffortOf(run({ activityType: "manual" }))).toBeNull();
    expect(benchmarkEffortOf(run({ isInvalid: true }))).toBeNull();
    expect(benchmarkEffortOf(run({ savedAnyway: true }))).toBeNull();
    expect(benchmarkEffortOf(run())).not.toBeNull();
  });
});

describe("benchmarkEfforts", () => {
  it("keeps the efforts, in order", () => {
    const efforts = benchmarkEfforts([
      run({ id: "easy", activityType: "easy" }),
      tempo({ id: "tempo" }),
      run({ id: "race" }),
    ]);
    expect(efforts.map((e) => e.id)).toEqual(["tempo", "race"]);
  });
});

/* What decides an effort is read from the saved run as `runDocument`
   writes it. */
describe("the saved run, read back", () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    completedAt: at,
    date: "2026-10-01",
    distance: 5500,
    duration: 1800,
    avgPace: 327,
    activityType: "tempo",
    isInvalid: false,
    savedAnyway: false,
    workPortion: { seconds: 1200, meters: 4000 },
    runConfig: {
      activityType: "tempo",
      segments: [
        { type: "warmup", target: { kind: "duration", seconds: 300 } },
        {
          type: "moderate",
          target: { kind: "duration", seconds: 1200 },
          paceTarget: 300,
          pacePinned: true,
        },
      ],
    },
    ...over,
  });

  it("carries the work portion and whether its pace was pinned", () => {
    const saved = parseSavedRun("t", stored())!;
    expect(saved.workPortion).toEqual({ seconds: 1200, meters: 4000 });
    expect(saved.workPacePinned).toBe(true);
    expect(benchmarkEffortOf(saved)).toBeNull();

    const unpinned = parseSavedRun(
      "t",
      stored({
        runConfig: {
          activityType: "tempo",
          segments: [
            { type: "moderate", target: { kind: "duration", seconds: 1200 } },
          ],
        },
      })
    )!;
    expect(unpinned.workPacePinned).toBe(false);
    expect(benchmarkEffortOf(unpinned)).toMatchObject({ kind: "tempo" });
  });

  it("reads a missing or malformed work portion as none", () => {
    expect(parseSavedRun("a", stored({ workPortion: null }))!.workPortion).toBe(
      null
    );
    expect(
      parseSavedRun("b", stored({ workPortion: { seconds: "1200" } }))!
        .workPortion
    ).toBeNull();
    const old = stored();
    delete (old as Record<string, unknown>).workPortion;
    delete (old as Record<string, unknown>).runConfig;
    const legacy = parseSavedRun("c", old)!;
    expect(legacy.workPortion).toBeNull();
    expect(legacy.workPacePinned).toBe(false);
  });

  describe("with a write queued on this phone", () => {
    afterEach(() => window.localStorage.clear());

    it("keeps a pinned tempo pinned when the write didn't touch its config", () => {
      const loaded = parseSavedRun("t", stored())!;
      queueDurableWrite(
        "runner",
        "users/runner/runs",
        "t",
        { relativeEffort: "harder" },
        true
      );
      const [merged] = withQueuedRuns("runner", [loaded], { all: true });
      expect(merged.relativeEffort).toBe("harder");
      expect(merged.workPortion).toEqual({ seconds: 1200, meters: 4000 });
      expect(merged.workPacePinned).toBe(true);
      expect(benchmarkEffortOf(merged)).toBeNull();
    });
  });
});
