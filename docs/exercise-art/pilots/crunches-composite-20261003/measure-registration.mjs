// Read-only measurements. These do not repair artwork or grant visual approval.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = "docs/exercise-art/pilots/crunches-composite-20261003";
const patches = {
  nearHeelSole: { x: 1140, y: 812 },
  nearToeSole: { x: 1344, y: 829 },
  farToeSole: { x: 1430, y: 758 },
  farHeelSole: { x: 1260, y: 738 },
  pelvisFloor: { x: 816, y: 785 },
};
const images = await Promise.all(
  ["1.png", "2.png", "3.png"].map(async (name) => {
    const path = `${root}/${name}`;
    const bytes = readFileSync(path);
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      data,
      width: info.width,
      height: info.height,
    };
  })
);
const measurements = images.map((image) => {
  if (image.width !== 1536 || image.height !== 1024)
    throw new Error(`Unexpected canvas: ${image.path}`);
  const anchors = {};
  for (const [name, point] of Object.entries(patches)) {
    let best = { error: Infinity, dx: 0, dy: 0 };
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        let error = 0;
        for (let y = point.y - 15; y <= point.y + 15; y++) {
          for (let x = point.x - 15; x <= point.x + 15; x++) {
            for (let c = 0; c < 3; c++) {
              error += Math.abs(
                images[0].data[(y * image.width + x) * 3 + c] -
                  image.data[((y + dy) * image.width + x + dx) * 3 + c]
              );
            }
          }
        }
        if (error < best.error) best = { error, dx, dy };
      }
    }
    anchors[name] = {
      x: point.x + best.dx,
      y: point.y + best.dy,
      dx: best.dx,
      dy: best.dy,
      meanChannelDifference: best.error / (31 * 31 * 3),
    };
  }
  // Head is the first bright object in this ROI; exclude the raised elbow.
  let headTop = null;
  for (let y = 250; y < 500 && headTop === null; y++) {
    let bright = 0;
    for (let x = 130; x < 350; x++) {
      const offset = (y * image.width + x) * 3;
      if (Math.max(...image.data.subarray(offset, offset + 3)) > 60) bright++;
    }
    if (bright >= 5) headTop = y;
  }
  return { path: image.path, sha256: image.sha256, headTop, anchors };
});
const record = {
  method:
    "31x31 RGB master patches, +/-5px integer translation minimizing absolute channel difference. Head top is first row with five foreground pixels above 60 in x130..349/y250..499. Read-only, no image transformations. Patch results also respond to redraw/shading changes and are not anatomy certification.",
  releaseAnchorTolerancePixels: 1,
  releaseApproved: false,
  selectedPoseOrder: [1, 2, 3, 3, 2, 1],
  measurements,
};
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(record, null, 2) + "\n"
);
console.log(JSON.stringify(record, null, 2));
