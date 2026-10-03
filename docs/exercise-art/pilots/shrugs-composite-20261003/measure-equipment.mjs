// Diagnostic screen-space cap segmentation, not physical dimension certification.
import sharp from "sharp";
import { writeFileSync } from "node:fs";
const root = "docs/exercise-art/pilots/shrugs-composite-20261003";
const frames = [];
for (const frame of [1, 2, 3]) {
  const data = await sharp(`${root}/frames/${frame}.png`)
    .removeAlpha()
    .raw()
    .toBuffer();
  const caps = {};
  for (const [name, left, right] of [
    ["screenLeftFrontCap", 230, 345],
    ["screenRightFrontCap", 545, 650],
  ]) {
    const top = 620,
      bottom = 840,
      w = right - left,
      h = bottom - top,
      mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = ((y + top) * 1024 + x + left) * 3;
        const rgb = [data[i], data[i + 1], data[i + 2]],
          hi = Math.max(...rgb),
          lo = Math.min(...rgb);
        mask[y * w + x] = lo > 25 && hi < 185 && hi - lo < 30 ? 1 : 0;
      }
    // Erode away thin anatomy outlines that otherwise attach to the cap.
    const original = mask.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let keep = true;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (
              x + dx < 0 ||
              y + dy < 0 ||
              x + dx >= w ||
              y + dy >= h ||
              !original[(y + dy) * w + x + dx]
            )
              keep = false;
        mask[y * w + x] = keep ? 1 : 0;
      }
    let best = [];
    for (let i = 0; i < mask.length; i++)
      if (mask[i]) {
        const q = [i];
        mask[i] = 0;
        for (let k = 0; k < q.length; k++) {
          const p = q[k],
            x = p % w,
            y = Math.floor(p / w);
          for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ])
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) {
              mask[ny * w + nx] = 0;
              q.push(ny * w + nx);
            }
        }
        if (q.length > best.length) best = q;
      }
    const xs = best.map((i) => i % w),
      ys = best.map((i) => Math.floor(i / w));
    caps[name] = {
      x: left + Math.min(...xs),
      y: top + Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs) + 1,
      height: Math.max(...ys) - Math.min(...ys) + 1,
      pixels: best.length,
    };
  }
  frames.push({ frame, caps });
}
const result = {
  releaseApproved: false,
  method:
    "Largest 4-connected neutral-grey component after 5x5 erosion in fixed front-cap ROIs: all RGB channels >25 and <185, channel spread <30. Coordinates and footprint depend on shading, outline and ROI clipping; not a physical dumbbell measurement.",
  frames,
};
writeFileSync(
  `${root}/equipment-diagnostic.json`,
  JSON.stringify(result, null, 2) + "\n"
);
console.log(JSON.stringify(result, null, 2));
