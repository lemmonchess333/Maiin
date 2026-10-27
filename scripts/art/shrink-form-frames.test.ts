/**
 * The build's re-save of the exercise pictures (Ship1): a lossless frame
 * ships as lossy WebP, a frame bigger than its box is fitted inside it, a
 * lossy one that fits ships as it is, and the cache hands back the same
 * bytes without saving again.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORM_FRAME_BOX_POINTS,
  FORM_FRAME_MAX_SIDE,
  isLosslessWebp,
  shrinkFormFrames,
  shrunkFormFrame,
} from "./shrink-form-frames";
import { webpSize } from "./webp-size";

/** A painted-looking frame: soft gradients and fine grain, which is what
 *  makes the reviewed frames large when saved lossless. */
async function frame(
  lossless: boolean,
  width = 384,
  height = 256
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 7;
  const grain = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return (seed >> 16) % 24;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const inside =
        (x - width / 2) ** 2 + (y - height / 2) ** 2 < (height / 3) ** 2;
      pixels[i] = (inside ? 190 : 40 + (x >> 2)) + grain();
      pixels[i + 1] = (inside ? 140 : 60 + (y >> 2)) + grain();
      pixels[i + 2] = (inside ? 110 : 90) + grain();
    }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .webp(lossless ? { lossless: true } : { quality: 80 })
    .toBuffer();
}

describe("isLosslessWebp", () => {
  it("tells a lossless WebP from a lossy one and from anything else", async () => {
    expect(isLosslessWebp(await frame(true))).toBe(true);
    expect(isLosslessWebp(await frame(false))).toBe(false);
    expect(isLosslessWebp(Buffer.from("not a picture"))).toBe(false);
  });
});

describe("shrunkFormFrame", () => {
  it("re-saves a lossless frame lossy and smaller, on the same canvas", async () => {
    const source = await frame(true);
    const shipped = await shrunkFormFrame(source);
    expect(shipped).not.toBeNull();
    expect(isLosslessWebp(shipped!)).toBe(false);
    expect(shipped!.length).toBeLessThan(source.length * 0.9);
    expect(webpSize(shipped!)).toEqual(webpSize(source));
  });

  it("leaves a lossy frame that fits its box as it is", async () => {
    expect(await shrunkFormFrame(await frame(false))).toBeNull();
  });

  it("fits a frame bigger than its box inside it, keeping its shape", async () => {
    for (const lossless of [true, false]) {
      const shipped = await shrunkFormFrame(await frame(lossless, 1600, 800));
      expect(shipped, lossless ? "lossless" : "lossy").not.toBeNull();
      expect(webpSize(shipped!)).toEqual([
        FORM_FRAME_MAX_SIDE,
        FORM_FRAME_MAX_SIDE / 2,
      ]);
    }
  });
});

describe("the box a frame is fitted to", () => {
  it("is the maximum square stage the form guide draws a frame in, at 3x", () => {
    const component = readFileSync(
      fileURLToPath(
        new URL("../../src/components/ExerciseFormFrames.tsx", import.meta.url)
      ),
      "utf8"
    );
    const box = `aspect-square w-full max-w-[${FORM_FRAME_BOX_POINTS}px]`;
    expect(component).toContain(box);
    expect(FORM_FRAME_MAX_SIDE).toBe(FORM_FRAME_BOX_POINTS * 3);
  });
});

describe("shrinkFormFrames", () => {
  it("re-saves an output folder in place, and the cache gives the same bytes", async () => {
    const root = mkdtempSync(join(tmpdir(), "form-frames-"));
    const out = join(root, "form-frames");
    const cacheDir = join(root, "cache");
    mkdirSync(join(out, "squat"), { recursive: true });
    const lossless = await frame(true);
    const lossy = await frame(false);
    writeFileSync(join(out, "squat", "1.webp"), lossless);
    writeFileSync(join(out, "squat", "2.webp"), lossy);

    const first = await shrinkFormFrames(out, { cacheDir });
    expect(first).toMatchObject({ files: 2, shrunk: 1 });
    expect(first.bytesAfter).toBeLessThan(first.bytesBefore);
    const shipped = readFileSync(join(out, "squat", "1.webp"));
    expect(isLosslessWebp(shipped)).toBe(false);
    expect(readFileSync(join(out, "squat", "2.webp"))).toEqual(lossy);

    // A fresh build copies the sources in again; the cache answers.
    writeFileSync(join(out, "squat", "1.webp"), lossless);
    const cached = readdirSync(cacheDir).length;
    const second = await shrinkFormFrames(out, { cacheDir });
    expect(second).toEqual(first);
    expect(readdirSync(cacheDir)).toHaveLength(cached);
    expect(readFileSync(join(out, "squat", "1.webp"))).toEqual(shipped);
  });

  it("does nothing where a build has no frames", async () => {
    const root = mkdtempSync(join(tmpdir(), "form-frames-"));
    expect(await shrinkFormFrames(join(root, "missing"))).toEqual({
      files: 0,
      shrunk: 0,
      bytesBefore: 0,
      bytesAfter: 0,
    });
  });
});
