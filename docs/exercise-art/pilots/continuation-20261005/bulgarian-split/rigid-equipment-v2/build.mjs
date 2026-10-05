// One bounded V2 attempt: transparent equipment, no background erasure.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024,
  count = width * height;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const nativeSources = [
  {
    name: "setup",
    path: "../sources/setup.png",
    sha256: "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702",
    shift: { near: [0, 0], far: [0, 0] },
    hands: { near: [632, 478, 57, 83], far: [404, 476, 43, 77] },
  },
  {
    name: "shallow",
    path: "../sources/shallow.png",
    sha256: "a1bb1762a10f5d01af746f79d14b9b169a71e3205d83e3538e0dd1eff59785ec",
    shift: { near: [-2, 23], far: [-1, 23] },
    hands: { near: [630, 501, 57, 83], far: [402, 498, 43, 77] },
  },
  {
    name: "deep",
    path: "../composite/deep.png",
    sha256: "eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2",
    shift: { near: [8, 100], far: [-20, 78] },
    hands: { near: [640, 580, 58, 84], far: [389, 553, 47, 77] },
    nearHandLowerEdge: [
      [639, 655],
      [648, 657],
      [655, 658],
      [662, 657],
      [668, 655],
      [674, 655],
      [680, 653],
      [684, 651],
      [688, 645],
      [698, 637],
    ],
  },
  {
    name: "bottom",
    path: "../rigid-equipment/bottom-contact-colour.png",
    sha256: "3a8aea075b87199b21dc4fe46b0a55f0e5506dbf8b674a492ba87dc757ea09fb",
    shift: { near: [12, 155], far: [-51, 108] },
    hands: { near: [645, 632, 61, 86], far: [357, 582, 48, 80] },
  },
];
const equipmentPin = {
  path: "dumbbell-source.png",
  sha256: "57176b796fc6fecb7832d5e46cd79f469fdec72f37ae1be71d1c86848c2cc57b",
};
const equipmentBytes = readFileSync(resolve(here, equipmentPin.path));
if (sha(equipmentBytes) !== equipmentPin.sha256)
  throw Error("Generated transparent asset changed");
const equipmentRaw = await sharp(equipmentBytes)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let normalizedInteriorAlphaPixels = 0;
for (let p = 0; p < equipmentRaw.info.width * equipmentRaw.info.height; p++) {
  const i = p * 4 + 3;
  if (equipmentRaw.data[i] > 240 && equipmentRaw.data[i] < 255) {
    equipmentRaw.data[i] = 255;
    normalizedInteriorAlphaPixels++;
  }
}
const normalizedAsset = await sharp(equipmentRaw.data, {
  raw: {
    width: equipmentRaw.info.width,
    height: equipmentRaw.info.height,
    channels: 4,
  },
})
  .png()
  .toBuffer();
writeFileSync(resolve(here, "dumbbell-opaque-interior.png"), normalizedAsset);
const sourceParts = {
  front: { left: 114, top: 162, width: 596, height: 625 },
  rear: { left: 1031, top: 170, width: 539, height: 614 },
  shaft: { left: 699, top: 386, width: 490, height: 203 },
};
const projections = [
  {
    name: "near",
    origin: [563, 492],
    width: 179,
    height: 86,
    parts: {
      front: { size: [80, 84], at: [0, 2] },
      rear: { size: [66, 84], at: [113, 0] },
      shaft: { size: [52, 25], at: [72, 32] },
    },
  },
  {
    name: "far",
    origin: [343, 487],
    width: 143,
    height: 82,
    parts: {
      front: { size: [73, 80], at: [0, 1] },
      rear: { size: [60, 80], at: [83, 0] },
      shaft: { size: [48, 23], at: [65, 30] },
    },
  },
];
for (const projection of projections) {
  const parts = {};
  for (const [name, settings] of Object.entries(projection.parts)) {
    parts[name] = await sharp(normalizedAsset)
      .extract(sourceParts[name])
      .resize(settings.size[0], settings.size[1], {
        fit: "fill",
        kernel: "lanczos3",
      })
      .png()
      .toBuffer();
  }
  const bytes = await sharp({
    create: {
      width: projection.width,
      height: projection.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      ["shaft", "rear", "front"].map((name) => ({
        input: parts[name],
        left: projection.parts[name].at[0],
        top: projection.parts[name].at[1],
      }))
    )
    .png()
    .toBuffer();
  projection.rgba = await sharp(bytes).ensureAlpha().raw().toBuffer();
  projection.sha256 = sha(bytes);
  writeFileSync(resolve(here, `dumbbell-${projection.name}.png`), bytes);
}
mkdirSync(resolve(here, "poses"), { recursive: true });
mkdirSync(resolve(here, "masks"), { recursive: true });
mkdirSync(resolve(here, "qa"), { recursive: true });
const inside = (x, y, [l, t, w, h]) =>
  x >= l && x < l + w && y >= t && y < t + h;
const lowerEdge = (x, points) => {
  if (!points) return height;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1],
      [x1, y1] = points[i];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return height;
};
const results = [];
const sources = process.argv.includes("--all")
  ? nativeSources
  : nativeSources.filter((s) => s.name === "bottom");
for (const source of sources) {
  const bytes = readFileSync(resolve(here, source.path));
  if (sha(bytes) !== source.sha256)
    throw Error(`Selected source changed: ${source.name}`);
  const decoded = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== width ||
    decoded.info.height !== height ||
    decoded.info.channels !== 3
  )
    throw Error("Wrong native canvas");
  const original = decoded.data,
    out = Buffer.from(original),
    foreground = new Uint8Array(count),
    editMask = new Uint8Array(count),
    equipmentMask = new Uint8Array(count);
  for (const [handName, box] of Object.entries(source.hands))
    for (let y = box[1]; y < box[1] + box[3]; y++)
      for (let x = box[0]; x < box[0] + box[2]; x++) {
        if (handName === "near" && y > lowerEdge(x, source.nearHandLowerEdge))
          continue;
        const p = y * width + x,
          rgb = original.subarray(p * 3, p * 3 + 3);
        if (
          Math.min(...rgb) > 145 &&
          Math.max(...rgb) - Math.min(...rgb) < 45
        ) {
          for (let yy = y - 1; yy <= y + 1; yy++)
            for (let xx = x - 1; xx <= x + 1; xx++)
              foreground[yy * width + xx] = 255;
        }
      }
  // The far dumbbell's unseen rear head belongs behind the existing thigh/knee.
  // Preserve the source anatomy plus its native one-pixel dark contour.
  const [fx, fy] = source.shift.far;
  const farBodyBox = [432 + fx, 483 + fy, 72, 93];
  const bodySeeds = [];
  for (let y = farBodyBox[1]; y < farBodyBox[1] + farBodyBox[3]; y++)
    for (let x = farBodyBox[0]; x < farBodyBox[0] + farBodyBox[2]; x++) {
      const p = y * width + x,
        rgb = original.subarray(p * 3, p * 3 + 3);
      if (Math.min(...rgb) > 125 || rgb[2] - rgb[0] > 25) bodySeeds.push(p);
    }
  for (const p of bodySeeds) {
    const x = p % width,
      y = Math.floor(p / width);
    for (let yy = y - 1; yy <= y + 1; yy++)
      for (let xx = x - 1; xx <= x + 1; xx++) foreground[yy * width + xx] = 255;
  }
  for (const projection of projections) {
    const [dx, dy] = source.shift[projection.name],
      left = projection.origin[0] + dx,
      top = projection.origin[1] + dy;
    for (let y = 0; y < projection.height; y++)
      for (let x = 0; x < projection.width; x++) {
        const j = (y * projection.width + x) * 4,
          a = projection.rgba[j + 3];
        if (!a) continue;
        const p = (top + y) * width + left + x;
        equipmentMask[p] = Math.max(equipmentMask[p], a);
        if (foreground[p]) continue;
        for (let c = 0; c < 3; c++)
          out[p * 3 + c] = Math.round(
            original[p * 3 + c] * (1 - a / 255) +
              (projection.rgba[j + c] * a) / 255
          );
        editMask[p] = Math.max(editMask[p], a);
      }
  }
  let changedPixels = 0,
    editedPixels = 0,
    outsideEquipmentChangedChannels = 0,
    foregroundChangedChannels = 0,
    bodyAboveEquipmentChangedChannels = 0;
  for (let p = 0; p < count; p++) {
    if (editMask[p]) editedPixels++;
    let changed = false;
    for (let c = 0; c < 3; c++)
      if (out[p * 3 + c] !== original[p * 3 + c]) {
        changed = true;
        if (!editMask[p]) outsideEquipmentChangedChannels++;
        if (foreground[p]) foregroundChangedChannels++;
        if (p < 480 * width) bodyAboveEquipmentChangedChannels++;
      }
    if (changed) changedPixels++;
  }
  if (
    outsideEquipmentChangedChannels ||
    foregroundChangedChannels ||
    bodyAboveEquipmentChangedChannels
  )
    throw Error("Pixel preservation failed");
  const outputBytes = await sharp(out, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
  const path = `poses/${source.name}.png`;
  writeFileSync(resolve(here, path), outputBytes);
  const masks = {};
  for (const [name, data] of Object.entries({
    foreground,
    edit: editMask,
    equipment: equipmentMask,
  })) {
    const bytes = await sharp(data, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
    masks[name] = {
      path: `masks/${source.name}-${name}.png`,
      sha256: sha(bytes),
    };
    writeFileSync(resolve(here, masks[name].path), bytes);
  }
  const qaBoxes = {
    near: [548 + source.shift.near[0], 477 + source.shift.near[1], 220, 122],
    far: [327 + fx, 469 + fy, 190, 122],
  };
  for (const [name, box] of Object.entries(qaBoxes)) {
    const [left, top, w, h] = box;
    const panels = await Promise.all(
      [original, out].map((data) =>
        sharp(data, { raw: { width, height, channels: 3 } })
          .extract({ left, top, width: w, height: h })
          .resize(w * 3, h * 3, { kernel: "nearest" })
          .png()
          .toBuffer()
      )
    );
    await sharp({
      create: { width: w * 6, height: h * 3, channels: 3, background: "black" },
    })
      .composite(panels.map((input, i) => ({ input, left: i * w * 3, top: 0 })))
      .png()
      .toFile(resolve(here, `qa/${source.name}-${name}-before-after.png`));
  }
  results.push({
    name: source.name,
    source: { path: source.path, sha256: source.sha256 },
    output: { path, sha256: sha(outputBytes) },
    shifts: source.shift,
    hands: source.hands,
    nearHandLowerEdge: source.nearHandLowerEdge ?? null,
    farBodyBox,
    masks,
    qaBoxes,
    preservation: {
      changedPixels,
      editedPixels,
      outsideEquipmentChangedChannels,
      foregroundChangedChannels,
      bodyAboveEquipmentChangedChannels,
    },
    releaseApproved: false,
  });
}
const report = {
  releaseApproved: false,
  selected: false,
  status: "native-reviewed-candidate-player-and-release-gates-pending",
  nativeReviewEvidence: "native-review.json",
  baselineCommit: "8191b80d770fe8c614fb7c9b4441e71f0c9a39fa",
  nativeCanvas: [width, height],
  equipment: equipmentPin,
  sourceParts,
  alphaNormalization: {
    rule: "Alpha > 240 becomes 255 once before fixed projection creation; antialiased edge alpha is retained",
    normalizedInteriorAlphaPixels,
  },
  projections: projections.map(({ rgba, ...p }) => p),
  method:
    "One transparent imagegen asset assembled once into fixed near/far camera projections. The fixed layers move by integer translation only across poses; source body and camera never move. Original hands and far knee remain foreground. There is no clearing, background fill, warped anatomy, global resize or per-frame equipment resize.",
  priorFailureRegions: [
    [594, 651, 12, 18],
    [605, 729, 25, 6],
    [687, 710, 66, 34],
  ],
  unchangedReviewBounds: {
    fixedAnchorMaxAxisDriftPixels: 1,
    invariantDimensionsMaxRelativeDrift: 0.01,
  },
  results,
  limitations: [
    "Layer invariance does not automatically establish clean foreground grips or complete coverage of the previous drawn gear; independent native review is recorded separately.",
    "The new projection deliberately covers a slightly larger silhouette than the largest original head, to avoid exposing occluded anatomy. Setup candidate equipment changes within its own gear region; frozen source and master remain unchanged.",
    "Camera-specific projections are established once from the asset; dimensions of hidden equipment are construction evidence, not directly observed anatomy.",
  ],
};
writeFileSync(
  resolve(here, "composition.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(
  JSON.stringify(
    results.map(({ name, output, preservation }) => ({
      name,
      output,
      preservation,
    })),
    null,
    2
  )
);
