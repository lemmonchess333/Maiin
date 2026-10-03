import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
const root = "docs/exercise-art/pilots/shrugs-rigid-20261003";
const composition = JSON.parse(readFileSync(`${root}/composition.json`));
const images = await Promise.all(
  [1, 2, 3].map((n) =>
    sharp(`${root}/frames/${n}.png`).removeAlpha().raw().toBuffer()
  )
);
const patches = [
  { name: "farFrontFace", layer: "far", x: 25, y: 35, size: 25 },
  { name: "nearFrontFace", layer: "near", x: 25, y: 35, size: 30 },
  { name: "nearRearFace", layer: "near", x: 170, y: 35, size: 25 },
];
const measurements = [];
for (let pose = 0; pose < 3; pose++)
  for (const patch of patches) {
    const layer = composition.layers.find((l) => l.name === patch.layer),
      [dx, dy] = layer.shifts[pose];
    const x = layer.origin[0] + patch.x,
      y = layer.origin[1] + patch.y;
    let differences = 0,
      max = 0;
    for (let yy = 0; yy < patch.size; yy++)
      for (let xx = 0; xx < patch.size; xx++)
        for (let c = 0; c < 3; c++) {
          const a = images[0][((y + yy) * 1024 + x + xx) * 3 + c],
            b = images[pose][((y + dy + yy) * 1024 + x + dx + xx) * 3 + c];
          if (a !== b) differences++;
          max = Math.max(max, Math.abs(a - b));
        }
    if (differences)
      throw Error(
        `${patch.name} pose ${pose + 1}: ${differences} changed channels`
      );
    measurements.push({
      pose: pose + 1,
      patch: patch.name,
      x: x + dx,
      y: y + dy,
      size: patch.size,
      channelDifferences: differences,
      maxDifference: max,
    });
  }
writeFileSync(
  `${root}/rigidity.json`,
  JSON.stringify(
    {
      method:
        "Exact translated RGB patch comparison for three unoccluded weight faces. Equipment-layer dimensions and hashes are fixed by the compositor. Occluded far rear head is certified only by shared layer construction and visual review, not a visible-patch claim.",
      measurements,
    },
    null,
    2
  ) + "\n"
);
console.log("Nine weight-face patch comparisons passed exactly.");
