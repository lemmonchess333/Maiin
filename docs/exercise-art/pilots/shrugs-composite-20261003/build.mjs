import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = "docs/exercise-art/pilots/shrugs-composite-20261003";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sources = JSON.parse(readFileSync(`${root}/sources.json`));
const images = await Promise.all(
  sources.map(async (source) => {
    const bytes = readFileSync(source.path);
    if (sha(bytes) !== source.sha256) throw Error("Source changed");
    const { data, info } = await sharp(bytes)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== 1024 || info.height !== 1536)
      throw Error("Canvas changed");
    return data;
  })
);
const poses = [];
for (let pose = 0; pose < 3; pose++) {
  const out = Buffer.from(images[pose]);
  for (let y = 840; y < 1536; y++) {
    const t = Math.min(1, (y - 840) / 20),
      alpha = t * t * (3 - 2 * t);
    for (let x = 0; x < 1024; x++)
      for (let c = 0; c < 3; c++) {
        const i = (y * 1024 + x) * 3 + c;
        out[i] = Math.round(
          images[pose][i] * (1 - alpha) + images[0][i] * alpha
        );
      }
  }
  if (!out.subarray(860 * 1024 * 3).equals(images[0].subarray(860 * 1024 * 3)))
    throw Error("Fixed region mismatch");
  if (
    !out
      .subarray(0, 840 * 1024 * 3)
      .equals(images[pose].subarray(0, 840 * 1024 * 3))
  )
    throw Error("Moving region mismatch");
  poses.push(
    await sharp(out, { raw: { width: 1024, height: 1536, channels: 3 } })
      .png()
      .toBuffer()
  );
}
const frames = [1, 2, 3, 3, 2, 1].map((pose, i) => {
  const path = `${root}/frames/${i + 1}.png`;
  writeFileSync(path, poses[pose - 1]);
  return {
    path,
    pose,
    sha256: sha(poses[pose - 1]),
    source: sources[pose - 1],
  };
});
writeFileSync(
  `${root}/composition.json`,
  JSON.stringify(
    {
      releaseApproved: false,
      method:
        "User-authorized RGB layer compositing. Setup legs and feet copied exactly below y860; original upper body and equipment unchanged above y840; 20px smoothstep join. No scaling or warping.",
      fixedRegionChannelDifferences: 0,
      movingRegionChannelDifferences: 0,
      remainingReview: [
        "Pelvis above the repair boundary remains independently drawn.",
        "Dumbbells and hands unchanged; rigid equipment geometry has not passed review.",
        "Native join and playback review required before any release.",
      ],
      frames,
    },
    null,
    2
  ) + "\n"
);
console.log("Six draft frames written; preserved regions match exactly.");
