// Select the independently reviewed V2 sources into the inactive draft.
// All image delivery is byte-for-byte copying; this script never transforms art.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../..");
const batch = "docs/exercise-art/pilots/continuation-20261005";
const exercise = `${batch}/bulgarian-split`;
const selectedAt = "2026-10-05T18:55:10Z";
const digest = (data) => createHash("sha256").update(data).digest("hex");
const read = (path) => readFileSync(resolve(root, path));
const json = (path) => JSON.parse(read(path));
const writeJson = async (path, value) => {
  const full = resolve(root, path);
  writeFileSync(
    full,
    await format(JSON.stringify(value), {
      ...(await resolveConfig(full)),
      parser: "json",
    })
  );
};
const pins = [
  ["setup", "f93fc4136da95f40799f4da0fb1386fc8cb3e943a8467fdcd46d904038d87057"],
  [
    "shallow",
    "4646fb08e1d96df0d3d03d2642c63d78861f1d707edd5a33f07b38662a1194b3",
  ],
  ["deep", "d3551326c4964abacea0978e604d2cf7d856aaa1bd25bdd5b99d95a20233002b"],
  [
    "bottom",
    "9a3da727c7801234407a1d97811e5603edfbf9ca43b96d6b6534d37ea5b7c954",
  ],
];
const sources = pins.map(([pose, sha256]) => {
  const path = `${exercise}/rigid-equipment-v2/final/${pose}.png`;
  const data = read(path);
  if (digest(data) !== sha256) throw new Error(`Source changed: ${path}`);
  if (
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.readUInt32BE(16) !== 1536 ||
    data.readUInt32BE(20) !== 1024
  )
    throw new Error(`Native canvas changed: ${path}`);
  return { pose, path, sha256, bytes: data.length, dimensions: [1536, 1024] };
});
const evidencePaths = [
  `${exercise}/rigid-equipment-v2/composition.json`,
  `${exercise}/rigid-equipment-v2/combination.json`,
  `${exercise}/rigid-equipment-v2/diagnostics.json`,
  `${exercise}/rigid-equipment-v2/generation.json`,
  `${exercise}/rigid-equipment-v2/native-review.json`,
  `${exercise}/ankle-refinement-v2/report.json`,
  `${exercise}/ankle-refinement-v2/independent-review.json`,
];
// All construction/review files must exist before any selected image is changed.
const evidence = evidencePaths.map((path) => ({
  path,
  sha256: digest(read(path)),
}));
const nativeReview = json(`${exercise}/rigid-equipment-v2/native-review.json`);
if (
  nativeReview.status !==
    "independent-native-visual-review-passes-for-listed-hashes" ||
  sources.some(
    (source) =>
      !nativeReview.outputs.some(
        (output) =>
          output.name === source.pose && output.sha256 === source.sha256
      )
  )
)
  throw new Error("Independent native review does not cover selected hashes");
const previousSelectionPath = `${batch}/validation/final-selection.json`;
const previousSelection = json(previousSelectionPath);
const manifestPath = `${batch}/MANIFEST.json`;
const planPath = `${exercise}/plan.json`;
const provenancePath = `${exercise}/provenance.json`;
const manifest = json(manifestPath);
const plan = json(planPath);
const provenance = json(provenancePath);
const set = manifest.completeDraftSets.find(
  (s) => s.exerciseId === "bulgarian-split"
);
if (!set || set.frames.length !== 6 || plan.beats.length !== 6)
  throw new Error("Expected one complete Bulgarian draft");
for (const pin of [provenance.identity, provenance.master])
  if (digest(read(pin.path)) !== pin.sha256)
    throw new Error(`Identity/master changed: ${pin.path}`);
const cueSha256 = digest(
  JSON.stringify(
    set.frames.map(({ caption, cue }) => ({
      label: caption.replace(/ \d\/6$/, ""),
      cue,
    }))
  )
);
if (
  cueSha256 !==
  "2702ce0ca3bdae249c329136587feaf0d6c0da750b08ea04de6c12faf9c66f6b"
)
  throw new Error("Reviewed cue order/text changed");
const sequence = [0, 1, 2, 3, 2, 1];
const progress = [0, 0.33, 0.67, 1, 0.67, 0.33];
set.frames.forEach((frame, index) => {
  if (frame.progress !== progress[index] || frame.cue !== plan.beats[index].cue)
    throw new Error(`Cue/progress mismatch at frame ${index + 1}`);
});
const equipment =
  "Two identical modest faceted/octagonal dumbbells from fixed reusable near/far projections; one fixed flat bench; front trainer flat on floor; rear instep laces-down on bench.";
const reviewFindings = [
  "V2 native review passes the four exact selected source hashes, including the final deep image combining disjoint gear and ankle changes. The six slots remain setup, shallow, deep, bottom, deep, shallow; standing completes on the actual 6-to-1 transition.",
  "One transparent faceted/octagonal dumbbell source supplies fixed near/far projections reused by integer translation without per-pose scaling or rotation. Original hand/body foreground preserves readable grips and anatomical occlusion. Construction and native contour review jointly supersede the original equipment-redraw finding and rejected V1 cutout trial.",
  "The final deep pose incorporates the reviewed 204-pixel upper-ankle refinement at x845–864,y596–607. A connected graded contour replaces the old angular shelf; a natural directional bend remains. Rear shoe/contact, lower ankle and gear are preserved by disjoint construction.",
  "The original canonical identity and frozen scene master remain unchanged. Selected setup differs from that master only in the declared gear edit regions, with hands/body/support pixels preserved; it is a composite-selected pose rather than a replacement master.",
  "Working front quadriceps retain the strongest purple, visible working hamstring remains lighter lilac, and the supporting rear thigh/hip remains neutral. The earlier contact repairs and 2,374-pixel bottom colour import are retained beneath V2 equipment.",
  "Progress values 0,0.33,0.67,1,0.67,0.33 are authored beat positions, not measured joint-range percentages. Actual mobile light/dark playback, reduced motion and manual stepping remain pending for these final hashes. Native approval, registration and the standalone GIF do not establish player or production approval.",
];
const frameSelection = set.frames.map((frame, index) => {
  const source = sources[sequence[index]];
  copyFileSync(resolve(root, source.path), resolve(root, frame.path));
  if (digest(read(frame.path)) !== source.sha256)
    throw new Error(`Copied frame differs: ${frame.path}`);
  Object.assign(frame, {
    dimensions: source.dimensions,
    bytes: source.bytes,
    sha256: source.sha256,
    reusedFrom: index === 4 ? 3 : index === 5 ? 2 : null,
  });
  return {
    frame: index + 1,
    path: frame.path,
    source: source.path,
    sha256: source.sha256,
    bytes: source.bytes,
    cueSha256: digest(frame.cue),
    reusedFrom: frame.reusedFrom,
  };
});
const status = "native-reviewed-v2-awaiting-player-review";
Object.assign(set, {
  status: "draft-awaiting-review",
  selectionStatus: status,
  equipment,
  reviewFindings,
  nativeReviewStatus: "passed-for-pinned-v2-sources",
  playerReviewStatus: "pending",
  supersededSelection: previousSelectionPath,
});
manifest.releaseApproved = false;
manifest.productionAssetsChanged = false;
Object.assign(plan, {
  status: "native-reviewed-draft-awaiting-player-review",
  equipment,
  selectedSetup: sources[0],
  masterRelationship:
    "Original canonical identity and frozen scene master remain unchanged. The V2 selected setup replaces gear only within declared regions; the scene master remains the source identity and support reference.",
  reviewOutcome: {
    scope:
      "One bounded continuation of the interrupted Bulgarian split-squat candidate.",
    selectedApproach:
      "Preserve reviewed body/support/colour construction, add fixed reusable faceted/octagonal near/far dumbbell projections with original hand/body foreground, and combine the independently reviewed local deep-ankle contour refinement.",
    nativeReviewStatus: "passed-for-pinned-v2-sources",
    nativeReviewEvidence: `${exercise}/rigid-equipment-v2/native-review.json`,
    remainingFindings: [
      "Actual mobile light/dark playback, reduced motion and manual stepping remain pending for the final V2 selection; this is an inactive draft.",
    ],
    supersededNativeFindings:
      "Original gear redraw and the deep upper-ankle shelf are superseded by the exact reviewed V2 candidates. Earlier failed generations/composites, measurements and player attempts remain historical evidence.",
    progressMeaning:
      "Authored beat positions; approximate thirds are a movement plan, not measured percentages of joint range.",
  },
  releaseStatus:
    "Inactive draft. Native V2 review passes, but actual player approval and final release decision remain pending; releaseApproved is false and no public/runtime assets are changed.",
});
await writeJson(planPath, plan);
const planSha256 = digest(read(planPath));
Object.assign(provenance, {
  tool: "image_gen plus documented native layer compositing",
  selectionStatus: status,
  originalNativeSources:
    provenance.originalNativeSources ?? provenance.nativeSources,
  nativeSources: sources,
  frameSelection,
  processing:
    "Final native PNGs from rigid-equipment-v2/final are copied byte-for-byte into six separate 1536x1024 files in setup,shallow,deep,bottom,deep,shallow order. V2 constructs fixed faceted/octagonal near/far dumbbell projections once from one transparent source and translates them as rigid layers beneath retained original hand/body foreground. It preserves the original scene master and all source PNGs; selected setup differs from master only in declared gear edits. Deep additionally imports only the independently reviewed 204-pixel ankle contour change, proven disjoint from gear edits. Prior deep/bottom support compositing and bottom lilac import remain intact. No transform, crop, resize or recolouring occurs during selection. Slots5/6 reuse3/2 with distinct cues;6-to-1 completes standing.",
  historicalReviewFindings:
    provenance.historicalReviewFindings ?? provenance.reviewFindings,
  historicalEvidencePaths:
    provenance.historicalEvidencePaths ?? provenance.reviewEvidencePaths,
  reviewFindings,
  finalMobileEvidenceStatus:
    "pending-for-final-v2-hashes; earlier blocked attempts retained as historical evidence",
  nativeReviewStatus: "passed-for-pinned-v2-sources",
  releaseApproved: false,
  productionAssetsChanged: false,
  selectedAt,
  plan: { path: planPath, sha256: planSha256 },
  selectedSetup: sources[0],
  masterRelationship: plan.masterRelationship,
  cueSha256,
  sourceProcessingRecords: [
    ...new Set([
      ...provenance.sourceProcessingRecords,
      `${exercise}/rigid-equipment-v2/composition.json`,
      `${exercise}/rigid-equipment-v2/combination.json`,
      `${exercise}/ankle-refinement-v2/report.json`,
    ]),
  ],
  reviewEvidencePaths: evidencePaths,
  supersededSelection: {
    path: previousSelectionPath,
    sha256: digest(read(previousSelectionPath)),
  },
});
await writeJson(manifestPath, manifest);
await writeJson(provenancePath, provenance);
const logPath = `${batch}/GENERATION_LOG.json`;
const log = json(logPath);
const eventId = "v2-native-reviewed-inactive-selection";
const event = {
  id: eventId,
  stage:
    "Select reviewed V2 rigid equipment and deep ankle refinement into inactive draft",
  tool: "image_gen source plus documented Node/sharp native-layer compositing; byte-copy selection",
  source:
    "bulgarian-split/rigid-equipment-v2/final/{setup,shallow,deep,bottom}.png",
  generationRecord: `${exercise}/rigid-equipment-v2/generation.json`,
  processingRecords: provenance.sourceProcessingRecords,
  selectedSources: sources,
  sequence: [1, 2, 3, 4, 3, 2],
  nativeReview: `${exercise}/rigid-equipment-v2/native-review.json`,
  status:
    "native review passed; actual player review pending; selected inactive draft only",
  releaseApproved: false,
  priorEvents:
    "Earlier prompt text, source identities and rejected-attempt statuses are retained unchanged as historical records.",
};
const previousEvent = log.events.findIndex((e) => e.id === eventId);
if (previousEvent < 0) log.events.push(event);
else log.events[previousEvent] = event;
await writeJson(logPath, log);
const selection = {
  exerciseId: "bulgarian-split",
  status,
  selectedAt,
  releaseApproved: false,
  productionAssetsChanged: false,
  nativeReviewStatus: "passed-for-pinned-v2-sources",
  playerReviewStatus: "pending",
  sequence: [1, 2, 3, 4, 3, 2],
  nativeDimensions: [1536, 1024],
  identity: provenance.identity,
  originalMaster: provenance.master,
  selectedSetup: sources[0],
  masterRelationship: plan.masterRelationship,
  nativeSources: sources,
  frameSelection,
  selectedFrameBytes: frameSelection.reduce(
    (total, frame) => total + frame.bytes,
    0
  ),
  cueSha256,
  planSha256,
  manifestSha256: digest(read(manifestPath)),
  provenanceSha256: digest(read(provenancePath)),
  evidence,
  supersededSelection: provenance.supersededSelection,
  historicalNativeSources: previousSelection.nativeSources,
  reviewFindings,
  imageProcessing:
    "copyFileSync only; verified exact source/delivery SHA-256 equality",
  helper: relative(root, fileURLToPath(import.meta.url)).replaceAll("\\", "/"),
};
await writeJson(`${batch}/validation/v2-selection.json`, selection);
console.log(
  JSON.stringify(
    {
      status,
      sources,
      frames: frameSelection.length,
      selectedFrameBytes: selection.selectedFrameBytes,
      planSha256,
      cueSha256,
      releaseApproved: false,
    },
    null,
    2
  )
);
