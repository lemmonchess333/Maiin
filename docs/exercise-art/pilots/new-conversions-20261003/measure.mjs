// Read-only draft diagnostics. Zero patch drift does not grant release approval.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "docs/exercise-art/pilots/new-conversions-20261003";
const specs = {
  "cuban-press": {
    poses: [1, 2, 3, 4],
    patches: { leftShoeToe: [371, 1382], rightShoeToe: [536, 1424] },
  },
  "hip-abduction-machine": {
    poses: [1, 2, 3],
    patches: { towerUpperLeftBolt: [244, 107], nearBaseFoot: [597, 1417] },
  },
};
for (const [id, spec] of Object.entries(specs)) {
  const images = [];
  for (const frame of spec.poses) {
    const path = `${root}/${id}/frames/${frame}.png`;
    const b = readFileSync(path);
    const { data, info } = await sharp(b)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    images.push({
      frame,
      path,
      sha256: createHash("sha256").update(b).digest("hex"),
      data,
      width: info.width,
    });
  }
  const frames = images.map((im) => {
    const anchors = {};
    for (const [name, [cx, cy]] of Object.entries(spec.patches)) {
      let best = { dx: 0, dy: 0, meanChannelDifference: Infinity };
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          let sum = 0;
          for (let y = cy - 10; y <= cy + 10; y++)
            for (let x = cx - 10; x <= cx + 10; x++)
              for (let c = 0; c < 3; c++)
                sum += Math.abs(
                  images[0].data[(y * im.width + x) * 3 + c] -
                    im.data[((y + dy) * im.width + x + dx) * 3 + c]
                );
          const error = sum / (21 * 21 * 3);
          if (error < best.meanChannelDifference)
            best = { dx, dy, meanChannelDifference: error };
        }
      anchors[name] = { reference: [cx, cy], ...best };
    }
    return { frame: im.frame, path: im.path, sha256: im.sha256, anchors };
  });
  writeFileSync(
    `${root}/${id}/registration.json`,
    JSON.stringify(
      {
        method:
          "21x21 RGB patch matching, integer translation within +/-4px. Diagnostics only: does not establish limb or equipment dimensions, contact mechanics, or release approval.",
        releaseApproved: false,
        frames,
      },
      null,
      2
    ) + "\n"
  );
}
