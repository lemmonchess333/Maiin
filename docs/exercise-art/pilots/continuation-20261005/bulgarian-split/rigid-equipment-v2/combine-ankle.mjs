// Combine two independently reviewed, disjoint local repairs without transforms.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pins = {
  baseline: {
    path: "../composite/deep.png",
    sha256: "eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2",
  },
  gear: {
    path: "poses/deep.png",
    sha256: "358e71e6cd84ddfba32213219bf68bf8f4c4a62a46a6b7882370cf2767c0bd67",
  },
  ankle: {
    path: "../ankle-refinement-v2/deep.png",
    sha256: "70daa4b66c316751ccf68c48582d75d1cd84b87bb113053a44197e4ee73753e4",
  },
};
async function readPin(pin) {
  const b = readFileSync(resolve(here, pin.path));
  if (sha(b) !== pin.sha256) throw Error(`Changed source: ${pin.path}`);
  const { data, info } = await sharp(b)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 3)
    throw Error("Wrong native canvas");
  return data;
}
const [baseline, gear, ankle] = await Promise.all([
  readPin(pins.baseline),
  readPin(pins.gear),
  readPin(pins.ankle),
]);
const roi = [845, 596, 20, 12],
  output = Buffer.from(gear),
  mask = new Uint8Array(width * height);
let ankleChangedPixels = 0,
  ankleChangedChannels = 0,
  gearChangedPixels = 0,
  overlappingChangedPixels = 0,
  ankleOutsideRoiChangedChannels = 0,
  gearInsideRoiChangedChannels = 0;
for (let p = 0; p < width * height; p++) {
  const x = p % width,
    y = Math.floor(p / width),
    inside =
      x >= roi[0] && x < roi[0] + roi[2] && y >= roi[1] && y < roi[1] + roi[3];
  let ankleDiff = false,
    gearDiff = false;
  for (let c = 0; c < 3; c++) {
    const i = p * 3 + c;
    if (ankle[i] !== baseline[i]) {
      ankleDiff = true;
      ankleChangedChannels++;
      if (!inside) ankleOutsideRoiChangedChannels++;
    }
    if (gear[i] !== baseline[i]) {
      gearDiff = true;
      if (inside) gearInsideRoiChangedChannels++;
    }
  }
  if (ankleDiff) {
    ankleChangedPixels++;
    mask[p] = 255;
    for (let c = 0; c < 3; c++) output[p * 3 + c] = ankle[p * 3 + c];
  }
  if (gearDiff) gearChangedPixels++;
  if (ankleDiff && gearDiff) overlappingChangedPixels++;
}
if (
  ankleChangedPixels !== 204 ||
  ankleChangedChannels !== 572 ||
  overlappingChangedPixels ||
  ankleOutsideRoiChangedChannels ||
  gearInsideRoiChangedChannels
)
  throw Error("Local repairs are not the accepted disjoint changes");
let outsideAnkleChangedChannels = 0,
  gearChangedAfterCombinationChannels = 0,
  ankleSourceMismatchChannels = 0;
for (let p = 0; p < width * height; p++)
  for (let c = 0; c < 3; c++) {
    const i = p * 3 + c;
    if (!mask[p] && output[i] !== gear[i]) outsideAnkleChangedChannels++;
    if (gear[i] !== baseline[i] && output[i] !== gear[i])
      gearChangedAfterCombinationChannels++;
    if (mask[p] && output[i] !== ankle[i]) ankleSourceMismatchChannels++;
  }
if (
  outsideAnkleChangedChannels ||
  gearChangedAfterCombinationChannels ||
  ankleSourceMismatchChannels
)
  throw Error("Combined repair altered a protected region");
mkdirSync(resolve(here, "final"), { recursive: true });
const composition = JSON.parse(readFileSync(resolve(here, "composition.json")));
const results = [];
for (const name of ["setup", "shallow", "deep", "bottom"]) {
  const original = composition.results.find((p) => p.name === name);
  const bytes =
    name === "deep"
      ? await sharp(output, { raw: { width, height, channels: 3 } })
          .png()
          .toBuffer()
      : readFileSync(resolve(here, original.output.path));
  if (name !== "deep" && sha(bytes) !== original.output.sha256)
    throw Error(`Reviewed pose changed: ${name}`);
  const path = `final/${name}.png`;
  writeFileSync(resolve(here, path), bytes);
  results.push({
    name,
    path,
    sha256: sha(bytes),
    gearSource: original.output,
    ankleSource: name === "deep" ? pins.ankle : null,
  });
}
await sharp(mask, { raw: { width, height, channels: 1 } })
  .png()
  .toFile(resolve(here, "masks/combined-deep-ankle.png"));
const compareCrop = { left: 795, top: 530, width: 215, height: 165 };
const panels = await Promise.all(
  [gear, output].map((data) =>
    sharp(data, { raw: { width, height, channels: 3 } })
      .extract(compareCrop)
      .resize(645, 495, { kernel: "nearest" })
      .png()
      .toBuffer()
  )
);
await sharp({
  create: { width: 1290, height: 495, channels: 3, background: "black" },
})
  .composite(panels.map((input, i) => ({ input, left: i * 645, top: 0 })))
  .png()
  .toFile(resolve(here, "qa/deep-combined-ankle-before-after.png"));
const report = {
  releaseApproved: false,
  selected: false,
  status: "combined-native-review-passes-player-and-release-gates-pending",
  nativeReviewEvidence: "native-review.json",
  nativeCanvas: [width, height],
  sources: pins,
  roi,
  method:
    "Compare each reviewed repair to the same frozen selected deep source. Assert their changed pixels are disjoint, then copy only the 204 changed ankle pixels into the reviewed gear frame. No resizing, warping, blending or broad source replacement.",
  preservation: {
    ankleChangedPixels,
    ankleChangedChannels,
    gearChangedPixels,
    overlappingChangedPixels,
    ankleOutsideRoiChangedChannels,
    gearInsideRoiChangedChannels,
    outsideAnkleChangedChannels,
    gearChangedAfterCombinationChannels,
    ankleSourceMismatchChannels,
  },
  results,
  remainingReview:
    "Independent native review passed for these exact final hashes. Actual-player evidence and whole-release gates remain separate; no release approval is granted here.",
};
writeFileSync(
  resolve(here, "combination.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report, null, 2));
