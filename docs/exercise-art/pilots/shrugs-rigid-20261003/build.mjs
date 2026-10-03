import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "docs/exercise-art/pilots/shrugs-rigid-20261003";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sources = JSON.parse(readFileSync(`${root}/sources.json`));
const buffers = await Promise.all(
  sources.map(async (s) => {
    const b = readFileSync(s.path);
    if (sha(b) !== s.sha256) throw Error("Source changed");
    return sharp(b).removeAlpha().raw().toBuffer();
  })
);

if (
  sha(readFileSync(`${root}/dumbbell-source.png`)) !==
  "cbc77bf125d25502f56c6d95a93615c6f61f5a2e21fbcb3498377263d61eb9e8"
)
  throw Error("Equipment source changed");
const equipment = await sharp(`${root}/dumbbell-source.png`)
  .trim({ threshold: 10 })
  .resize({ width: 218 })
  .ensureAlpha()
  .toBuffer();
writeFileSync(`${root}/dumbbell-layer.png`, equipment);
const layers = [
  {
    name: "far",
    origin: [238, 709],
    shifts: [
      [0, 0],
      [2, -46],
      [5, -88],
    ],
    hand: [300, 668, 360, 813],
    frontWidth: 90,
    rearX: 110,
  },
  {
    name: "near",
    origin: [554, 722],
    shifts: [
      [0, 0],
      [0, -41],
      [-2, -86],
    ],
    hand: [635, 675, 706, 824],
    frontWidth: 98,
    rearX: 130,
  },
];
for (const layer of layers) {
  const front = await sharp(equipment)
    .extract({ left: 0, top: 0, width: 90, height: 99 })
    .resize(layer.frontWidth, 110)
    .png()
    .toBuffer();
  const rear = await sharp(equipment)
    .extract({ left: 138, top: 0, width: 80, height: 99 })
    .resize(84, 114)
    .png()
    .toBuffer();
  const shaft = await sharp(equipment)
    .extract({ left: 82, top: 32, width: 68, height: 34 })
    .resize(layer.rearX + 28 - layer.frontWidth, 34)
    .png()
    .toBuffer();
  const width = layer.rearX + 84,
    height = 114;
  let png = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shaft, left: layer.frontWidth - 3, top: 35 },
      { input: rear, left: layer.rearX, top: 0 },
      { input: front, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  const normalized = await sharp(png).raw().toBuffer();
  for (let i = 3; i < normalized.length; i += 4)
    if (normalized[i] > 240) normalized[i] = 255;
  png = await sharp(normalized, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  writeFileSync(`${root}/dumbbell-${layer.name}.png`, png);
  layer.gear = await sharp(png).raw().toBuffer();
  layer.width = width;
  layer.height = height;
  layer.sha256 = sha(png);
}
const poses = [];
for (let pose = 0; pose < 3; pose++) {
  const original = buffers[pose],
    out = Buffer.from(original);
  const white = new Uint8Array(1024 * 1536);
  // White anatomical foreground; grow two pixels to retain its fine outlines.
  for (let y = 530; y < 850; y++)
    for (let x = 230; x < 780; x++) {
      const i = (y * 1024 + x) * 3;
      if (Math.min(original[i], original[i + 1], original[i + 2]) > 205)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) white[(y + dy) * 1024 + x + dx] = 1;
    }
  for (const layer of layers) {
    const [dx, dy] = layer.shifts[pose],
      gear = layer.gear,
      g = { width: layer.width, height: layer.height };
    if (layer.name === "near")
      for (let y = 712 + dy; y < 842 + dy; y++)
        for (let x = 705 + dx; x < 775 + dx; x++) {
          if (white[y * 1024 + x]) continue;
          const i = (y * 1024 + x) * 3;
          out[i] = out[i + 1] = out[i + 2] = 0;
        }
    const [left, top] = [layer.origin[0] + dx, layer.origin[1] + dy];
    for (let y = 0; y < g.height; y++)
      for (let x = 0; x < g.width; x++) {
        const xx = left + x,
          yy = top + y,
          i = (yy * 1024 + xx) * 3,
          j = (y * g.width + x) * 4,
          a = gear[j + 3] / 255;
        for (let c = 0; c < 3; c++)
          out[i + c] = Math.round(out[i + c] * (1 - a) + gear[j + c] * a);
        const [hl, ht, hr, hb] = layer.hand;
        const hand =
          xx >= hl + dx && xx < hr + dx && yy >= ht + dy && yy < hb + dy;
        const farBody = layer.name === "far" && xx > 355 + dx;
        // Hands and far-side thigh occlude the grip/rear head; front heads stay visible.
        if (
          (hand || farBody) &&
          x > layer.frontWidth - 3 &&
          (white[yy * 1024 + xx] || (farBody && xx >= 395))
        )
          for (let c = 0; c < 3; c++) out[i + c] = original[i + c];
      }
  }
  if (!out.subarray(860 * 1024 * 3).equals(buffers[0].subarray(860 * 1024 * 3)))
    throw Error("Fixed legs changed");
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
        "One imagegen dumbbell source assembled into two fixed perspective layers. Head and shaft sizing is fixed once per camera projection, with no frame-to-frame scaling or rotation. Integer translations follow each straight arm; original hands and thigh restore foreground occlusion. Fixed legs remain unchanged. Build metadata does not grant release approval.",
      equipment: { sha256: sha(equipment) },
      layers: layers.map(({ gear, ...layer }) => layer),
      frames,
    },
    null,
    2
  ) + "\n"
);
console.log("Equipment-over-background trial built.");
