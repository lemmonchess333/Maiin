// Fixed-contact layer candidate. Original native generated sources are immutable.
// Pixel equality is a preservation check, never anatomy or release approval.
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
const pixelCount = width * height;
const pins = {
  master: {
    path: "docs/exercise-art/masters/bulgarian-split/1.png",
    sha256: "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702",
  },
  bottom: {
    path: "docs/exercise-art/pilots/continuation-20261005/bulgarian-split/sources/bottom-repair-multiregion.png",
    sha256: "e2a7a41b2c30e2214ce3e7ab5164b5f02daa59d0494746efe66a4c06152653bb",
  },
  joinRepair: {
    path: "docs/exercise-art/pilots/continuation-20261005/bulgarian-split/sources/bottom-join-repair.png",
    sha256: "9fa275180ef8f7e12bfcb52be12173828b3e423d210524f4b6d0e16a8d90abba",
  },
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const portable = (path) => relative(repo, path).replaceAll("\\", "/");
const inside = (x, y, [left, top, w, h]) =>
  x >= left && x < left + w && y >= top && y < top + h;
const smooth = (t) => {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
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
  return { ...pin, data };
}
const [master, source, repair] = await Promise.all([
  readPinned(pins.master),
  readPinned(pins.bottom),
  readPinned(pins.joinRepair),
]);

// The rear calf can physically occlude the bench's left edge. Preserve its
// source pixels, including its antialiasing, instead of drawing the bench over
// the limb. Only the connected white anatomy around the specified seed is used;
// isolated bright bench bolts are excluded. The exact result is saved as a mask.
const guardRoi = [720, 590, 190, 200];
const guardSeed = [795, 685];
const guardDilation = 3;
const selected = new Uint8Array(pixelCount);
const queue = [guardSeed[1] * width + guardSeed[0]];
function isAnatomy(pixel) {
  const i = pixel * 3;
  const [r, g, b] = source.data.subarray(i, i + 3);
  return (
    Math.min(r, g, b) >= 140 && Math.max(r, g, b) - Math.min(r, g, b) <= 30
  );
}
if (!isAnatomy(queue[0]))
  throw new Error("Rear-calf guard seed left white anatomy");
selected[queue[0]] = 1;
for (let n = 0; n < queue.length; n++) {
  const pixel = queue[n];
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      const next = ny * width + nx;
      if (inside(nx, ny, guardRoi) && !selected[next] && isAnatomy(next)) {
        selected[next] = 1;
        queue.push(next);
      }
    }
  }
}
const guard = new Uint8Array(pixelCount);
for (const pixel of queue) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  for (let dy = -guardDilation; dy <= guardDilation; dy++) {
    for (let dx = -guardDilation; dx <= guardDilation; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height)
        guard[ny * width + nx] = 255;
    }
  }
}

// 0 = moving source, 255 = frozen master. Intermediate values occur only in
// the declared ankle joins. This deliberately remains a trial until the joins
// have been inspected at native scale; preservation does not hide doubled edges.
const alpha = new Uint8Array(pixelCount);
const benchRegions = [
  [809, 640, 591, 91],
  [760, 690, 665, 295],
];
const frontRegion = [320, 820, 260, 180];
const rearRegion = [832, 530, 180, 137];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    let weight = 0;
    if (benchRegions.some((box) => inside(x, y, box)) && !guard[pixel])
      weight = 255;
    if (inside(x, y, frontRegion))
      weight = Math.max(weight, Math.round(smooth((y - 820) / 30) * 255));
    if (inside(x, y, rearRegion))
      weight = Math.max(weight, Math.round(smooth((x - 832) / 16) * 255));
    alpha[pixel] = weight;
  }
}
const output = Buffer.from(source.data);
for (let pixel = 0; pixel < pixelCount; pixel++) {
  const weight = alpha[pixel];
  for (let c = 0; c < 3; c++) {
    const offset = pixel * 3 + c;
    output[offset] = Math.round(
      (source.data[offset] * (255 - weight) + master.data[offset] * weight) /
        255
    );
  }
}
const preliminary = Buffer.from(output);

// The image edit fixes anatomy; code only imports native pixels. This traced
// upper shoe boundary protects the frozen tongue, collar and complete shoe.
// It defines layer ownership, not new anatomy or a transformed silhouette.
const frontShoeUpperEdge = [
  [320, 1024],
  [369, 953],
  [372, 927],
  [386, 917],
  [407, 904],
  [429, 889],
  [450, 880],
  [460, 873],
  [466, 859],
  [471, 855],
  [479, 853],
  [485, 855],
  [490, 860],
  [492, 874],
  [497, 878],
  [505, 882],
  [513, 884],
  [519, 883],
  [523, 879],
  [526, 873],
  [528, 862],
  [533, 860],
  [538, 863],
  [542, 873],
  [547, 902],
  [551, 938],
  [580, 1024],
];
function frontShoeTop(x) {
  for (let i = 1; i < frontShoeUpperEdge.length; i++) {
    const [x0, y0] = frontShoeUpperEdge[i - 1];
    const [x1, y1] = frontShoeUpperEdge[i];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return height;
}
const frontRepairRegion = [426, 768, 125, 120];
const rearRepairRegion = [828, 578, 38, 99];
const repairAlpha = new Uint8Array(pixelCount);
const fixedSupport = new Uint8Array(pixelCount);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    let weight = 0;
    if (inside(x, y, frontRepairRegion)) {
      weight = Math.round(
        Math.min(smooth((y - 768) / 20), smooth((888 - y) / 6)) * 255
      );
    }
    if (inside(x, y, rearRepairRegion)) {
      weight = Math.max(
        weight,
        Math.round(Math.min(smooth((x - 828) / 5), smooth((866 - x) / 6)) * 255)
      );
    }
    const protectedShoe =
      (inside(x, y, frontRegion) && y >= frontShoeTop(x)) ||
      inside(x, y, [537, 848, 20, 48]) ||
      inside(x, y, [866, 530, 146, 137]);
    // Exposed bench pixels are always taken from the frozen master. The
    // imported rear anatomy can occlude it only inside this declared repair.
    const offset = pixel * 3;
    const repairRgb = repair.data.subarray(offset, offset + 3);
    const repairAnatomy =
      Math.min(...repairRgb) >= 90 &&
      Math.max(...repairRgb) - Math.min(...repairRgb) <= 40;
    const exposedBench =
      benchRegions.some((box) => inside(x, y, box)) &&
      !guard[pixel] &&
      !(weight > 0 && repairAnatomy);
    if (protectedShoe || exposedBench) {
      fixedSupport[pixel] = 255;
      weight = 0;
    }
    repairAlpha[pixel] = weight;
    for (let c = 0; c < 3; c++) {
      output[offset + c] = fixedSupport[pixel]
        ? master.data[offset + c]
        : Math.round(
            (preliminary[offset + c] * (255 - weight) +
              repair.data[offset + c] * weight) /
              255
          );
    }
  }
}
const untranslated = Buffer.from(output);
const frontTranslation = {
  maximumDx: 8,
  rampStartY: 778,
  fullFromY: 840,
  dy: 0,
};
// Only the generated ankle bridge receives this bounded local alignment.
// Linear horizontal sampling preserves a smooth translated contour. The complete moving pose,
// frozen supports and all pixels outside the declared bridge remain untouched.
for (
  let y = frontRepairRegion[1];
  y < frontRepairRegion[1] + frontRepairRegion[3];
  y++
) {
  const dx =
    frontTranslation.maximumDx *
    smooth(
      (y - frontTranslation.rampStartY) /
        (frontTranslation.fullFromY - frontTranslation.rampStartY)
    );
  for (
    let x = frontRepairRegion[0];
    x < frontRepairRegion[0] + frontRepairRegion[2];
    x++
  ) {
    const pixel = y * width + x;
    const weight = repairAlpha[pixel];
    if (!weight || fixedSupport[pixel]) continue;
    const offset = pixel * 3;
    const sampleX = x - dx;
    const sampleLeft = Math.floor(sampleX);
    const sampleFraction = sampleX - sampleLeft;
    const sampleOffset = (y * width + sampleLeft) * 3;
    for (let c = 0; c < 3; c++) {
      const repairValue =
        repair.data[sampleOffset + c] * (1 - sampleFraction) +
        repair.data[sampleOffset + 3 + c] * sampleFraction;
      output[offset + c] = Math.round(
        (preliminary[offset + c] * (255 - weight) + repairValue * weight) / 255
      );
    }
  }
}
const beforeProngReview = Buffer.from(output);
const ankleBackgroundClearance = [476, 852, 6, 5];
const fixedTongueEdgeProtection = [488, 860, 13, 20];
// Native source comparison identifies the first region as old ankle/background
// above the real shoe crest. The second retains the actual master tongue edge
// and removes the generated donor's parallel edge to its right.
for (
  let y = ankleBackgroundClearance[1];
  y < ankleBackgroundClearance[1] + ankleBackgroundClearance[3];
  y++
) {
  for (
    let x = ankleBackgroundClearance[0];
    x < ankleBackgroundClearance[0] + ankleBackgroundClearance[2];
    x++
  ) {
    const pixel = y * width + x;
    fixedSupport[pixel] = 0;
    repairAlpha[pixel] = 255;
    const offset = pixel * 3;
    // This region is below y840, where the declared alignment is exactly +8px.
    const sampleOffset = (y * width + x - frontTranslation.maximumDx) * 3;
    for (let c = 0; c < 3; c++)
      output[offset + c] = repair.data[sampleOffset + c];
  }
}
for (
  let y = fixedTongueEdgeProtection[1];
  y < fixedTongueEdgeProtection[1] + fixedTongueEdgeProtection[3];
  y++
) {
  for (
    let x = fixedTongueEdgeProtection[0];
    x < fixedTongueEdgeProtection[0] + fixedTongueEdgeProtection[2];
    x++
  ) {
    const pixel = y * width + x;
    fixedSupport[pixel] = 255;
    repairAlpha[pixel] = 0;
    const offset = pixel * 3;
    for (let c = 0; c < 3; c++) output[offset + c] = master.data[offset + c];
  }
}
let lineworkChangedPixels = 0;
let differencesOutsideLineworkRefinement = 0;
for (let pixel = 0; pixel < pixelCount; pixel++) {
  const offset = pixel * 3;
  const changed = [0, 1, 2].some(
    (c) => output[offset + c] !== beforeProngReview[offset + c]
  );
  if (!changed) continue;
  lineworkChangedPixels++;
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  if (
    !inside(x, y, ankleBackgroundClearance) &&
    !inside(x, y, fixedTongueEdgeProtection)
  )
    differencesOutsideLineworkRefinement++;
}
if (differencesOutsideLineworkRefinement)
  throw new Error("Linework refinement escaped its two declared rectangles");
let fixedPixels = 0;
let movingPixels = 0;
let joinPixels = 0;
let fixedChannelDifferences = 0;
let movingChannelDifferences = 0;
let protectedSupportPixels = 0;
let protectedSupportChannelDifferences = 0;
let outsideRepairChannelDifferences = 0;
let outsideDeclaredRepairPixels = 0;
let outsideDeclaredRepairChannelDifferences = 0;
for (let pixel = 0; pixel < pixelCount; pixel++) {
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  const outsideDeclaredRepair =
    !inside(x, y, frontRepairRegion) && !inside(x, y, rearRepairRegion);
  if (outsideDeclaredRepair) outsideDeclaredRepairPixels++;
  const fixed =
    fixedSupport[pixel] || (alpha[pixel] === 255 && repairAlpha[pixel] === 0);
  const moving =
    !fixedSupport[pixel] && alpha[pixel] === 0 && repairAlpha[pixel] === 0;
  if (fixed) fixedPixels++;
  else if (moving) movingPixels++;
  else joinPixels++;
  if (fixedSupport[pixel]) protectedSupportPixels++;
  for (let c = 0; c < 3; c++) {
    const offset = pixel * 3 + c;
    if (fixed && output[offset] !== master.data[offset])
      fixedChannelDifferences++;
    if (moving && output[offset] !== source.data[offset])
      movingChannelDifferences++;
    if (fixedSupport[pixel] && output[offset] !== master.data[offset])
      protectedSupportChannelDifferences++;
    if (
      !repairAlpha[pixel] &&
      !fixedSupport[pixel] &&
      output[offset] !== preliminary[offset]
    )
      outsideRepairChannelDifferences++;
    if (outsideDeclaredRepair && output[offset] !== preliminary[offset])
      outsideDeclaredRepairChannelDifferences++;
  }
}
if (
  fixedChannelDifferences ||
  movingChannelDifferences ||
  protectedSupportChannelDifferences ||
  outsideRepairChannelDifferences ||
  outsideDeclaredRepairChannelDifferences
)
  throw new Error("Fixed or moving pixel preservation failed");
mkdirSync(resolve(here, "qa"), { recursive: true });
const png = await sharp(output, { raw: { width, height, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(resolve(here, "bottom.png"), png);
const preliminaryPng = await sharp(preliminary, {
  raw: { width, height, channels: 3 },
})
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(resolve(here, "bottom-before-join.png"), preliminaryPng);
const untranslatedPng = await sharp(untranslated, {
  raw: { width, height, channels: 3 },
})
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(resolve(here, "bottom-join-untranslated.png"), untranslatedPng);
const beforeProngReviewPng = await sharp(beforeProngReview, {
  raw: { width, height, channels: 3 },
})
  .png({ compressionLevel: 9 })
  .toBuffer();
if (
  digest(beforeProngReviewPng) !==
  "be44d181e77addc57575ed6f516dff7371b97b00b655ebf678f28b50184913dc"
)
  throw new Error(
    "Previously reviewed contact candidate changed; review source and masks before continuing"
  );
writeFileSync(
  resolve(here, "bottom-before-prong-review.png"),
  beforeProngReviewPng
);
const layerMask = await sharp(alpha, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();
const guardMask = await sharp(guard, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();
writeFileSync(resolve(here, "fixed-layer-mask.png"), layerMask);
writeFileSync(resolve(here, "moving-calf-guard.png"), guardMask);
const repairMask = await sharp(repairAlpha, {
  raw: { width, height, channels: 1 },
})
  .png()
  .toBuffer();
const supportMask = await sharp(fixedSupport, {
  raw: { width, height, channels: 1 },
})
  .png()
  .toBuffer();
writeFileSync(resolve(here, "repair-import-mask.png"), repairMask);
writeFileSync(resolve(here, "protected-support-mask.png"), supportMask);

// QA crops only: these enlarged panels do not enter the candidate or production.
// Panels left-to-right are master, raw moving source, composited candidate.
const qaCrops = {
  "front-ankle": { left: 340, top: 790, width: 240, height: 180 },
  "rear-ankle": { left: 795, top: 530, width: 215, height: 165 },
};
for (const [name, crop] of Object.entries(qaCrops)) {
  const panels = await Promise.all(
    [master.data, preliminary, repair.data, output].map((data) =>
      sharp(data, { raw: { width, height, channels: 3 } })
        .extract(crop)
        .resize(crop.width * 2, crop.height * 2, { kernel: "nearest" })
        .png()
        .toBuffer()
    )
  );
  await sharp({
    create: {
      width: crop.width * 8,
      height: crop.height * 2,
      channels: 3,
      background: "black",
    },
  })
    .composite(
      panels.map((input, index) => ({
        input,
        left: index * crop.width * 2,
        top: 0,
      }))
    )
    .png()
    .toFile(resolve(here, "qa", `${name}.png`));
}
const report = {
  method:
    "Native RGB fixed-contact composition with localized generated ankle bridges. Only the generated front-ankle layer receives a documented 0–8px tapered horizontal translation using linear horizontal sampling. No whole-pose, camera or support transform. Fixed and untouched moving regions are checked channel-by-channel.",
  authorizationSource:
    "docs/exercise-art/pilots/shrugs-composite-20261003/README.md records the user-authorized fixed-contact compositing workflow; this continuation preserves source pixels and review controls.",
  reference: pins.master,
  movingSource: pins.bottom,
  localizedAnatomySource: pins.joinRepair,
  width,
  height,
  fixedBenchRectangles: benchRegions,
  frontSupport: { region: frontRegion, joinStartY: 820, fullyFixedFromY: 850 },
  rearSupport: { region: rearRegion, joinStartX: 832, fullyFixedFromX: 848 },
  calfOcclusionGuard: {
    roi: guardRoi,
    seed: guardSeed,
    minimumRgbChannel: 140,
    maximumChannelSpread: 30,
    eightConnected: true,
    dilationPixels: guardDilation,
    path: portable(resolve(here, "moving-calf-guard.png")),
    sha256: digest(guardMask),
    note: "Preserves the original moving calf and its 3px contour guard where it occludes the left bench edge. Isolated bench bolts are not in the connected component.",
  },
  exactLayerMask: {
    path: portable(resolve(here, "fixed-layer-mask.png")),
    sha256: digest(layerMask),
    meaning:
      "0=original moving RGB, 255=frozen master RGB; intermediate integers are the exact alpha used in round((moving*(255-alpha)+fixed*alpha)/255).",
  },
  localizedRepairImport: {
    frontRegion: frontRepairRegion,
    frontRamp: { fullFromY: 788, taperStartsY: 882, zeroFromY: 888 },
    rearRegion: rearRepairRegion,
    rearRamp: { fullFromX: 833, taperStartsX: 860, zeroFromX: 866 },
    frontShoeUpperEdge,
    frontTranslation,
    frozenCollarSurroundings: [537, 848, 20, 48],
    finalLineworkRefinement: {
      ankleBackgroundClearance,
      fixedTongueEdgeProtection,
      explanation:
        "The 6x5 clearance replaces only old ankle/background above the frozen tongue crest with the existing +8px aligned generated anatomy. The 13x20 protection retains the actual frozen tongue boundary and adjacent pixels, suppressing the donor's parallel contour. No new image generation or body redraw.",
      changedPixels: lineworkChangedPixels,
      differencesOutsideDeclaredRefinements:
        differencesOutsideLineworkRefinement,
      previousOutput: {
        path: portable(resolve(here, "bottom-before-prong-review.png")),
        sha256: digest(beforeProngReviewPng),
      },
    },
    regionRationale:
      "Front expands the prompted box by 4px left, 2px above and 7px below to include antialiasing and join within the ankle opening; frozen shoe protection excludes its tongue and collar. Rear is narrowed to x828–866 where original/repair contours agree, avoiding the generator's reshaped calf at x780 and lower knee.",
    repairImportMask: {
      path: portable(resolve(here, "repair-import-mask.png")),
      sha256: digest(repairMask),
    },
    protectedSupportMask: {
      path: portable(resolve(here, "protected-support-mask.png")),
      sha256: digest(supportMask),
    },
    operation:
      "First build the fixed/moving preliminary image. Then blend only the declared repair mask against it; generated front-ankle RGB is sampled at x-8*smooth((y-778)/62), y with linear interpolation between adjacent horizontal pixels. Protected support pixels and collar surroundings always equal the frozen master. All other pixels remain the preliminary image exactly.",
  },
  previousRejectedOutput: {
    path: portable(resolve(here, "bottom-before-join.png")),
    sha256: digest(preliminaryPng),
  },
  rejectedUntranslatedRepair: {
    path: portable(resolve(here, "bottom-join-untranslated.png")),
    sha256: digest(untranslatedPng),
    finding:
      "Protected unshifted import retains a duplicated tongue edge because generation moved the front collar left of the frozen shoe.",
  },
  output: { path: portable(resolve(here, "bottom.png")), sha256: digest(png) },
  preservation: {
    fixedPixels,
    movingPixels,
    joinPixels,
    fixedChannelDifferences,
    movingChannelDifferences,
    protectedSupportPixels,
    protectedSupportChannelDifferences,
    outsideRepairChannelDifferences,
    outsideDeclaredRepairPixels,
    outsideDeclaredRepairChannelDifferences,
  },
  reviewStatus: "contact-candidate-awaiting-full-movement-review",
  releaseApproved: false,
  nativeVisualReview: {
    fullCanvasInspected: true,
    enlargedJoinCropsInspected: true,
    independentReview: {
      verifiedOutputSha256:
        "97ede66ab06894d36c2712222aba62a997c0b0a63c82e7b09903eef1956ec32f",
      localVerdict: "continuity-and-targeted-tongue-corrections-pass",
      resolvedPriorFrontLineEndsApproximate: [
        [479, 855],
        [493, 872],
      ],
      coordinateUncertaintyPixels: 4,
      finding:
        "Both targeted dark artifacts are resolved in the native frame and updated ankle crop. The upper copied black fragment is gone; the lower tongue edge is continuous without the second donor contour. A faint pale shading transition remains immediately behind the tongue enlarged, but does not read as an open seam or detached bridge at native size. Rear join is clean. This does not approve movement, overall artwork, color or equipment.",
    },
    frontAnkle: {
      outcome: "continuous-join-in-local-native-review",
      problemBounds: [444, 812, 85, 40],
      suggestedGenerationContext: [420, 770, 140, 125],
      finding:
        "The generated front-ankle bridge, bounded 0–8px local horizontal alignment and frozen collar-surroundings mask remove the earlier cut silhouette and duplicated shoe edge. The front shoe stays exactly on the frozen support layer. This is local join review only; full technique, proportions and playback remain unapproved.",
    },
    rearAnkle: {
      outcome: "continuous-join-in-local-native-review",
      problemBounds: [832, 595, 16, 20],
      suggestedGenerationContext: [795, 565, 107, 110],
      finding:
        "The narrow x828–866 generated bridge removes the former step while retaining the original calf to its left and the frozen ankle/shoe to its right. The larger generated calf/knee redraw is not imported. Full movement and equipment review remain separate.",
    },
    requiredNextStep:
      "Review the completed movement with the selected deep, highlighting and equipment candidates. This pinned contact candidate does not approve later body/equipment changes or release artwork. Rebuild and recheck evidence if any selected source or composition changes.",
  },
  limitations: [
    "Only the documented generated ankle regions are imported. The original body and dumbbells remain the pinned multiregion source; separate later color or rigid-equipment edits are not included.",
    "Exact support pixels do not establish a clean anatomical join, correct proportions, technique, grips or a smooth six-frame loop.",
  ],
  qa: {
    crops: qaCrops,
    displayScale: 2,
    order: [
      "frozen master",
      "previous rejected composite",
      "generated repair",
      "localized import candidate",
    ],
    candidatePixelsResized: false,
  },
};
const reportPath = resolve(here, "composition.json");
writeFileSync(
  reportPath,
  await format(JSON.stringify(report), {
    ...(await resolveConfig(reportPath)),
    filepath: reportPath,
  })
);
console.log(
  JSON.stringify(
    {
      output: report.output,
      preservation: report.preservation,
      releaseApproved: false,
    },
    null,
    2
  )
);
