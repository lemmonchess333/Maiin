import { describe, expect, it } from "vitest";
import {
  parseSessionPlayerCheckpoint,
  sessionPlayerSignature,
  validateSessionPlayerCheckpoint,
  type SessionPlayerCheckpoint,
} from "../sessionPlayerCheckpoint";
import type { SessionSegment } from "../runSegments";

const segments: SessionSegment[] = [
  {
    type: "hard",
    label: "Rep",
    instruction: "Run",
    target: { kind: "distance", meters: 400 },
    rep: 1,
    totalReps: 1,
  },
  {
    type: "recovery",
    label: "Rest",
    instruction: "Recover",
    target: { kind: "duration", seconds: 30 },
  },
];
const checkpoint: SessionPlayerCheckpoint = {
  version: 1,
  signature: sessionPlayerSignature(segments),
  index: 1,
  segmentStarts: [
    { elapsed: 0, distance: 0 },
    { elapsed: 120, distance: 400 },
  ],
};

describe("optional session checkpoints", () => {
  it("ignores cue wording, unit labels and display pace without losing execution identity", () => {
    const relabelled = segments.map((s) => ({
      ...s,
      label: "Imperial label",
      cue: "Another cue",
      paceTarget: 345,
    }));
    expect(
      validateSessionPlayerCheckpoint(checkpoint, relabelled, 135, 450)
    ).toEqual(checkpoint);
  });
  it.each([
    { ...segments[0], type: "easy" as const },
    { ...segments[0], target: { kind: "distance" as const, meters: 500 } },
    { ...segments[0], rep: 2 },
  ])(
    "rejects changed work semantics or a different session target: %j",
    (first) => {
      expect(
        validateSessionPlayerCheckpoint(
          checkpoint,
          [first, segments[1]],
          135,
          450
        )
      ).toBeNull();
    }
  );
  it("rejects a different distance source", () => {
    expect(
      validateSessionPlayerCheckpoint(checkpoint, segments, 135, 450, "manual")
    ).toBeNull();
  });
  it.each([
    { ...checkpoint, version: 2 },
    { ...checkpoint, index: 0.5 },
    {
      ...checkpoint,
      segmentStarts: [
        { elapsed: 1, distance: 0 },
        { elapsed: 120, distance: 400 },
      ],
    },
    {
      ...checkpoint,
      segmentStarts: [
        { elapsed: 0, distance: 0 },
        { elapsed: NaN, distance: 400 },
      ],
    },
    {
      ...checkpoint,
      segmentStarts: [
        { elapsed: 0, distance: 0 },
        { elapsed: 120, distance: Infinity },
      ],
    },
    { ...checkpoint, index: 2 },
  ])("rejects corrupt optional data without throwing: %j", (value) => {
    expect(parseSessionPlayerCheckpoint(value)).toBeNull();
  });
  it("rejects anchors beyond the persisted clock or trace", () => {
    expect(
      validateSessionPlayerCheckpoint(checkpoint, segments, 119, 450)
    ).toBeNull();
    expect(
      validateSessionPlayerCheckpoint(checkpoint, segments, 135, 399)
    ).toBeNull();
  });
  it("rejects a decreasing anchor history", () => {
    expect(
      parseSessionPlayerCheckpoint({
        ...checkpoint,
        index: 2,
        segmentStarts: [
          ...checkpoint.segmentStarts,
          { elapsed: 119, distance: 401 },
        ],
      })
    ).toBeNull();
  });
  it("allows tied anchors from explicitly skipped steps and a terminal boundary", () => {
    const complete = {
      ...checkpoint,
      index: 2,
      segmentStarts: [
        { elapsed: 0, distance: 0 },
        { elapsed: 0, distance: 0 },
        { elapsed: 30, distance: 50 },
      ],
    };
    expect(validateSessionPlayerCheckpoint(complete, segments, 30, 50)).toEqual(
      complete
    );
    expect(
      validateSessionPlayerCheckpoint(
        {
          ...complete,
          index: 3,
          segmentStarts: [
            ...complete.segmentStarts,
            { elapsed: 30, distance: 50 },
          ],
        },
        segments,
        30,
        50
      )
    ).toBeNull();
  });
});
