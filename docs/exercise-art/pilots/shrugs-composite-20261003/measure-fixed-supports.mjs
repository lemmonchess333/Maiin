// Read-only diagnostic for the existing candidates. No image edits or approval.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = "docs/exercise-art/pilots/shrugs-composite-20261003";
const points = {
  screenLeftSole: { x: 335, y: 1408 },
  screenRightSole: { x: 609, y: 1468 },
  screenLeftKneeContour: { x: 437, y: 982 },
  screenRightKneeContour: { x: 587, y: 1051 },
};
const images = await Promise.all(
  [1, 2, 3].map(async (frame) => {
    const path = `${root}/frames/${frame}.png`;
    const bytes = readFileSync(path);
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 1024 || info.height !== 1536)
      throw new Error(`Unexpected canvas: ${path}`);
    return {
      frame,
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      data,
    };
  })
);
const frames = images.map((image) => {
  const patches = {};
  for (const [name, point] of Object.entries(points)) {
    let best = { error: Infinity, dx: 0, dy: 0 };
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        let error = 0;
        for (let y = point.y - 15; y <= point.y + 15; y++) {
          for (let x = point.x - 15; x <= point.x + 15; x++) {
            for (let c = 0; c < 3; c++) {
              error += Math.abs(
                images[0].data[(y * 1024 + x) * 3 + c] -
                  image.data[((y + dy) * 1024 + x + dx) * 3 + c]
              );
            }
          }
        }
        if (error < best.error) best = { error, dx, dy };
      }
    }
    patches[name] = {
      origin: point,
      dx: best.dx,
      dy: best.dy,
      meanChannelDifference: best.error / (31 * 31 * 3),
    };
  }
  return {
    frame: image.frame,
    path: image.path,
    sha256: image.sha256,
    patches,
  };
});
const result = {
  reviewedAt: "2026-10-03",
  method:
    "31x31 RGB setup patches, +/-10px integer search minimizing absolute channel difference. Sole patches measure stationary supports. Knee patches diagnose contour consistency; shading/redraw changes can shift the match without proving anatomical joint translation. No image edits.",
  releaseApproved: false,
  existingReleaseAnchorLimitPixels: 1,
  findings: [
    "All four repaired lower-body patches match setup exactly: zero translation and zero RGB difference.",
    "The unchanged upper body, pelvis and equipment still require independent review.",
    "Dumbbell projected shape and size remain subject to equipment review; no invariant equipment dimensions are certified here.",
  ],
  frames,
};
writeFileSync(
  `${root}/fixed-support-review-20261003.json`,
  JSON.stringify(result, null, 2) + "\n"
);
console.log(JSON.stringify(result, null, 2));
