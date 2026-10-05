// Bounded native contour-layer refinement. Original sources and selected frames
// are read-only inputs; this builder writes only inside ankle-refinement-v2.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../../..");
const width = 1536;
const height = 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const portable = (path) => relative(repo, path).replaceAll("\\", "/");
const source = {
  checkpoint: "8191b80d770fe8c614fb7c9b4441e71f0c9a39fa",
  path: "docs/exercise-art/pilots/continuation-20261005/bulgarian-split/composite/deep.png",
  sha256: "eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2",
};
const sourceBytes = readFileSync(resolve(repo, source.path));
if (hash(sourceBytes) !== source.sha256) throw new Error("Baseline changed");
const { data: baseline, info } = await sharp(sourceBytes)
  .removeAlpha()
  .toColourspace("srgb")
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== width || info.height !== height || info.channels !== 3)
  throw new Error("Native canvas changed");

// This is the residual upper contour only, expanded by at most 3px around
// the reviewed x848-861,y599-604 finding. No joint, shoe or whole-frame transform.
const region = [845, 596, 20, 12];
const smooth = (t) => {
  const v = Math.max(0, Math.min(1, t));
  return v * v * (3 - 2 * v);
};
const inside = (x, y, [left, top, w, h]) =>
  x >= left && x < left + w && y >= top && y < top + h;
const luminance = (x, y) => {
  const i = (y * width + x) * 3;
  return Math.min(baseline[i], baseline[i + 1], baseline[i + 2]);
};
const edgeAt = (x) => {
  for (let y = 586; y < 630; y++) {
    const previous = luminance(x, y - 1);
    const current = luminance(x, y);
    if (previous < 100 && current >= 100)
      return y - 1 + (100 - previous) / (current - previous);
  }
  throw new Error(`Missing upper anatomy edge at ${x}`);
};
const leftEdge = edgeAt(844);
const rightEdge = edgeAt(865);
const columns = [];
const output = Buffer.from(baseline);
const mask = Buffer.alloc(width * height);
for (let x = region[0]; x < region[0] + region[2]; x++) {
  const originalEdge = edgeAt(x);
  const targetEdge = leftEdge + ((x - 844) / 21) * (rightEdge - leftEdge);
  const dy = targetEdge - originalEdge;
  if (Math.abs(dy) > 3.5) throw new Error("Contour displacement exceeds bound");
  columns.push({ x, originalEdge, targetEdge, dy });
  for (let y = region[1]; y < region[1] + region[3]; y++) {
    // Retain the lower ankle, its shading and linework exactly below row607.
    // At the upper edge the donor is the baseline's own existing contour;
    // the inward blend falls to zero across rows603-608.
    const weight = 1 - smooth((y - 603) / 5);
    const sourceY = y - dy;
    const y0 = Math.floor(sourceY);
    const fraction = sourceY - y0;
    const offset = (y * width + x) * 3;
    const from = (y0 * width + x) * 3;
    mask[y * width + x] = Math.round(255 * weight);
    for (let c = 0; c < 3; c++) {
      const donor =
        baseline[from + c] * (1 - fraction) +
        baseline[from + width * 3 + c] * fraction;
      output[offset + c] = Math.round(
        baseline[offset + c] * (1 - weight) + donor * weight
      );
    }
  }
}
const protectedRegions = {
  rearShoeAndContact: [865, 548, 138, 128],
  lowerRearCalfAndAnkle: [815, 608, 50, 94],
  frontShoeAndFloorContact: [365, 844, 195, 120],
  bench: [770, 640, 645, 323],
  bothHandsAndEquipment: [320, 548, 426, 138],
};
const registrationSource = {
  path: "docs/exercise-art/pilots/continuation-20261005/bulgarian-split/registration.json",
  sha256: "5177e3a66deed3f88775cb59afa101987a2b2d36fd13c1aca4ac56e105137bb3",
};
const registrationBytes = readFileSync(resolve(repo, registrationSource.path));
if (hash(registrationBytes) !== registrationSource.sha256)
  throw new Error("Frozen registration evidence changed");
const registration = JSON.parse(registrationBytes);
const baselineRegistration = registration.frames.find(
  (frame) => frame.sha256 === source.sha256
);
if (!baselineRegistration)
  throw new Error("Missing pinned baseline measurement");
const patchSearchWindowPreservation = {};
for (const [name, patch] of Object.entries(baselineRegistration.patches)) {
  const [left, top, w, h] = patch.referenceBox;
  const radius = registration.searchRadiusPixels;
  const searchWindow = [
    left - radius,
    top - radius,
    w + 2 * radius,
    h + 2 * radius,
  ];
  let channelDifferences = 0;
  for (let y = searchWindow[1]; y < searchWindow[1] + searchWindow[3]; y++)
    for (let x = searchWindow[0]; x < searchWindow[0] + searchWindow[2]; x++)
      for (let c = 0; c < 3; c++) {
        const offset = (y * width + x) * 3 + c;
        if (baseline[offset] !== output[offset]) channelDifferences++;
      }
  if (channelDifferences)
    throw new Error(`Registration search window changed: ${name}`);
  patchSearchWindowPreservation[name] = { searchWindow, channelDifferences };
}
const protection = Object.fromEntries(
  Object.keys(protectedRegions).map((key) => [key, 0])
);
const changedMask = Buffer.alloc(width * height);
let changedPixels = 0;
let changedChannels = 0;
let absoluteChannelDifference = 0;
let maximumChannelDifference = 0;
let outsideRegionChannelDifferences = 0;
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    let different = false;
    const offset = (y * width + x) * 3;
    for (let c = 0; c < 3; c++) {
      const delta = Math.abs(output[offset + c] - baseline[offset + c]);
      if (!delta) continue;
      different = true;
      changedChannels++;
      absoluteChannelDifference += delta;
      maximumChannelDifference = Math.max(maximumChannelDifference, delta);
      if (!inside(x, y, region)) outsideRegionChannelDifferences++;
      for (const [key, rectangle] of Object.entries(protectedRegions))
        if (inside(x, y, rectangle)) protection[key]++;
    }
    if (different) {
      changedPixels++;
      changedMask[y * width + x] = 255;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}
if (outsideRegionChannelDifferences || Object.values(protection).some(Boolean))
  throw new Error("Protected pixels changed");
mkdirSync(resolve(here, "qa"), { recursive: true });
const encode = (data, channels = 3) =>
  sharp(data, { raw: { width, height, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
const bytes = await encode(output);
const independentReviewPath = resolve(here, "independent-review.json");
const independentReviewBytes = readFileSync(independentReviewPath);
const independentReview = JSON.parse(independentReviewBytes);
if (independentReview.candidateSha256 !== hash(bytes))
  throw new Error("Independent local review does not match candidate hash");
writeFileSync(resolve(here, "deep.png"), bytes);
writeFileSync(resolve(here, "import-mask.png"), await encode(mask, 1));
writeFileSync(
  resolve(here, "changed-pixels.png"),
  await encode(changedMask, 1)
);
const crop = { left: 810, top: 550, width: 210, height: 145 };
const panels = await Promise.all(
  [baseline, output].map((data) =>
    sharp(data, { raw: { width, height, channels: 3 } })
      .extract(crop)
      .resize(crop.width * 3, crop.height * 3, { kernel: "nearest" })
      .png()
      .toBuffer()
  )
);
await sharp({
  create: {
    width: crop.width * 6,
    height: crop.height * 3,
    channels: 3,
    background: "black",
  },
})
  .composite(
    panels.map((input, i) => ({ input, left: i * crop.width * 3, top: 0 }))
  )
  .png()
  .toFile(resolve(here, "qa/baseline-candidate-3x.png"));
await sharp(bytes)
  .extract(crop)
  .png()
  .toFile(resolve(here, "qa/candidate-native.png"));
const report = {
  status: "independently-reviewed-local-candidate-not-selected",
  releaseApproved: false,
  source,
  output: { path: portable(resolve(here, "deep.png")), sha256: hash(bytes) },
  nativeCanvas: [width, height],
  method:
    "Selected baseline's existing upper-contour pixels sampled with a per-column vertical displacement into a bounded, inward-feathered layer. No whole-frame or equipment transform. No generated or borrowed anatomy.",
  region,
  contourThreshold: 100,
  contourEndpoints: { left: [844, leftEdge], right: [865, rightEdge] },
  columnDisplacements: columns,
  inwardBlend: { fullThroughRow: 603, zeroAtRow: 608 },
  changedPixels,
  changedChannels,
  changedBoundsInclusive: [minX, minY, maxX, maxY],
  absoluteChannelDifference,
  maximumChannelDifference,
  outsideRegionChannelDifferences,
  protectedRegions,
  protectedRegionChannelDifferences: protection,
  registrationPreservation: {
    source: registrationSource,
    method:
      "Each complete 91x91 baseline search window is compared channel-by-channel. Exact equality preserves every possible 31x31 +/-30px translation error, its tie-break and the resulting measured centres; no search was rerun or result silently reinterpreted.",
    existingReleaseAnchorLimitPixels:
      registration.existingReleaseAnchorLimitPixels,
    existingReleaseDimensionDriftLimitFraction:
      registration.existingReleaseDimensionDriftLimitFraction,
    patchSearchWindowPreservation,
    unchangedBaselinePatches: baselineRegistration.patches,
    unchangedProjectedSupportSpans: baselineRegistration.projectedSupportSpans,
  },
  unchangedPixels: width * height - changedPixels,
  independentReview: {
    path: portable(independentReviewPath),
    sha256: hash(independentReviewBytes),
    localContourAccepted: independentReview.localContourAccepted,
    wholeSequenceApproved: false,
    releaseApproved: false,
  },
  visualReview:
    "Independent native/3x review preferred this exact candidate for the local contour improvement, with a connected graded outline and no visible new gap, doubled edge or lower-ankle cut. The natural directional bend remains. No equipment, sequence or release approval is implied.",
};
const reportPath = resolve(here, "report.json");
writeFileSync(
  reportPath,
  await format(JSON.stringify(report), {
    ...(await resolveConfig(reportPath)),
    parser: "json",
  })
);
console.log(
  JSON.stringify(
    {
      output: report.output,
      changedPixels,
      changedChannels,
      bounds: report.changedBoundsInclusive,
      protection,
      outsideRegionChannelDifferences,
    },
    null,
    2
  )
);
