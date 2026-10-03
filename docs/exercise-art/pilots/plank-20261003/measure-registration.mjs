// Read-only native-pixel measurements; no image modification or auto-approval.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = "docs/exercise-art/pilots/plank-20261003";
const points = {
  nearFist: { x: 164, y: 695 },
  nearElbow: { x: 455, y: 688 },
  farFist: { x: 79, y: 678 },
  farElbow: { x: 270, y: 631 },
};
const images = await Promise.all(
  [1, 3].map(async (frame) => {
    const path = `${root}/${frame}.png`;
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
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
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
      nearForearmSupportSpan: span("nearFist", "nearElbow"),
      farForearmSupportSpan: span("farFist", "farElbow"),
    },
  };
});
const result = {
  method:
    "31x31 RGB setup patches; +/-5px integer translation minimizing absolute channel differences. Four named arm contacts and two forearm support spans. Patches respond to shading/redraw differences; this is not anatomy certification. No image edits.",
  selectedPoseOrder: [1, 1, 3, 3, 3, 1],
  intentionalMovement:
    "Knees lift and shoes pivot/translate during entry; only arm support contacts are fixed throughout. Hold slots reuse one image exactly.",
  poses,
};
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(result, null, 2) + "\n"
);
console.log(JSON.stringify(result, null, 2));
