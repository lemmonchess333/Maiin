// User-authorized layer compositing. Original generated candidates stay intact.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const sourceRoot = "docs/exercise-art/pilots/continuation-20261003/crunches";
const root = "docs/exercise-art/pilots/crunches-composite-20261003";
const width = 1536;
const height = 1024;
const featherWidth = 20;
const boundary = (y) => (y <= 600 ? 800 : y >= 680 ? 720 : 1400 - y);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pins = [
  "11a9cd61cc3d9cd028eb213af0cada295465b0a62108b4110edd05968879758f",
  "df16be278a38c7f7a2acf8de77a0ac4f739524b7412ede20c8aad1d2a25605df",
  "5e2ae11af79f51c7d0e8a17a573df9f77267ab1072c95bcbb2846ad404a57697",
];
const sources = await Promise.all(
  [1, 2, 3].map(async (n) => {
    const path = `${sourceRoot}/${n}.png`;
    const bytes = readFileSync(path);
    if (sha(bytes) !== pins[n - 1]) throw new Error(`Source changed: ${path}`);
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 3)
      throw new Error(`Unexpected canvas: ${path}`);
    return { path, sha256: sha(bytes), data };
  })
);
mkdirSync(root, { recursive: true });
const poses = [];
for (const [i, source] of sources.entries()) {
  const data = Buffer.from(source.data);
  for (let y = 0; y < height; y++) {
    const fixedStart = boundary(y);
    const blendStart = fixedStart - featherWidth;
    for (let x = blendStart; x < width; x++) {
      const t = Math.min(1, (x - blendStart) / featherWidth);
      const weight = t * t * (3 - 2 * t);
      for (let c = 0; c < 3; c++) {
        const offset = (y * width + x) * 3 + c;
        data[offset] = Math.round(
          source.data[offset] * (1 - weight) + sources[0].data[offset] * weight
        );
      }
    }
  }
  let fixedDifferences = 0;
  let movingDifferences = 0;
  for (let y = 0; y < height; y++) {
    const fixedStart = boundary(y);
    const blendStart = fixedStart - featherWidth;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const offset = (y * width + x) * 3 + c;
        if (x >= fixedStart && data[offset] !== sources[0].data[offset])
          fixedDifferences++;
        if (x <= blendStart && data[offset] !== source.data[offset])
          movingDifferences++;
      }
    }
  }
  if (fixedDifferences || movingDifferences)
    throw new Error("Layer preservation failed");
  const png = await sharp(data, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  poses.push({
    png,
    source: { path: source.path, sha256: source.sha256 },
    fixedDifferences,
    movingDifferences,
  });
}
const order = [1, 2, 3, 3, 2, 1];
const frames = order.map((pose, i) => {
  const path = `${root}/${i + 1}.png`;
  writeFileSync(path, poses[pose - 1].png);
  return {
    frame: i + 1,
    pose,
    path,
    sha256: sha(poses[pose - 1].png),
    source: poses[pose - 1].source,
    fixedChannelDifferences: poses[pose - 1].fixedDifferences,
    movingChannelDifferences: poses[pose - 1].movingDifferences,
  };
});
writeFileSync(
  `${root}/composition.json`,
  JSON.stringify(
    {
      method:
        "RGB layer composition, no geometric transforms. Original setup supplies the lower body to the right of a pelvis-following boundary: x800 above y600, x(1400-y) through y600..680, x720 below y680. Original moving pose is untouched left of a 20px smoothstep join. No resize, warp or generated new anatomy.",
      authorization:
        "User explicitly approved code-based layer compositing for fixed-contact repairs in this conversation.",
      width,
      height,
      featherWidth,
      boundary: [
        [800, 0],
        [800, 600],
        [720, 680],
        [720, 1023],
      ],
      fixedLayer: { path: sources[0].path, sha256: sources[0].sha256 },
      releaseApproved: false,
      frames,
    },
    null,
    2
  ) + "\n"
);
console.log(
  "Wrote six candidates; fixed lower-body and original moving-region pixels verified exactly."
);
