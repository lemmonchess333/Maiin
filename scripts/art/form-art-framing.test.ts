import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FORM_ART_FRAMING } from "../../src/lib/formArtFraming";
import { isFormArtQuarantined } from "../../src/lib/formArtQuarantine";
import { APPROVED_FORM_ART_RELEASES } from "../../src/lib/formArtReleases.data";

const framesRoot = fileURLToPath(
  new URL("../../public/form-frames/", import.meta.url)
);

describe("fixed six-frame cameras", () => {
  it("only enlarges released artwork that is actually shown", () => {
    for (const [id, camera] of Object.entries(FORM_ART_FRAMING)) {
      expect(APPROVED_FORM_ART_RELEASES, id).toHaveProperty(id);
      expect(isFormArtQuarantined(id), id).toBe(false);
      expect(camera.scale, id).toBeGreaterThanOrEqual(1.1);
    }
  });

  it("keeps visible anatomy and equipment inside the stage in every frame", async () => {
    for (const [id, camera] of Object.entries(FORM_ART_FRAMING)) {
      let sourceSize: string | undefined;
      for (let frame = 1; frame <= 6; frame += 1) {
        const file = path.join(framesRoot, id, `${frame}.webp`);
        const { data, info } = await sharp(file)
          .resize({ width: 640, height: 640, fit: "inside" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const size = `${info.width}x${info.height}`;
        sourceSize ??= size;
        expect(size, `${id} frame ${frame} changes canvas size`).toBe(
          sourceSize
        );

        const background = [data[0], data[1], data[2]];
        let minX = info.width;
        let minY = info.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < info.height; y += 1) {
          for (let x = 0; x < info.width; x += 1) {
            const offset = (y * info.width + x) * 4;
            if (data[offset + 3] < 16) continue;
            const contrast = Math.max(
              Math.abs(data[offset] - background[0]),
              Math.abs(data[offset + 1] - background[1]),
              Math.abs(data[offset + 2] - background[2])
            );
            if (contrast < 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        expect(maxX, `${id} frame ${frame} has no visible pixels`).toBeGreaterThanOrEqual(0);

        // object-contain in a square stage, then the same CSS camera for all
        // frames. A 3% reserve also catches future artwork touching the edge.
        const fittedWidth = info.width / Math.max(info.width, info.height);
        const fittedHeight = info.height / Math.max(info.width, info.height);
        const left = (1 - fittedWidth) / 2;
        const top = (1 - fittedHeight) / 2;
        const box = {
          x0: left + (minX / info.width) * fittedWidth,
          x1: left + ((maxX + 1) / info.width) * fittedWidth,
          y0: top + (minY / info.height) * fittedHeight,
          y1: top + ((maxY + 1) / info.height) * fittedHeight,
        };
        const fitted = {
          x0: 0.5 + camera.scale * (box.x0 - 0.5) + camera.x,
          x1: 0.5 + camera.scale * (box.x1 - 0.5) + camera.x,
          y0: 0.5 + camera.scale * (box.y0 - 0.5) + camera.y,
          y1: 0.5 + camera.scale * (box.y1 - 0.5) + camera.y,
        };
        for (const [edge, value] of Object.entries(fitted)) {
          expect(value, `${id} frame ${frame} ${edge}`).toBeGreaterThan(0.03);
          expect(value, `${id} frame ${frame} ${edge}`).toBeLessThan(0.97);
        }
      }
    }
  }, 30_000);
});
