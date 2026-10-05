// Preservation and construction diagnostics; no release approval is granted.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)),
  width = 1536,
  height = 1024,
  count = width * height;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const composition = JSON.parse(readFileSync(resolve(here, "composition.json")));
const combination = JSON.parse(readFileSync(resolve(here, "combination.json")));
const patches = [
  {
    name: "near-front-face",
    layer: "near",
    x: 13,
    y: 30,
    width: 17,
    height: 23,
  },
  {
    name: "near-rear-face",
    layer: "near",
    x: 148,
    y: 33,
    width: 17,
    height: 23,
  },
  { name: "far-front-face", layer: "far", x: 12, y: 30, width: 15, height: 22 },
];
const anchors = [
  { name: "frontToe", x: 390, y: 938 },
  { name: "frontHeel", x: 533, y: 934 },
  { name: "rearLacesPad", x: 932, y: 646 },
  { name: "benchRightPadCorner", x: 1374, y: 677 },
  { name: "benchNearLegBolt", x: 1295, y: 884 },
  { name: "benchFarLegBolt", x: 865, y: 705 },
  { name: "benchFarBaseCorner", x: 810, y: 885 },
  { name: "benchNearBaseCorner", x: 1252, y: 950 },
];
async function readPinned(pin) {
  const b = readFileSync(resolve(here, pin.path));
  if (sha(b) !== pin.sha256) throw Error(`Changed source: ${pin.path}`);
  return sharp(b).removeAlpha().raw().toBuffer();
}
async function readMask(path) {
  const { data, info } = await sharp(resolve(here, path))
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Uint8Array.from({ length: count }, (_, p) => data[p * info.channels]);
}
const layers = {};
for (const projection of composition.projections) {
  const path = `dumbbell-${projection.name}.png`,
    bytes = readFileSync(resolve(here, path));
  if (sha(bytes) !== projection.sha256) throw Error("Fixed projection changed");
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  layers[projection.name] = { ...projection, rgba: data, info };
}
const faceChecks = [],
  supportChecks = [],
  preservation = [];
for (const final of combination.results) {
  const pose = composition.results.find((p) => p.name === final.name),
    out = await readPinned(final),
    base = await readPinned(pose.source);
  const edit = await readMask(pose.masks.edit.path),
    foreground = await readMask(pose.masks.foreground.path);
  const ankle =
    final.name === "deep"
      ? await readMask("masks/combined-deep-ankle.png")
      : new Uint8Array(count);
  let outsideAllowedChangedChannels = 0,
    foregroundChangedChannels = 0;
  for (let p = 0; p < count; p++)
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      if (!edit[p] && !ankle[p] && out[i] !== base[i])
        outsideAllowedChangedChannels++;
      if (foreground[p] && out[i] !== base[i]) foregroundChangedChannels++;
    }
  preservation.push({
    pose: final.name,
    outsideAllowedChangedChannels,
    foregroundChangedChannels,
  });
  for (const patch of patches) {
    const layer = layers[patch.layer],
      [dx, dy] = pose.shifts[patch.layer],
      left = layer.origin[0] + dx + patch.x,
      top = layer.origin[1] + dy + patch.y;
    let changedChannels = 0,
      nonOpaqueLayerPixels = 0;
    for (let y = 0; y < patch.height; y++)
      for (let x = 0; x < patch.width; x++) {
        const j = ((patch.y + y) * layer.width + patch.x + x) * 4,
          i = ((top + y) * width + left + x) * 3;
        if (layer.rgba[j + 3] !== 255) nonOpaqueLayerPixels++;
        for (let c = 0; c < 3; c++)
          if (out[i + c] !== layer.rgba[j + c]) changedChannels++;
      }
    faceChecks.push({
      pose: final.name,
      patch: patch.name,
      box: [left, top, patch.width, patch.height],
      changedChannels,
      nonOpaqueLayerPixels,
    });
  }
  for (const anchor of anchors) {
    let changedChannels = 0;
    for (let y = anchor.y - 15; y <= anchor.y + 15; y++)
      for (let x = anchor.x - 15; x <= anchor.x + 15; x++)
        for (let c = 0; c < 3; c++) {
          const i = (y * width + x) * 3 + c;
          if (out[i] !== base[i]) changedChannels++;
        }
    supportChecks.push({
      pose: final.name,
      anchor: anchor.name,
      centre: [anchor.x, anchor.y],
      size: [31, 31],
      changedChannels,
    });
  }
}
const sourcePartBounds = {};
const original = await sharp(resolve(here, "dumbbell-opaque-interior.png"))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (const projection of composition.projections)
  for (const [name, part] of Object.entries(projection.parts)) {
    const bytes = await sharp(original.data, {
      raw: {
        width: original.info.width,
        height: original.info.height,
        channels: 4,
      },
    })
      .extract(composition.sourceParts[name])
      .resize(part.size[0], part.size[1], { fit: "fill", kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    let minX = part.size[0],
      minY = part.size[1],
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < part.size[1]; y++)
      for (let x = 0; x < part.size[0]; x++)
        if (bytes[(y * part.size[0] + x) * 4 + 3] >= 128) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    sourcePartBounds[`${projection.name}-${name}`] = {
      fixedAllocatedSize: part.size,
      alphaHalfCoverageBounds: [minX, minY, maxX - minX + 1, maxY - minY + 1],
      perPoseScale: 1,
      perPoseRotationDegrees: 0,
      relativeDimensionDrift: 0,
    };
  }
const failed =
  faceChecks.some((p) => p.changedChannels || p.nonOpaqueLayerPixels) ||
  supportChecks.some((p) => p.changedChannels) ||
  preservation.some(
    (p) => p.outsideAllowedChangedChannels || p.foregroundChangedChannels
  );
const report = {
  releaseApproved: false,
  selected: false,
  status: failed
    ? "diagnostic-failure"
    : "local-construction-and-preservation-checks-pass",
  bounds: {
    fixedAnchorMaxAxisDriftPixels: 1,
    invariantDimensionsMaxRelativeDrift: 0.01,
    unchangedFromBaseline: true,
  },
  sourceOutputs: combination.results.map(({ name, path, sha256 }) => ({
    name,
    path,
    sha256,
  })),
  faceChecks,
  supportChecks,
  preservation,
  invariantLayerGeometry: sourcePartBounds,
  method:
    "Final native RGB is compared to the fixed transparent layer at integer-translated exposed face patches. All32 anchor patches are compared to each exact frozen selected source. Every other pixel outside declared gear edits and the accepted204-pixel ankle refinement must match that source. Invariant geometry is the alpha-bearing equipment layer assembled once and reused without per-pose scaling or rotation.",
  limitations: [
    "Exact interior samples and fixed layer geometry are accompanied by independent native contour and grip review. They do not by themselves approve a scene or certify real-world load dimensions.",
    "Original hand/knee foreground can hide different portions of the same rigid layer; hidden shaft/rear-head dimensions are construction evidence rather than a visible measurement through anatomy.",
    "This does not run or substitute actual mobile light/dark/reduced-motion player verification.",
  ],
};
writeFileSync(
  resolve(here, "diagnostics.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      faceChecks: faceChecks.length,
      supportChecks: supportChecks.length,
      failedFaceChecks: faceChecks.filter(
        (p) => p.changedChannels || p.nonOpaqueLayerPixels
      ),
      failedSupportChecks: supportChecks.filter((p) => p.changedChannels),
      preservation,
      invariantLayerGeometry: sourcePartBounds,
    },
    null,
    2
  )
);
if (failed) process.exitCode = 1;
