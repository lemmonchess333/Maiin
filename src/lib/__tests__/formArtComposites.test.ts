import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateFormArtCompositeRelease } from "../formArtComposites";
import { getFormBeats } from "../formGuides";

const current = JSON.parse(
  readFileSync("docs/exercise-art/releases/2026-10-27/man-maker.json", "utf8")
);
const previous = JSON.parse(
  readFileSync("docs/exercise-art/releases/2026-10-04/man-maker.json", "utf8")
);
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

describe("Man Maker's reviewed display composition", () => {
  it("pins the runtime shoe and dumbbell layers to the release record", () => {
    expect(validateFormArtCompositeRelease("man-maker", current)).toEqual([]);
    const shifted = structuredClone(current);
    shifted.displayComposition.layers[0].rect.top = 800;
    expect(validateFormArtCompositeRelease("man-maker", shifted)).toContain(
      "Display composition layer 1 differs from runtime."
    );
    const uncovered = structuredClone(current);
    uncovered.frames[4].anchors.nearSoleChordLeft.y = 780;
    expect(validateFormArtCompositeRelease("man-maker", uncovered)).toContain(
      "Frame 5: fixed anchor nearSoleChordLeft is outside its source layer."
    );
  });

  it("keeps every historical Man Maker WebP at its original approved hash", () => {
    for (const frame of previous.frames)
      expect(hash(`public/${frame.path}`), frame.path).toBe(frame.sha256);
    for (const frame of current.frames)
      expect(hash(`public/${frame.path}`), frame.path).toBe(frame.sha256);
    expect(getFormBeats("man-maker")?.map((beat) => beat.image)).toEqual(
      current.frames.map((frame: { path: string }) => frame.path)
    );
  });

  it("delivers exact lossless pixels from the retained imagegen PNG sources", async () => {
    for (const frame of current.frames.slice(3)) {
      expect(hash(frame.source.path)).toBe(frame.source.sha256);
      const source = await sharp(frame.source.path)
        .removeAlpha()
        .raw()
        .toBuffer();
      const delivered = await sharp(`public/${frame.path}`)
        .removeAlpha()
        .raw()
        .toBuffer();
      expect(delivered.equals(source), frame.path).toBe(true);
    }
  });

  it("measures both planted soles from the displayed fixed-shoe layer", async () => {
    const sourcePath = `public/${current.frames[3].path}`;
    const { data, info } = await sharp(sourcePath)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const chord = (y: number, left: number, right: number) => {
      const bright: number[] = [];
      for (let x = left; x < right; x += 1) {
        const offset = (y * info.width + x) * 3;
        if (Math.min(...data.subarray(offset, offset + 3)) > 140)
          bright.push(x);
      }
      return { x: bright[0], width: bright.at(-1)! - bright[0] + 1 };
    };
    const far = chord(810, 220, 320);
    const near = chord(845, 270, 430);
    expect(far).toEqual({ x: 232, width: 88 });
    expect(near).toEqual({ x: 285, width: 115 });
    for (const frame of current.frames.slice(3, 5)) {
      expect(frame.anchors.farSoleChordLeft).toEqual({ x: far.x, y: 810 });
      expect(frame.anchors.nearSoleChordLeft).toEqual({ x: near.x, y: 845 });
      expect(frame.invariantDimensions.farSoleChordWidth).toBe(far.width);
      expect(frame.invariantDimensions.nearSoleChordWidth).toBe(near.width);
    }
  });
});
