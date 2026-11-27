import { describe, expect, it } from "vitest";
import {
  buildManualLapSplits,
  buildSegmentLapSplits,
  lapPaceSecondsPerKm,
  parseRunLapSplits,
} from "../runLaps";
import type { SessionSegment } from "../runSegments";

const SEGMENTS: SessionSegment[] = [
  {
    type: "warmup",
    label: "10 min warm-up",
    instruction: "Easy jog",
    target: { kind: "duration", seconds: 600 },
  },
  {
    type: "hard",
    label: "Rep 1 of 2 · 1K",
    instruction: "Run hard",
    target: { kind: "distance", meters: 1000 },
    rep: 1,
    totalReps: 2,
  },
  {
    type: "recovery",
    label: "2 min recovery",
    instruction: "Walk or jog",
    target: { kind: "duration", seconds: 120 },
  },
  {
    type: "hard",
    label: "Rep 2 of 2 · 1K",
    instruction: "Run hard",
    target: { kind: "distance", meters: 1000 },
    rep: 2,
    totalReps: 2,
  },
];

describe("runLaps", () => {
  it("computes pace per km only when distance clears minimum threshold", () => {
    expect(lapPaceSecondsPerKm(1000, 240)).toBe(240);
    expect(lapPaceSecondsPerKm(400, 96)).toBe(240);
    expect(lapPaceSecondsPerKm(10, 120)).toBeNull();
    expect(lapPaceSecondsPerKm(1000, 0)).toBeNull();
  });

  it("builds per-segment lap splits from structured anchors", () => {
    const laps = buildSegmentLapSplits(
      SEGMENTS,
      [
        { elapsed: 0, distance: 0 },
        { elapsed: 600, distance: 1500 },
        { elapsed: 840, distance: 2500 },
        { elapsed: 960, distance: 2510 },
      ],
      1210,
      3510
    );

    expect(laps).toHaveLength(4);
    expect(laps[0]).toMatchObject({
      index: 1,
      label: "10 min warm-up",
      kind: "warmup",
      distanceMeters: 1500,
      durationSeconds: 600,
      paceSecondsPerKm: 400,
    });
    expect(laps[1]).toMatchObject({
      index: 2,
      label: "Rep 1 of 2 · 1K",
      kind: "work",
      distanceMeters: 1000,
      durationSeconds: 240,
      paceSecondsPerKm: 240,
    });
    // Standing recovery (10 m in 120 s) carries null pace instead of 200:00 /km
    expect(laps[2].kind).toBe("recovery");
    expect(laps[2].paceSecondsPerKm).toBeNull();
    expect(laps[3]).toMatchObject({
      index: 4,
      kind: "work",
      distanceMeters: 1000,
      durationSeconds: 250,
      paceSecondsPerKm: 250,
    });
  });

  it("builds manual lap splits including the closing lap to finish", () => {
    expect(buildManualLapSplits([], 600, 2000)).toEqual([]);

    const laps = buildManualLapSplits(
      [
        { elapsed: 180, distance: 800 },
        { elapsed: 420, distance: 1800 },
      ],
      600,
      2500
    );

    expect(laps).toEqual([
      {
        index: 1,
        label: "Lap 1",
        kind: "manual",
        distanceMeters: 800,
        durationSeconds: 180,
        paceSecondsPerKm: 225,
      },
      {
        index: 2,
        label: "Lap 2",
        kind: "manual",
        distanceMeters: 1000,
        durationSeconds: 240,
        paceSecondsPerKm: 240,
      },
      {
        index: 3,
        label: "Lap 3",
        kind: "manual",
        distanceMeters: 700,
        durationSeconds: 180,
        paceSecondsPerKm: 257,
      },
    ]);
  });

  it("drops a tiny accidental trailing slice after the final manual lap", () => {
    const laps = buildManualLapSplits(
      [{ elapsed: 240, distance: 1000 }],
      241,
      1005
    );
    expect(laps).toHaveLength(1);
    expect(laps[0].distanceMeters).toBe(1000);
  });

  it("safely parses persisted lapSplits and ignores malformed entries", () => {
    expect(parseRunLapSplits(undefined)).toEqual([]);
    expect(
      parseRunLapSplits([
        {
          index: 1,
          label: "Rep 1",
          kind: "work",
          distanceMeters: 400,
          durationSeconds: 92,
          paceSecondsPerKm: 230,
        },
        { bad: true },
        {
          label: "Zero",
          kind: "manual",
          distanceMeters: 0,
          durationSeconds: 0,
        },
      ])
    ).toEqual([
      {
        index: 1,
        label: "Rep 1",
        kind: "work",
        distanceMeters: 400,
        durationSeconds: 92,
        paceSecondsPerKm: 230,
      },
    ]);
  });
});
