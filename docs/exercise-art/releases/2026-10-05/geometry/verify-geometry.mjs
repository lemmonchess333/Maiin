// Read-only native image verification. Writes evidence only to the given output directory.
// Usage: node verify-geometry.mjs <repository-root> [evidence-output-directory]
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
assert(
  process.argv[2],
  "Usage: node verify-geometry.mjs <repository-root> [evidence-output-directory]"
);
const repo = resolve(process.argv[2]);
const output = resolve(process.argv[3] || dirname(self));
const require = createRequire(resolve(repo, "package.json"));
const sharp = require("sharp");
const { format, resolveConfig } = require("prettier");
const formatting = (await resolveConfig(self)) || {};
const serializeJson = (value) =>
  format(JSON.stringify(value), { ...formatting, parser: "json" });
const base = "docs/exercise-art/pilots/continuation-20261005/bulgarian-split";
const v2 = `${base}/rigid-equipment-v2`;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const round = (n) => Number(n.toFixed(6));
const trackedInputs = new Map();
function pinned(path, expected) {
  const bytes = readFileSync(resolve(repo, path));
  const actual = sha(bytes);
  if (expected) assert.equal(actual, expected, `Hash mismatch: ${path}`);
  trackedInputs.set(path, { path, sha256: actual, bytes: bytes.length });
  return bytes;
}
function pinnedJson(path, expected) {
  return JSON.parse(pinned(path, expected));
}
const registration = pinnedJson(
  `${base}/registration.json`,
  "5177e3a66deed3f88775cb59afa101987a2b2d36fd13c1aca4ac56e105137bb3"
);
pinned(
  `${base}/measure-registration.mjs`,
  "aed96880e65bd79d9a05310cbb7700f11852b325287076e82c81218a9c5f085e"
);
const composition = pinnedJson(
  `${v2}/composition.json`,
  "565ae0de392d54e2241cc5a554eb20e2985c53a30d47cc72e2323ed8718d6575"
);
const combination = pinnedJson(
  `${v2}/combination.json`,
  "0ef9b4b4605118db2705b5d8a0034bb14049efba8808039668c1b5141bc95bbc"
);
const diagnostics = pinnedJson(
  `${v2}/diagnostics.json`,
  "f3bc753d6adc61ae8cca33263f444ccf307d1d7053f1b1c9959740b143730fca"
);
pinned(
  `${v2}/native-review.json`,
  "45e9e01d49c25b602f207b5f57e26d5037d6e4a6da10f12be2285c559729d4fc"
);
pinned(`${v2}/${composition.equipment.path}`, composition.equipment.sha256);
const anchorCentres = {
  frontToe: { x: 390, y: 938 },
  frontHeel: { x: 533, y: 934 },
  rearLacesPad: { x: 932, y: 646 },
  benchRightPadCorner: { x: 1374, y: 677 },
  benchNearLegBolt: { x: 1295, y: 884 },
  benchFarLegBolt: { x: 865, y: 705 },
  benchFarBaseCorner: { x: 810, y: 885 },
  benchNearBaseCorner: { x: 1252, y: 950 },
};
const spanDefinitions = {
  frontShoeSupportSpan: ["frontToe", "frontHeel"],
  benchFloorFootSpan: ["benchFarBaseCorner", "benchNearBaseCorner"],
};
const originals = {
  setup: [
    "sources/setup.png",
    "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702",
  ],
  shallow: [
    "sources/shallow.png",
    "a1bb1762a10f5d01af746f79d14b9b169a71e3205d83e3538e0dd1eff59785ec",
  ],
  deep: [
    "composite/deep.png",
    "eb30ff85c3adbe6b603fbafee826f48d125ec92e100651bf725e8ee1979e7fa2",
  ],
  bottom: [
    "composite/bottom.png",
    "97ede66ab06894d36c2712222aba62a997c0b0a63c82e7b09903eef1956ec32f",
  ],
};
const selectedPins = {
  setup: "f93fc4136da95f40799f4da0fb1386fc8cb3e943a8467fdcd46d904038d87057",
  shallow: "4646fb08e1d96df0d3d03d2642c63d78861f1d707edd5a33f07b38662a1194b3",
  deep: "d3551326c4964abacea0978e604d2cf7d856aaa1bd25bdd5b99d95a20233002b",
  bottom: "9a3da727c7801234407a1d97811e5603edfbf9ca43b96d6b6534d37ea5b7c954",
};
const order = ["setup", "shallow", "deep", "bottom", "deep", "shallow"];
assert.deepEqual(registration.patchSize, [31, 31]);
assert.equal(registration.searchRadiusPixels, 30);
assert.equal(registration.existingReleaseAnchorLimitPixels, 1);
assert.equal(registration.existingReleaseDimensionDriftLimitFraction, 0.01);
assert.equal(registration.reference.sha256, originals.setup[1]);
assert.deepEqual(composition.unchangedReviewBounds, {
  fixedAnchorMaxAxisDriftPixels: 1,
  invariantDimensionsMaxRelativeDrift: 0.01,
});

async function rgb(path, expected, checkOpacity = false) {
  const bytes = pinned(path, expected);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [1536, 1024, 3]);
  let nonOpaquePixels = null;
  if (checkOpacity) {
    const rgba = await sharp(bytes)
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer();
    nonOpaquePixels = 0;
    for (let i = 3; i < rgba.length; i += 4)
      if (rgba[i] !== 255) nonOpaquePixels++;
    assert.equal(nonOpaquePixels, 0, `Opacity: ${path}`);
  }
  return {
    data,
    path,
    sha256: sha(bytes),
    bytes: bytes.length,
    dimensions: [1536, 1024],
    nonOpaquePixels,
  };
}
function sample(data, box) {
  const [x, y, width, height] = box;
  assert(x >= 0 && y >= 0 && x + width <= 1536 && y + height <= 1024);
  const out = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row++) {
    const offset = ((y + row) * 1536 + x) * 3;
    data.copy(out, row * width * 3, offset, offset + width * 3);
  }
  return out;
}
function difference(a, b) {
  assert.equal(a.length, b.length);
  let changedChannels = 0,
    sumAbsoluteDifference = 0,
    maxAbsoluteChannelDifference = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta) changedChannels++;
    sumAbsoluteDifference += delta;
    maxAbsoluteChannelDifference = Math.max(
      maxAbsoluteChannelDifference,
      delta
    );
  }
  return {
    changedChannels,
    sumAbsoluteDifference,
    maxAbsoluteChannelDifference,
  };
}
function sad(referenceSample, target, point, dx, dy) {
  return difference(
    referenceSample,
    sample(target, [point.x - 15 + dx, point.y - 15 + dy, 31, 31])
  ).sumAbsoluteDifference;
}
// Same fallback search and tie order as the pinned historical helper, in memory only.
function search(referenceSample, target, point) {
  const zero = sad(referenceSample, target, point, 0, 0);
  let best = { sumAbsoluteDifference: zero, dx: 0, dy: 0 };
  if (zero)
    for (let dy = -30; dy <= 30; dy++)
      for (let dx = -30; dx <= 30; dx++) {
        const value = sad(referenceSample, target, point, dx, dy);
        if (
          value < best.sumAbsoluteDifference ||
          (value === best.sumAbsoluteDifference &&
            dx * dx + dy * dy < best.dx * best.dx + best.dy * best.dy)
        )
          best = { sumAbsoluteDifference: value, dx, dy };
      }
  return {
    ...best,
    centre: { x: point.x + best.dx, y: point.y + best.dy },
    meanAbsoluteChannelDifference: round(best.sumAbsoluteDifference / 2883),
    errorImprovementFraction:
      zero === 0 ? 0 : round(1 - best.sumAbsoluteDifference / zero),
    touchesSearchBoundary: Math.abs(best.dx) === 30 || Math.abs(best.dy) === 30,
    exceedsExistingReleaseAnchorLimit:
      Math.abs(best.dx) > 1 || Math.abs(best.dy) > 1,
  };
}
function alphaBounds(data, width, height, threshold) {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    pixels = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] >= threshold) {
        minX = Math.min(x, minX);
        minY = Math.min(y, minY);
        maxX = Math.max(x, maxX);
        maxY = Math.max(y, maxY);
        pixels++;
      }
  assert(pixels > 0);
  return {
    box: [minX, minY, maxX - minX + 1, maxY - minY + 1],
    pixelCount: pixels,
    threshold,
  };
}

const reference = await rgb(
  registration.reference.path,
  registration.reference.sha256
);
assert.equal(reference.bytes, registration.reference.bytes);
const baselineImages = {},
  baselineRecords = {};
for (const [name, [suffix, hash]] of Object.entries(originals)) {
  const path = `${base}/${suffix}`;
  const record = registration.frames.find((frame) => frame.path === path);
  assert(record, `Missing historical measurement: ${path}`);
  assert.equal(record.sha256, hash);
  const original = await rgb(path, hash);
  assert.equal(original.bytes, record.bytes);
  assert.deepEqual(original.dimensions, record.dimensions);
  baselineImages[name] = original;
  baselineRecords[name] = record;
}
const layers = {};
for (const projection of composition.projections) {
  const path = `${v2}/dumbbell-${projection.name}.png`;
  const bytes = pinned(path, projection.sha256);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(
    [info.width, info.height, info.channels],
    [projection.width, projection.height, 4]
  );
  layers[projection.name] = {
    ...projection,
    data,
    path,
    alphaNonzeroBounds: alphaBounds(data, info.width, info.height, 1),
    alphaHalfCoverageBounds: alphaBounds(data, info.width, info.height, 128),
  };
}
const normalized = await sharp(pinned(`${v2}/dumbbell-opaque-interior.png`))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const headDimensions = {};
for (const projection of composition.projections)
  for (const name of ["front", "rear"]) {
    const part = projection.parts[name];
    // Reconstruct the one-time source projection in memory only; no file or image edits.
    const data = await sharp(normalized.data, {
      raw: {
        width: normalized.info.width,
        height: normalized.info.height,
        channels: 4,
      },
    })
      .extract(composition.sourceParts[name])
      .resize(...part.size, { fit: "fill", kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const bounds = alphaBounds(data, ...part.size, 128);
    assert.deepEqual(
      bounds.box,
      diagnostics.invariantLayerGeometry[`${projection.name}-${name}`]
        .alphaHalfCoverageBounds
    );
    headDimensions[`${projection.name}-${name}`] = {
      allocatedSize: part.size,
      alphaHalfCoverageBounds: bounds,
      constructionOnly: true,
    };
  }
const facePatches = [
  { name: "near-front-face", layer: "near", box: [13, 30, 17, 23] },
  { name: "near-rear-face", layer: "near", box: [148, 33, 17, 23] },
  { name: "far-front-face", layer: "far", box: [12, 30, 15, 22] },
];
const frames = [];
for (const [index, poseName] of order.entries()) {
  const selected = await rgb(
    `${base}/frames/${index + 1}.png`,
    selectedPins[poseName],
    true
  );
  const frozen = combination.results.find((r) => r.name === poseName);
  assert.equal(frozen.sha256, selected.sha256);
  pinned(`${v2}/${frozen.path}`, frozen.sha256);
  const baseline = baselineImages[poseName],
    record = baselineRecords[poseName];
  const anchors = {},
    searchWindows = {},
    measurements = {};
  for (const [name, centre] of Object.entries(anchorCentres)) {
    const historical = record.patches[name];
    assert.deepEqual(historical.referenceCentre, centre);
    const referenceBox = [centre.x - 15, centre.y - 15, 31, 31];
    assert.deepEqual(historical.referenceBox, referenceBox);
    const box = [centre.x - 45, centre.y - 45, 91, 91];
    const originalWindow = sample(baseline.data, box),
      selectedWindow = sample(selected.data, box);
    const delta = difference(originalWindow, selectedWindow);
    const refSample = sample(reference.data, referenceBox);
    const zeroSad = sad(refSample, baseline.data, centre, 0, 0);
    const historicalBest = historical.bestTranslation;
    assert.equal(zeroSad, historical.zeroOffset.sumAbsoluteDifference);
    assert.equal(
      sad(
        refSample,
        baseline.data,
        centre,
        historicalBest.dx,
        historicalBest.dy
      ),
      historicalBest.sumAbsoluteDifference
    );
    const best =
      delta.changedChannels === 0
        ? structuredClone(historicalBest)
        : search(refSample, selected.data, centre);
    assert.deepEqual(best.centre, {
      x: centre.x + best.dx,
      y: centre.y + best.dy,
    });
    const selectedZeroSad = sad(refSample, selected.data, centre, 0, 0);
    assert.equal(
      sad(refSample, selected.data, centre, best.dx, best.dy),
      best.sumAbsoluteDifference
    );
    const maxAxisDriftPixels = Math.max(Math.abs(best.dx), Math.abs(best.dy));
    searchWindows[name] = {
      box,
      channelsCompared: selectedWindow.length,
      baselineRgbSha256: sha(originalWindow),
      selectedRgbSha256: sha(selectedWindow),
      ...delta,
      transferValid: delta.changedChannels === 0,
    };
    measurements[name] = {
      region: historical.region,
      method:
        delta.changedChannels === 0
          ? "deterministic-transfer-after-full-search-window-equality"
          : "isolated-identical-exhaustive-search",
      referenceCentre: centre,
      zeroOffset: {
        sumAbsoluteDifference: selectedZeroSad,
        meanAbsoluteChannelDifference: round(selectedZeroSad / 2883),
      },
      bestTranslation: best,
      maxAxisDriftPixels,
      withinExistingOnePixelBound: maxAxisDriftPixels <= 1,
    };
    anchors[name] = best.centre;
  }
  const supportSpans = {};
  for (const [name, endpoints] of Object.entries(spanDefinitions)) {
    const [a, b] = endpoints.map((key) => anchors[key]);
    const [ra, rb] = endpoints.map((key) => anchorCentres[key]);
    const referenceLengthPixels = Math.hypot(rb.x - ra.x, rb.y - ra.y);
    const lengthPixels = Math.hypot(b.x - a.x, b.y - a.y);
    const relativeDriftFraction = Math.abs(
      lengthPixels / referenceLengthPixels - 1
    );
    if (Object.values(searchWindows).every((w) => w.transferValid))
      assert.equal(
        round(lengthPixels),
        record.projectedSupportSpans[name].candidateLengthPixels
      );
    supportSpans[name] = {
      endpointPatches: endpoints,
      measuredCentres: [a, b],
      referenceLengthPixels,
      lengthPixels,
      relativeDriftFraction,
      withinExistingOnePercentBound: relativeDriftFraction <= 0.01,
    };
  }
  const construction = composition.results.find((r) => r.name === poseName);
  const equipment = {};
  for (const name of ["near", "far"]) {
    const layer = layers[name],
      shift = construction.shifts[name];
    assert(shift.every(Number.isInteger));
    equipment[name] = {
      layer: { path: layer.path, sha256: layer.sha256 },
      allocation: [layer.width, layer.height],
      alphaNonzeroBounds: layer.alphaNonzeroBounds,
      alphaHalfCoverageBounds: layer.alphaHalfCoverageBounds,
      alphaHalfCoverageWidthPixels: layer.alphaHalfCoverageBounds.box[2],
      translatedOrigin: [
        layer.origin[0] + shift[0],
        layer.origin[1] + shift[1],
      ],
      translation: shift,
      scale: 1,
      rotationDegrees: 0,
      relativeDimensionDriftFraction: 0,
      withinExistingOnePercentBound: true,
      interpretation:
        "Width of one fixed, alpha-bearing projection reused by integer translation; body/hand foreground may occlude part of its visible silhouette.",
    };
  }
  const faceChecks = facePatches.map((patch) => {
    const layer = layers[patch.layer],
      origin = equipment[patch.layer].translatedOrigin;
    const [x, y, width, height] = patch.box;
    const referenceRgb = Buffer.alloc(width * height * 3);
    let nonOpaqueLayerPixels = 0;
    for (let row = 0; row < height; row++)
      for (let column = 0; column < width; column++) {
        const i = ((row + y) * layer.width + column + x) * 4,
          j = (row * width + column) * 3;
        if (layer.data[i + 3] !== 255) nonOpaqueLayerPixels++;
        for (let c = 0; c < 3; c++) referenceRgb[j + c] = layer.data[i + c];
      }
    const box = [origin[0] + x, origin[1] + y, width, height];
    return {
      name: patch.name,
      box,
      nonOpaqueLayerPixels,
      ...difference(referenceRgb, sample(selected.data, box)),
    };
  });
  const invariantDimensions = {
    frontShoeSupportSpan: supportSpans.frontShoeSupportSpan.lengthPixels,
    benchFloorFootSpan: supportSpans.benchFloorFootSpan.lengthPixels,
    nearEquipmentProjectionWidth: equipment.near.alphaHalfCoverageWidthPixels,
    farEquipmentProjectionWidth: equipment.far.alphaHalfCoverageWidthPixels,
    nearFrontHeadWidth:
      headDimensions["near-front"].alphaHalfCoverageBounds.box[2],
    farFrontHeadWidth:
      headDimensions["far-front"].alphaHalfCoverageBounds.box[2],
  };
  const { data: omitted, ...image } = selected;
  frames.push({
    slot: index + 1,
    pose: poseName,
    ...image,
    frozenCandidate: `${v2}/${frozen.path}`,
    baselineMeasurement: {
      path: record.path,
      sha256: record.sha256,
      report: `${base}/registration.json`,
    },
    anchors,
    invariantDimensions,
    searchWindows,
    measurements,
    supportSpans,
    equipment,
    faceChecks,
  });
}
const summary = {
  selectedFrames: frames.length,
  anchorsPerFrame: 8,
  exactSearchWindows: frames
    .flatMap((f) => Object.values(f.searchWindows))
    .filter((w) => w.transferValid).length,
  isolatedSearchReruns: frames
    .flatMap((f) => Object.values(f.searchWindows))
    .filter((w) => !w.transferValid).length,
  totalSearchWindowChannelsCompared: frames
    .flatMap((f) => Object.values(f.searchWindows))
    .reduce((n, w) => n + w.channelsCompared, 0),
  maximumAnchorAxisDriftPixels: Math.max(
    ...frames.flatMap((f) =>
      Object.values(f.measurements).map((m) => m.maxAxisDriftPixels)
    )
  ),
  maximumSupportSpanRelativeDriftFraction: Math.max(
    ...frames.flatMap((f) =>
      Object.values(f.supportSpans).map((s) => s.relativeDriftFraction)
    )
  ),
  maximumEquipmentDimensionDriftFraction: 0,
  exactOpaqueEquipmentFaceChecks: frames
    .flatMap((f) => f.faceChecks)
    .filter((p) => p.changedChannels === 0 && p.nonOpaqueLayerPixels === 0)
    .length,
  nonOpaqueSelectedPixels: frames.reduce((n, f) => n + f.nonOpaquePixels, 0),
};
const strictGeometryErrors = [];
for (const frame of frames) {
  for (const [name, point] of Object.entries(frame.anchors))
    for (const axis of ["x", "y"])
      if (
        !Number.isFinite(point[axis]) ||
        point[axis] < 0 ||
        point[axis] >= (axis === "x" ? 1536 : 1024) ||
        Math.abs(point[axis] - frames[0].anchors[name][axis]) > 1
      )
        strictGeometryErrors.push(`Frame ${frame.slot} ${name}.${axis}`);
  for (const [name, value] of Object.entries(frame.invariantDimensions))
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      Math.abs(value / frames[0].invariantDimensions[name] - 1) > 0.01
    )
      strictGeometryErrors.push(`Frame ${frame.slot} ${name}`);
}
assert.equal(
  summary.exactSearchWindows,
  48,
  "Window changed: inspect isolated search result before accepting transfer"
);
assert.equal(summary.exactOpaqueEquipmentFaceChecks, 18);
assert.deepEqual(strictGeometryErrors, []);
// Read all inputs again before publishing evidence, to detect concurrent mutation.
for (const pin of trackedInputs.values())
  assert.equal(
    sha(readFileSync(resolve(repo, pin.path))),
    pin.sha256,
    `Input changed during verification: ${pin.path}`
  );
const report = {
  schemaVersion: 1,
  exerciseId: "bulgarian-split",
  status: "selected-native-geometry-evidence-passes",
  releaseApproved: false,
  scope:
    "Numerical geometry evidence only; does not grant actual-player or release approval.",
  imagesEdited: false,
  historicalReportOrAlgorithmModified: false,
  helper: { filename: "verify-geometry.mjs", sha256: sha(readFileSync(self)) },
  decode:
    "sharp.removeAlpha().toColourspace('srgb').raw(); 1536x1024x3 native RGB. Selected opacity independently checked in RGBA.",
  sharpVersion: sharp.versions.sharp,
  bounds: {
    fixedAnchorMaxAxisDriftPixels: 1,
    invariantDimensionsMaxRelativeDrift: 0.01,
    unchanged: true,
  },
  anchorInterpretation:
    "Distinctive image-patch centres, not anatomical joints or literal physical contact locations.",
  transferProof:
    "Each 31x31 target patch at every integer translation within +/-30 pixels lies wholly in the compared 91x91 window. Exact RGB window equality, unchanged hash-pinned reference bytes and unchanged historical algorithm give identical scores at all 3721 translations, identical zero-offset early-exit behavior and identical deterministic tie-breaking. Therefore the recorded optimum transfers exactly. Baseline and selected zero/best SADs are independently recomputed. No exhaustive search is needed when every possible input byte is identical.",
  equipmentInterpretation:
    "Alpha>=128 full rigid-layer widths are construction dimensions. Near/far projections are fixed separately for perspective and reused at unit scale and zero rotation. Occluded shafts and rear heads are not claimed to be visibly measurable through hands/knee. Exposed face equality is a binding check, not a substitute for the hash-bound native contour/grip review.",
  reference: registration.reference,
  baselineRegistration: trackedInputs.get(`${base}/registration.json`),
  baselineAlgorithm: trackedInputs.get(`${base}/measure-registration.mjs`),
  inputPins: [...trackedInputs.values()],
  headDimensions,
  summary,
  strictGeometryErrors,
  frames,
};
mkdirSync(output, { recursive: true });
const reportBytes = await serializeJson(report);
writeFileSync(resolve(output, "geometry.json"), reportBytes);
writeFileSync(
  resolve(output, "review-record-geometry.json"),
  await serializeJson({
    purpose:
      "Geometry values only; retain each delivery asset's own path/hash in a complete review record and bind lossless delivery RGB equality separately.",
    releaseApproved: false,
    geometryEvidence: { path: "geometry.json", sha256: sha(reportBytes) },
    reference: registration.reference,
    frames: frames.map(
      ({ slot, pose, path, sha256, anchors, invariantDimensions }) => ({
        slot,
        pose,
        path,
        sha256,
        anchors,
        invariantDimensions,
      })
    ),
  })
);
const rows = frames
  .map(
    (f) =>
      `| ${f.slot} | ${f.pose} | ${f.invariantDimensions.frontShoeSupportSpan.toFixed(6)} | ${f.invariantDimensions.benchFloorFootSpan.toFixed(6)} | ${f.invariantDimensions.nearEquipmentProjectionWidth} / ${f.invariantDimensions.farEquipmentProjectionWidth} |`
  )
  .join("\n");
writeFileSync(
  resolve(output, "README.md"),
  await format(
    `# Bulgarian selected V2 geometry evidence\n\nAll 48 complete 91×91 anchor search windows exactly match their hash-pinned measured originals. The 31×31, ±30px historical search therefore has identical inputs for every candidate translation. The helper transfers its deterministic coordinates after independently checking source/reference/report/algorithm hashes and recomputing zero/best SAD values. No historical report or image is modified.\n\nThe original bounds remain 1px per axis and 1% dimension drift. Maximum anchor drift is ${summary.maximumAnchorAxisDriftPixels}px. Maximum support-span drift is ${(summary.maximumSupportSpanRelativeDriftFraction * 100).toFixed(6)}%; fixed equipment layer drift is 0%. All selected PNGs are opaque 1536×1024. All 18 exposed equipment-face checks are exact.\n\n| Slot | Pose | Front shoe support span, px | Bench floor foot span, px | Fixed near / far layer width, px |\n|---|---|---:|---:|---:|\n${rows}\n\nShallow slots 2/6 have frontHeel=(534,933), rearLacesPad=(931,646); deep slots 3/5 have frontToe=(389,938), benchRightPadCorner=(1374,676). All other anchor coordinates equal the reference. Full eight-anchor coordinates, exact hashes and per-window RGB hashes are in geometry.json.\n\nEquipment widths use the alpha≥128 bounding box of each fixed RGBA projection, independently measured from the pinned layer. Front-head widths are ${headDimensions["near-front"].alphaHalfCoverageBounds.box[2]}px near and ${headDimensions["far-front"].alphaHalfCoverageBounds.box[2]}px far. These are construction dimensions through pose-dependent occlusion. They are paired with existing hash-bound native contour/grip review; interior equality alone is not a silhouette approval.\n\nReproduce with the repository root explicitly supplied; the output directory defaults to this evidence folder. No scratch path is assumed and no historical files are changed:\n\n\`\`\`sh\nnode docs/exercise-art/releases/2026-10-05/geometry/verify-geometry.mjs /absolute/path/to/Maiin /absolute/path/to/evidence-output\n\`\`\`\n\ngeometry.json SHA-256: ${sha(reportBytes)}\n\nreview-record-geometry.json contains six geometry objects, still bound to selected PNG hashes. A release review using WebP must retain WebP path/hash pins and separately cite verified lossless RGB equality to these PNGs. This evidence does not set review decision or release approval.\n`,
    { ...formatting, parser: "markdown" }
  )
);
console.log(
  JSON.stringify(
    {
      outputDirectory: output,
      geometrySha256: sha(reportBytes),
      ...summary,
      strictGeometryErrors,
    },
    null,
    2
  )
);
