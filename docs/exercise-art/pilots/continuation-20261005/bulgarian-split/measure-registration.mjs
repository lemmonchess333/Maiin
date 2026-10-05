// Read-only image diagnostic. Writes registration.json; never edits image pixels.
// Run from any working directory with: node <path-to-this-file> [extra PNG paths]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../..");
const referencePath = resolve(
  repo,
  "docs/exercise-art/masters/bulgarian-split/1.png"
);
const outputPath = resolve(here, "registration.json");
const radius = 15;
const side = radius * 2 + 1;
const searchRadius = 30;
const existingReleaseAnchorLimitPixels = 1;
const existingReleaseDimensionDriftLimitFraction = 0.01;

// Selected visually on the corrected 1536x1024, facing-left / bench-right
// master. These are distinctive patch centres, not claimed joint centres or
// exact physical contact coordinates. Reselect if the master scene changes.
const patches = {
  frontToe: { x: 390, y: 938, region: "Front shoe toe/sole contour" },
  frontHeel: { x: 533, y: 934, region: "Front shoe heel/sole contour" },
  rearLacesPad: { x: 932, y: 646, region: "Rear laces and bench-pad contact" },
  benchRightPadCorner: {
    x: 1374,
    y: 677,
    region: "Exposed right bench-pad corner",
  },
  benchNearLegBolt: { x: 1295, y: 884, region: "Near bench-leg lower bolt" },
  benchFarLegBolt: { x: 865, y: 705, region: "Far bench-leg upper bolt" },
  benchFarBaseCorner: { x: 810, y: 885, region: "Far bench-base corner" },
  benchNearBaseCorner: { x: 1252, y: 950, region: "Near bench-base corner" },
};
const projectedSpanDefinitions = {
  frontShoeSupportSpan: ["frontToe", "frontHeel"],
  benchFloorFootSpan: ["benchFarBaseCorner", "benchNearBaseCorner"],
};

const sourceNames = [
  "setup.png",
  "shallow.png",
  "deep.png",
  "bottom.png",
  // Preserve comparisons with the initial support-glute colour and endpoint.
  "setup-initial.png",
  "bottom-initial.png",
  "bottom-repair-multiregion.png",
  "bottom-protected-regions.png",
  "bottom-join-repair.png",
  "deep-grip-repair.png",
  "deep-master-only.png",
  "bottom-secondary-repair.png",
];
const compositeNames = ["bottom.png", "shallow.png", "deep.png"];
const portablePath = (path) => relative(repo, path).replaceAll("\\", "/");
const rounded = (value) => Number(value.toFixed(6));

async function readImage(path) {
  const bytes = readFileSync(path);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 1536 || info.height !== 1024 || info.channels !== 3) {
    throw new Error(
      `Expected native 1536x1024 RGB image: ${portablePath(path)}`
    );
  }
  return {
    path: portablePath(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    width: info.width,
    height: info.height,
    data,
  };
}

const reference = await readImage(referencePath);
const channelCount = side * side * 3;

function samplePatch(data, point) {
  const sample = new Uint8Array(channelCount);
  for (let row = 0; row < side; row++) {
    const offset =
      ((point.y - radius + row) * reference.width + point.x - radius) * 3;
    sample.set(data.subarray(offset, offset + side * 3), row * side * 3);
  }
  return sample;
}

function absoluteError(sample, image, point, dx, dy) {
  let total = 0;
  for (let row = 0; row < side; row++) {
    const offset =
      ((point.y - radius + row + dy) * image.width + point.x - radius + dx) * 3;
    const sampleOffset = row * side * 3;
    for (let channel = 0; channel < side * 3; channel++) {
      total += Math.abs(
        sample[sampleOffset + channel] - image.data[offset + channel]
      );
    }
  }
  return total;
}

const referencePatches = Object.fromEntries(
  Object.entries(patches).map(([name, point]) => {
    if (
      point.x - radius - searchRadius < 0 ||
      point.y - radius - searchRadius < 0 ||
      point.x + radius + searchRadius >= reference.width ||
      point.y + radius + searchRadius >= reference.height
    ) {
      throw new Error(`Patch search leaves canvas: ${name}`);
    }
    const sample = samplePatch(reference.data, point);
    const mean =
      sample.reduce((total, value) => total + value, 0) / channelCount;
    const variance =
      sample.reduce((total, value) => total + (value - mean) ** 2, 0) /
      channelCount;
    return [name, { sample, standardDeviation: rounded(Math.sqrt(variance)) }];
  })
);

function measure(image) {
  const measurements = {};
  for (const [name, point] of Object.entries(patches)) {
    const { sample, standardDeviation } = referencePatches[name];
    const zeroError = absoluteError(sample, image, point, 0, 0);
    let best = { sumAbsoluteDifference: zeroError, dx: 0, dy: 0 };
    // An exact zero-offset match is already the global optimum. Otherwise
    // inspect every integer translation. Equal-error ties prefer least motion.
    if (zeroError !== 0) {
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const error = absoluteError(sample, image, point, dx, dy);
          if (
            error < best.sumAbsoluteDifference ||
            (error === best.sumAbsoluteDifference &&
              dx * dx + dy * dy < best.dx * best.dx + best.dy * best.dy)
          ) {
            best = { sumAbsoluteDifference: error, dx, dy };
          }
        }
      }
    }
    measurements[name] = {
      region: point.region,
      referenceCentre: { x: point.x, y: point.y },
      referenceBox: [point.x - radius, point.y - radius, side, side],
      referenceChannelStandardDeviation: standardDeviation,
      zeroOffset: {
        sumAbsoluteDifference: zeroError,
        meanAbsoluteChannelDifference: rounded(zeroError / channelCount),
      },
      bestTranslation: {
        dx: best.dx,
        dy: best.dy,
        centre: { x: point.x + best.dx, y: point.y + best.dy },
        sumAbsoluteDifference: best.sumAbsoluteDifference,
        meanAbsoluteChannelDifference: rounded(
          best.sumAbsoluteDifference / channelCount
        ),
        errorImprovementFraction:
          zeroError === 0
            ? 0
            : rounded(1 - best.sumAbsoluteDifference / zeroError),
        touchesSearchBoundary:
          Math.abs(best.dx) === searchRadius ||
          Math.abs(best.dy) === searchRadius,
        exceedsExistingReleaseAnchorLimit:
          Math.abs(best.dx) > existingReleaseAnchorLimitPixels ||
          Math.abs(best.dy) > existingReleaseAnchorLimitPixels,
      },
    };
  }
  const projectedSupportSpans = Object.fromEntries(
    Object.entries(projectedSpanDefinitions).map(([name, endpoints]) => {
      const [first, second] = endpoints.map((key) => measurements[key]);
      const referenceLength = Math.hypot(
        second.referenceCentre.x - first.referenceCentre.x,
        second.referenceCentre.y - first.referenceCentre.y
      );
      const measuredLength = Math.hypot(
        second.bestTranslation.centre.x - first.bestTranslation.centre.x,
        second.bestTranslation.centre.y - first.bestTranslation.centre.y
      );
      const relativeDrift =
        Math.abs(measuredLength - referenceLength) / referenceLength;
      return [
        name,
        {
          endpointPatches: endpoints,
          measuredCentres: endpoints.map(
            (key) => measurements[key].bestTranslation.centre
          ),
          referenceLengthPixels: rounded(referenceLength),
          candidateLengthPixels: rounded(measuredLength),
          lengthChangePixels: rounded(measuredLength - referenceLength),
          relativeDriftFraction: rounded(relativeDrift),
          exceedsExistingDimensionDriftLimit:
            relativeDrift > existingReleaseDimensionDriftLimitFraction,
        },
      ];
    })
  );
  return {
    path: image.path,
    sha256: image.sha256,
    bytes: image.bytes,
    dimensions: [image.width, image.height],
    patches: measurements,
    projectedSupportSpans,
    diagnosticExceedances: Object.entries(measurements)
      .filter(
        ([, value]) => value.bestTranslation.exceedsExistingReleaseAnchorLimit
      )
      .map(([name]) => name),
    projectedSpanDiagnosticExceedances: Object.entries(projectedSupportSpans)
      .filter(([, value]) => value.exceedsExistingDimensionDriftLimit)
      .map(([name]) => name),
  };
}

const presentSources = sourceNames
  .map((name) => resolve(here, "sources", name))
  .filter((path) => existsSync(path));
const presentComposites = compositeNames
  .map((name) => resolve(here, "composite", name))
  .filter((path) => existsSync(path));
const requestedExtraCandidates = process.argv
  .slice(2)
  .map((path) => resolve(repo, path));
for (const path of requestedExtraCandidates) {
  if (!existsSync(path))
    throw new Error(`Requested candidate is missing: ${portablePath(path)}`);
}
const frames = [];
for (const path of new Set([
  ...presentSources,
  ...presentComposites,
  ...requestedExtraCandidates,
])) {
  frames.push(measure(await readImage(path)));
}
const result = {
  schemaVersion: 1,
  exerciseId: "bulgarian-split",
  method:
    "Native 31x31 RGB reference patches, exhaustive +/-30px integer translation search minimizing absolute channel difference. Zero-offset and best-translation errors are both recorded. Equal-error ties prefer the smallest translation. No image pixels are edited.",
  interpretation:
    "A best matching patch can move because of redraw, changed shading, occlusion or physical translation. These are candidate registration diagnostics, not automatic anchor, anatomy, technique, equipment or release approval. Inspect low-texture and residual-error matches visually; a search-boundary match may lie outside this window.",
  existingReleaseAnchorLimitPixels,
  existingReleaseDimensionDriftLimitFraction,
  projectedSupportSpanInterpretation:
    "Native 2D distances between measured best-match patch centres: frontShoeSupportSpan=hypot(frontHeel-frontToe); benchFloorFootSpan=hypot(benchNearBaseCorner-benchFarBaseCorner). These are projected support-registration spans, not guessed physical dimensions, skeletal lengths or equipment dimensions. They supplement and do not replace body, gear, anatomy or movement review. Patch redraw or occlusion can affect the derived spans.",
  releaseApproved: false,
  imagesEdited: false,
  reference: {
    path: reference.path,
    sha256: reference.sha256,
    bytes: reference.bytes,
    dimensions: [reference.width, reference.height],
  },
  patchSize: [side, side],
  searchRadiusPixels: searchRadius,
  missingOptionalSources: sourceNames.filter(
    (name) => !existsSync(resolve(here, "sources", name))
  ),
  missingOptionalComposites: compositeNames.filter(
    (name) => !existsSync(resolve(here, "composite", name))
  ),
  requestedExtraCandidates: requestedExtraCandidates.map(portablePath),
  frames,
};
writeFileSync(
  outputPath,
  await format(JSON.stringify(result), {
    ...(await resolveConfig(outputPath)),
    filepath: outputPath,
  })
);
console.log(
  JSON.stringify(
    {
      report: portablePath(outputPath),
      referenceSha256: reference.sha256,
      releaseApproved: false,
      frames: frames.map((frame) => ({
        path: frame.path,
        diagnosticExceedances: frame.diagnosticExceedances,
        projectedSupportSpans: frame.projectedSupportSpans,
        patches: Object.fromEntries(
          Object.entries(frame.patches).map(([name, measurement]) => [
            name,
            {
              dx: measurement.bestTranslation.dx,
              dy: measurement.bestTranslation.dy,
              zeroError: measurement.zeroOffset.meanAbsoluteChannelDifference,
              bestError:
                measurement.bestTranslation.meanAbsoluteChannelDifference,
            },
          ])
        ),
      })),
    },
    null,
    2
  )
);
