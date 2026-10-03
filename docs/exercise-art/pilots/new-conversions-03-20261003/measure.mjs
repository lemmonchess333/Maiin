// Read-only draft diagnostics. Zero patch drift does not grant release approval.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "docs/exercise-art/pilots/new-conversions-03-20261003";
const specs = {
  "glute-ham-raise": {
    poses: [1, 2, 3],
    radius: 32,
    patches: { nearBaseBolt: [875, 933], footplateUpperBolt: [1131, 482] },
  },
  "donkey-calf-raise": {
    poses: [1, 2, 3],
    radius: 32,
    patches: { nearFloorBolt: [923, 944], handleBaseEdge: [329, 404] },
  },
  "pistol-squat": {
    poses: [1, 2, 3],
    radius: 96,
    patches: { workingHeel: [226, 1354], workingToe: [424, 1372] },
  },
};
for (const [id, spec] of Object.entries(specs)) {
  const images = [];
  for (const frame of spec.poses) {
    const path = `${root}/${id}/frames/${frame}.png`;
    const b = readFileSync(path);
    const { data, info } = await sharp(b)
      .flatten({ background: "#ffffff" })
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
      for (let dy = -spec.radius; dy <= spec.radius; dy++)
        for (let dx = -spec.radius; dx <= spec.radius; dx++) {
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
          "21x21 RGB patch matching on a white diagnostic background (native sources unchanged), integer translation within the recorded search radius. Diagnostics only: does not establish limb or equipment dimensions, contact mechanics, or release approval.",
        releaseApproved: false,
        searchRadiusPixels: spec.radius,
        frames,
      },
      null,
      2
    ) + "\n"
  );
}
