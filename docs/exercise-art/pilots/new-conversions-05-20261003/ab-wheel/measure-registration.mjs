// Read-only native-pixel measurements; no image modification or auto-approval.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = "docs/exercise-art/pilots/new-conversions-05-20261003/ab-wheel";
const points = {
  padNearCorner: { x: 1197, y: 831 },
  padLeftCorner: { x: 1001, y: 800 },
  nearKnee: { x: 1200, y: 790 },
  farHeel: { x: 1333, y: 691 },
};
const images = await Promise.all(
  [1, 2, 3].map(async (frame) => {
    const path = `${root}/frames/${frame}.png`;
    const source = readFileSync(path);
    const { data, info } = await sharp(source)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 1536 || info.height !== 1024)
      throw new Error(`Unexpected canvas: ${path}`);
    return {
      frame,
      path,
      sha256: createHash("sha256").update(source).digest("hex"),
      data,
    };
  })
);
const poses = images.map((image) => {
  const anchors = {};
  const matching = {};
  for (const [name, point] of Object.entries(points)) {
    let best = { error: Infinity, dx: 0, dy: 0 };
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        let error = 0;
        for (let y = point.y - 15; y <= point.y + 15; y++) {
          for (let x = point.x - 15; x <= point.x + 15; x++) {
            for (let c = 0; c < 3; c++) {
              error += Math.abs(
                images[0].data[(y * 1536 + x) * 3 + c] -
                  image.data[((y + dy) * 1536 + x + dx) * 3 + c]
              );
            }
          }
        }
        if (error < best.error) best = { error, dx, dy };
      }
    }
    anchors[name] = { x: point.x + best.dx, y: point.y + best.dy };
    matching[name] = {
      dx: best.dx,
      dy: best.dy,
      meanChannelDifference: best.error / (31 * 31 * 3),
    };
  }
  const span = (a, b) =>
    Math.hypot(anchors[a].x - anchors[b].x, anchors[a].y - anchors[b].y);
  return {
    frame: image.frame,
    path: image.path,
    sha256: image.sha256,
    anchors,
    matching,
    invariantDimensions: {
      firstSupportSpan: span("padNearCorner", "padLeftCorner"),
      secondSupportSpan: span("nearKnee", "farHeel"),
    },
  };
});
const result = {
  method:
    "Read-only 31x31 RGB patches, +/-20px integer search against pose 1. Drift diagnoses redraws, not anatomical correctness; no image edits or automatic approval.",
  selectedPoseOrder: [1, 2, 3, 3, 2, 1],
  poses,
};
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(result, null, 2) + "\n"
);
console.log(JSON.stringify(result, null, 2));
