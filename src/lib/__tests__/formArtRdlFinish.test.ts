import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import batch from "../../../docs/exercise-art/BATCH_REVIEW_MANIFEST.json";

// This is the inspected original upright pose, not a generated replacement.
// Pin it independently: making both endpoints reuse the early hinge must fail.
const UPRIGHT_SHA256 =
  "4c8cf219385b9c11d0916c3f38891cae6438a5c116584eb9564551ecfb304f60";
const rdl = batch.completeDraftSets.find(
  (set) => set.exerciseId === "romanian-deadlift",
);
if (!rdl) throw new Error("Romanian deadlift draft is missing");
const frames = rdl.frames;
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("Romanian deadlift finish-standing frame", () => {
  it("ends upright at a separate sixth path, rather than the early hinge", () => {
    expect(frames).toHaveLength(6);
    expect(new Set(frames.map((frame) => frame.path)).size).toBe(6);
    expect(frames[5].path).toBe(
      "docs/exercise-art/pilots/batch-04/romanian-deadlift/6-return.png",
    );
    expect(frames[5].frame).toBe(6);
    expect(frames[5].caption).toBe("FINISH STANDING 6/6");
    expect(frames[5].cue).toBe("Return tall without leaning backwards.");
    expect(frames[5].progress).toBe(0);
    expect(frames[5].reusedFrom).toBe(1);
    expect(frames[5].sha256).toBe(UPRIGHT_SHA256);
    expect(frames[5].sha256).not.toBe(frames[1].sha256);
  });

  it("preserves the original upright pixels, dimensions and 6-to-1 endpoint", () => {
    const first = readFileSync(frames[0].path);
    const last = readFileSync(frames[5].path);
    expect(digest(first)).toBe(UPRIGHT_SHA256);
    expect(digest(last)).toBe(UPRIGHT_SHA256);
    expect(last.equals(first)).toBe(true);
    for (const index of [0, 5]) {
      const frame = frames[index];
      const data = readFileSync(frame.path);
      expect(data.length).toBe(frame.bytes);
      expect(data.length).toBe(663740);
      expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([1024, 1536]);
      expect(frame.dimensions).toEqual([1024, 1536]);
    }
  });

  it("keeps the intervening hinge poses rather than collapsing the rep", () => {
    expect(frames.map((frame) => frame.progress)).toEqual([0, 0.25, 0.6, 1, 0.6, 0]);
    expect(new Set(frames.map((frame) => frame.sha256)).size).toBe(4);
    expect(frames[3].sha256).not.toBe(UPRIGHT_SHA256);
    expect(frames[4].reusedFrom).toBe(3);
    expect(frames[4].sha256).toBe(frames[2].sha256);
  });
});
