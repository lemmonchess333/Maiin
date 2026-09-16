import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import batch from "../../../docs/exercise-art/BATCH_REVIEW_MANIFEST.json";
import measurements from "../../../docs/exercise-art/pilots/batch-04/db-row/composite/measurements.json";

const cases = [
  {
    id: "db-row",
    hash: "d39a9faaa0f6a9de3ec516f1b42f594fd64d555aa8aa36994d17a782344d4aec",
    dimensions: [1536, 1024],
    uniquePoses: 3,
    caption: "RETURN TO HANG 6/6",
  },
  {
    id: "db-shoulder-press",
    hash: "99b3565ba45ba0b0ec02cf3354451871c87425e19f9771c3f2e1e1b9b09ba8aa",
    dimensions: [1024, 1536],
    uniquePoses: 4,
    caption: "RETURN TO SHOULDERS 6/6",
  },
  {
    id: "incline-db-press",
    hash: "767371f8698295af102eb45c1e3bc8dbff6509ab99dc6ca89f7034db2251e059",
    dimensions: [1536, 1024],
    uniquePoses: 4,
    caption: "FINISH PRESS 6/6",
  },
];
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");

// These are source-selection contracts, not anatomy or full-range approval.
describe.each(cases)("$id draft endpoints", ({ id, hash, dimensions, uniquePoses, caption }) => {
  const set = batch.completeDraftSets.find((candidate) => candidate.exerciseId === id);
  if (!set) throw new Error(`Missing draft: ${id}`);

  it("returns to the independently pinned original endpoint", () => {
    const first = readFileSync(set.frames[0].path);
    const last = readFileSync(set.frames[5].path);
    expect(digest(first)).toBe(hash);
    expect(digest(last)).toBe(hash);
    expect(last.equals(first)).toBe(true);
    expect(set.frames[5].sha256).toBe(hash);
    expect(set.frames[5].reusedFrom).toBe(1);
    expect(set.frames[5].progress).toBe(0);
    expect(set.frames[5].caption).toBe(caption);
    expect([last.readUInt32BE(16), last.readUInt32BE(20)]).toEqual(dimensions);
  });

  it("keeps six native paths and real intermediate poses with correct metadata", () => {
    expect(set.frames).toHaveLength(6);
    expect(new Set(set.frames.map((frame) => frame.path)).size).toBe(6);
    expect(new Set(set.frames.map((frame) => frame.sha256)).size).toBe(uniquePoses);
    expect(set.status).toBe("draft-awaiting-review");
    expect(batch.releaseApproved).toBe(false);
    for (const [index, frame] of set.frames.entries()) {
      const data = readFileSync(frame.path);
      expect(frame.frame).toBe(index + 1);
      expect(frame.caption.endsWith(` ${index + 1}/6`)).toBe(true);
      expect(frame.cue.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(frame.progress)).toBe(true);
      expect(frame.progress).toBeGreaterThanOrEqual(0);
      expect(frame.progress).toBeLessThanOrEqual(1);
      expect(data.length).toBe(frame.bytes);
      expect(digest(data)).toBe(frame.sha256);
      expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual(dimensions);
      expect(frame.dimensions).toEqual(dimensions);
      if (frame.reusedFrom !== null) {
        expect(frame.reusedFrom).toBeLessThan(frame.frame);
        expect(set.frames[frame.reusedFrom - 1].sha256).toBe(frame.sha256);
      }
    }
  }, 10_000);
});

it("keeps the row's rejected extreme out of selection without claiming full-range approval", () => {
  const row = batch.completeDraftSets.find((set) => set.exerciseId === "db-row")!;
  const early = "a3b650b2f3e96a60fe774d40325334ac339eda862c53402b468a81d001aee2a4";
  const middle = "69cdbe337e0458c373d9c819f2ceaeb6536329eec1df24bdaf342a83973e7d96";
  const rejected = "501f0fd70bdf5f179d272f2bcbf63c3fac62e970faeee05905fd266e0dcee232";
  expect(row.frames.map((frame) => frame.sha256)).toEqual([
    cases[0].hash, early, middle, middle, early, cases[0].hash,
  ]);
  expect(row.frames.some((frame) => frame.sha256 === rejected)).toBe(false);
  expect(digest(readFileSync(
    "docs/exercise-art/pilots/batch-04/db-row/composite/rejected-twisted-top.png",
  ))).toBe(rejected);
  expect(row.frames[3].caption).toBe("BRIEF HOLD 4/6");
  expect(row.frames.map((frame) => frame.progress)).toEqual([0, 125 / 237, 1, 1, 125 / 237, 0]);
  expect(measurements.selectedPoseOrder).toEqual([0, 1, 2, 2, 1, 0]);
  expect(measurements.selectedLoadRisePixels).toEqual([0, 125, 237, 237, 125, 0]);
  expect(measurements.frames.map((frame) => frame.sha256))
    .toEqual(row.frames.map((frame) => frame.sha256));
  expect(measurements.fullRangeEndpointApproved).toBe(false);
  expect(measurements.strictVisualApproval).toBe(false);
  expect(row.reviewFindings.some((finding) => finding.includes("reduced-range"))).toBe(true);
});
