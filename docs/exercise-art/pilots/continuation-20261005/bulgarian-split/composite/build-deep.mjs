// Native rear-contact repair for the deep pose. Does not write bottom outputs.
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
const pixels = width * height;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const portable = (path) => relative(repo, path).replaceAll("\\", "/");
const pins = {
  master: {
    path: "docs/exercise-art/masters/bulgarian-split/1.png",
    sha256: "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702",
  },
  moving: {
    path: "docs/exercise-art/pilots/continuation-20261005/bulgarian-split/sources/deep-grip-repair.png",
    sha256: "5c084a014496a630b1c540f693bf58b3241854cf36f33863e6374651aaa37a3d",
  },
};
const inside = (x, y, [left, top, w, h]) =>
  x >= left && x < left + w && y >= top && y < top + h;
const smooth = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};
async function readPinned(pin) {
  const bytes = readFileSync(resolve(repo, pin.path));
  if (digest(bytes) !== pin.sha256)
    throw new Error(`Source changed: ${pin.path}`);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 3)
    throw new Error(`Wrong native canvas: ${pin.path}`);
  return data;
}
const [master, moving] = await Promise.all([
  readPinned(pins.master),
  readPinned(pins.moving),
]);

// This is the deep pose's own native calf, not an ankle borrowed from bottom.
const bridgeRegion = [834, 578, 26, 106];
const supportRegion = [848, 530, 172, 142];
const guardRegion = [824, 568, 40, 128];
const topContourProtection = [848, 578, 12, 24];
const shift = {
  minimumDy: -7,
  maximumDy: 0,
  rampStartX: 834,
  fullyShiftedFromX: 848,
  dx: 0,
};
const anatomy = new Uint8Array(pixels);
for (let y = guardRegion[1]; y < guardRegion[1] + guardRegion[3]; y++) {
  for (let x = guardRegion[0]; x < guardRegion[0] + guardRegion[2]; x++) {
    const offset = (y * width + x) * 3;
    const rgb = moving.subarray(offset, offset + 3);
    if (Math.min(...rgb) < 140 || Math.max(...rgb) - Math.min(...rgb) > 40)
      continue;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) anatomy[(y + dy) * width + x + dx] = 255;
  }
}
const fixedMask = new Uint8Array(pixels);
const bridgeMask = new Uint8Array(pixels);
const output = Buffer.from(moving);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    const offset = pixel * 3;
    let staged = [moving[offset], moving[offset + 1], moving[offset + 2]];
    if (inside(x, y, bridgeRegion)) {
      const displacement = -7 * smooth((x - 834) / 14);
      const sourceY = y - displacement;
      const firstY = Math.floor(sourceY);
      const fraction = sourceY - firstY;
      const firstOffset = (firstY * width + x) * 3;
      const shiftedAnatomy =
        anatomy[firstY * width + x] || anatomy[(firstY + 1) * width + x];
      if (shiftedAnatomy) {
        for (let c = 0; c < 3; c++)
          staged[c] =
            moving[firstOffset + c] * (1 - fraction) +
            moving[firstOffset + width * 3 + c] * fraction;
        bridgeMask[pixel] = 255;
      } else if (anatomy[pixel]) {
        // The raised calf exposes the static bench/background beneath it.
        for (let c = 0; c < 3; c++) staged[c] = master[offset + c];
        bridgeMask[pixel] = 255;
      }
    }
    const fixedStartX = 848 + 6 * smooth((y - 600) / 36);
    let fixedWeight = inside(x, y, supportRegion)
      ? Math.round(255 * smooth((x - fixedStartX) / 6))
      : 0;
    if (inside(x, y, topContourProtection)) fixedWeight = 255;
    fixedMask[pixel] = fixedWeight;
    for (let c = 0; c < 3; c++)
      output[offset + c] = Math.round(
        (staged[c] * (255 - fixedWeight) + master[offset + c] * fixedWeight) /
          255
      );
  }
}
const preservation = {
  fixedPixels: 0,
  untouchedMovingPixels: 0,
  joinPixels: 0,
  fixedChannelDifferences: 0,
  untouchedMovingChannelDifferences: 0,
  outsideDeclaredRegionsChannelDifferences: 0,
};
for (let pixel = 0; pixel < pixels; pixel++) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  const fixed = fixedMask[pixel] === 255;
  const untouched = fixedMask[pixel] === 0 && !bridgeMask[pixel];
  if (fixed) preservation.fixedPixels++;
  else if (untouched) preservation.untouchedMovingPixels++;
  else preservation.joinPixels++;
  for (let c = 0; c < 3; c++) {
    const offset = pixel * 3 + c;
    if (fixed && output[offset] !== master[offset])
      preservation.fixedChannelDifferences++;
    if (untouched && output[offset] !== moving[offset])
      preservation.untouchedMovingChannelDifferences++;
    if (
      !inside(x, y, bridgeRegion) &&
      !inside(x, y, supportRegion) &&
      output[offset] !== moving[offset]
    )
      preservation.outsideDeclaredRegionsChannelDifferences++;
  }
}
if (
  preservation.fixedChannelDifferences ||
  preservation.untouchedMovingChannelDifferences ||
  preservation.outsideDeclaredRegionsChannelDifferences
)
  throw new Error("Native layer preservation failed");
mkdirSync(resolve(here, "qa"), { recursive: true });
const png = await sharp(output, { raw: { width, height, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
const fixedPng = await sharp(fixedMask, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();
const bridgePng = await sharp(bridgeMask, {
  raw: { width, height, channels: 1 },
})
  .png()
  .toBuffer();
writeFileSync(resolve(here, "deep.png"), png);
writeFileSync(resolve(here, "deep-fixed-layer-mask.png"), fixedPng);
writeFileSync(resolve(here, "deep-bridge-mask.png"), bridgePng);
const crop = { left: 810, top: 550, width: 210, height: 145 };
const panels = await Promise.all(
  [master, moving, output].map((data) =>
    sharp(data, { raw: { width, height, channels: 3 } })
      .extract(crop)
      .resize(crop.width * 3, crop.height * 3, { kernel: "nearest" })
      .png()
      .toBuffer()
  )
);
await sharp({
  create: {
    width: crop.width * 9,
    height: crop.height * 3,
    channels: 3,
    background: "black",
  },
})
  .composite(
    panels.map((input, i) => ({ input, left: i * crop.width * 3, top: 0 }))
  )
  .png()
  .toFile(resolve(here, "qa", "deep-rear-ankle.png"));
const report = {
  exerciseId: "bulgarian-split",
  pose: "deep",
  method:
    "Native fixed master rear shoe/contact and the deep source's own calf bridge. Only the bounded calf bridge aligns vertically by 0–7px. A diagonal blend follows the differing upper/lower contour meeting points; original body and equipment elsewhere are preserved. No bottom anatomy is used.",
  inputs: pins,
  width,
  height,
  bridgeRegion,
  supportRegion,
  topContourProtection,
  topContourRationale:
    "The aligned deep calf and master upper outline meet around x848,y600. Retaining the master background and upper 2px of contour here suppresses the donor's small protruding point while leaving the actual shoe and deep body elsewhere unchanged.",
  fullyFixedFromX: 860,
  diagonalJoin: {
    fixedStartX: "848 + 6*smoothstep(clamp((y-600)/36,0,1))",
    blendWidthPixels: 6,
    fullyFixedFromXRange: [854, 860],
    reason:
      "The upper calf approaches the master sooner than its lower contour; a vertical join left a visible lower step.",
  },
  anatomyGuard: {
    region: guardRegion,
    minimumChannel: 140,
    maximumChannelSpread: 40,
    dilationPixels: 3,
  },
  shift,
  fixedLayer: {
    path: portable(resolve(here, "deep-fixed-layer-mask.png")),
    sha256: digest(fixedPng),
    meaning:
      "0=moving/bridge, 255=frozen master, intermediate values use the recorded 8-bit alpha blend",
  },
  bridgeLayer: {
    path: portable(resolve(here, "deep-bridge-mask.png")),
    sha256: digest(bridgePng),
  },
  output: { path: portable(resolve(here, "deep.png")), sha256: digest(png) },
  preservation,
  reviewStatus: "contact-candidate-with-residual-upper-contour-finding",
  nativeVisualReview: {
    verifiedOutputSha256:
      "eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2",
    fullImageInspected: true,
    enlargedJoinInspected: true,
    calfContinuity:
      "One connected calf/ankle shape, with no open gap, doubled outline or detached bridge.",
    shoePreservation:
      "Visually retains master heel, collar, tongue, laces, toe, sole and bench contact; displaced generated upper outline is gone.",
    residualFinding:
      "Short angular shelf on upper calf-to-ankle contour, clearest at 3x and discernible natively when looking at the junction. Lower contour remains continuous.",
    approximateResidualBounds: [848, 599, 13, 5],
    coordinateUncertaintyPixels: 3,
    fullSequenceApproved: false,
  },
  rejectedTrial: {
    path: portable(resolve(here, "deep-before-diagonal-join.png")),
    sha256: "c6fde8063239070f0d1d2abb449f2ba748c555243e7649ec0f5415a87ccaf4d7",
    finding:
      "A vertical 5px blend with 4px upward bridge alignment retained a visible lower ankle step.",
  },
  previousTopContourCandidate: {
    path: portable(resolve(here, "deep-before-top-contour-refinement.png")),
    sha256: "006e0cb55994a31b1eb3cc90a302c58a8c54d7e89e2b58aa6090382abf6f865f",
    finding:
      "Diagonal blend removed the lower step but retained a small upper-contour protrusion near x850,y600.",
  },
  releaseApproved: false,
  limitations: [
    "The raw deep shoe differs in its full outline; the laces patch translation alone does not describe that redraw.",
    "Exact fixed pixels do not establish a continuous anatomical join, stable gear, correct highlighting or acceptable playback.",
  ],
  qa: {
    crop,
    scale: 3,
    order: ["frozen master", "deep grip source", "candidate"],
    productionPixelsResized: false,
  },
};
const reportPath = resolve(here, "deep-composition.json");
writeFileSync(
  reportPath,
  await format(JSON.stringify(report), {
    ...(await resolveConfig(reportPath)),
    filepath: reportPath,
  })
);
console.log(
  JSON.stringify(
    { output: report.output, preservation, releaseApproved: false },
    null,
    2
  )
);
