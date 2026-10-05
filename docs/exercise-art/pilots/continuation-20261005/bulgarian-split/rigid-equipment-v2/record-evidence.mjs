import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const pin = (path) => ({
  path,
  sha256: sha(readFileSync(resolve(here, path))),
});
const combination = JSON.parse(readFileSync(resolve(here, "combination.json")));
const source = pin("dumbbell-source.png"),
  meta = await sharp(resolve(here, source.path)).metadata();
const generation = {
  releaseApproved: false,
  recordedAt: "2026-10-05T18:54:43Z",
  tool: "image_gen.imagegen",
  mode: "built-in transparent asset generation with style/projection references",
  callCount: 1,
  transparentBackground: true,
  prompt: pin("equipment-asset-prompt.txt"),
  references: [
    {
      ...pin("../../../../identity/athlete-anatomy-v3.png"),
      role: "Canonical illustration style",
    },
    {
      ...pin("../../../../masters/bulgarian-split/1.png"),
      role: "Frozen exercise camera/material reference",
    },
    {
      ...pin("equipment-style-context-native.png"),
      role: "Native nearest-dumbbell crop, extracted at [570,490,175,96] without resizing",
    },
  ],
  rawOutput: {
    ...source,
    originalGeneratedFilename: "exec-0a8fe120-e024-4439-8f46-cd595357e7a4.png",
    nativeCanvas: [meta.width, meta.height],
    hasAlpha: meta.hasAlpha,
    bytes: meta.size,
  },
  processing:
    "The complete raw output is preserved. Opaque interior alpha above 240 is normalized to 255 once; real edge alpha is retained. Source head/shaft regions are assembled once into two camera projections, then only integer-translated. No generated body image, anatomical reconstruction, whole-frame resize or per-pose equipment resize is used.",
  workflowAuthority: [
    "docs/exercise-art/COMPOSITE_REPAIR_REVIEW.md",
    "docs/exercise-art/pilots/shrugs-rigid-20261003/README.md",
  ],
  baseline: {
    localRecoveredCommit: "8191b80d770fe8c614fb7c9b4441e71f0c9a39fa",
    publishedEquivalentCommit: "f6bfffc3ef55de5efe403edad20eb93e9547c1a1",
    identicalTree: "58475bdf538e977db2be3942903a7f4a92424343",
  },
};
writeFileSync(
  resolve(here, "generation.json"),
  JSON.stringify(generation, null, 2) + "\n"
);
const review = {
  releaseApproved: false,
  selected: false,
  status: "independent-native-visual-review-passes-for-listed-hashes",
  reviewer: "/root/movement_review",
  recordScope:
    "Native full-size images and enlarged equipment/ankle crops. Findings supplied by the independent reviewer in collaboration messages, then recorded here. This record does not claim actual player playback or whole-release approval.",
  outputs: combination.results.map(({ name, path, sha256 }) => ({
    name,
    path,
    sha256,
  })),
  assetReview: {
    ...source,
    outcome: "pass",
    finding:
      "One complete, clean faceted dumbbell with a straight handle and no attached anatomy. Fit and foreground occlusion were evaluated separately.",
  },
  pilot: {
    path: "poses/bottom.png",
    sha256: "9a3da727c7801234407a1d97811e5603edfbf9ca43b96d6b6534d37ea5b7c954",
    outcome: "native-pass",
    findings: [
      "Both hands remain naturally wrapped around the shafts.",
      "The previous upper-left near-head strip, lower residual rim and rear-head cutout are absent.",
      "The partially exposed far rear head reads as the same weight continuing behind the knee, without a floating object, white fringe or rectangular cutout.",
    ],
  },
  boundedMaskRefinement: {
    before: pin("trials/deep-before-fingertip-mask.png"),
    finding:
      "The rectangular near-hand guard included a small white thigh wedge beneath the fingertips and restored it over the enlarged rear head.",
    change:
      "Traced the existing native fingertip lower contour, excluding only the thigh below it from the foreground mask. This changes layer ownership; no finger or body pixels are synthesized or transformed.",
    coordinateEvidence: pin("qa/deep-hand-native-coordinate-review.png"),
    correctedGearPose: pin("poses/deep.png"),
    outcome:
      "native-pass: wedge removed, original fingertip curves continuous around the shaft, far hand remains readable",
  },
  fourPoseFindings: [
    "Equipment shape and scene scale read consistently across all four images.",
    "Both visible grips remain attached, without extra equipment or detached hands.",
    "Near-head contours remain clean; no old strip, residual rim or background cutout recurs.",
    "The far weight disappears behind the front thigh/knee with consistent foreground ownership.",
    "Original face, torso, limbs, primary/secondary muscle colours, shoes and bench outside the equipment regions are preserved; exact preservation is also checked separately.",
  ],
  finalDeepCombination: {
    output: combination.results.find((p) => p.name === "deep"),
    outcome: "native-pass",
    finding:
      "Clean reviewed gear/grips and the accepted graded ankle contour remain present, without a gap or doubled outline.",
    independentPixelCheck:
      "Only 204 pixels differ from reviewed gear deep, all inside [845,596,20,12]; that region equals the accepted ankle source exactly. The other three final files equal their reviewed gear poses byte-for-byte.",
  },
  actualPlayerReviewedByThisRecord: false,
  approvalLimits: [
    "Native review does not substitute timed/mobile light/dark or reduced-motion player evidence.",
    "Layer dimensions and opaque interior comparisons do not establish calibrated real-world load dimensions; hidden equipment is supported by the common rigid layer construction.",
    "Release status remains false; the owner/root integration workflow controls any later selection or release.",
  ],
};
writeFileSync(
  resolve(here, "native-review.json"),
  JSON.stringify(review, null, 2) + "\n"
);
console.log(
  JSON.stringify({
    generation: pin("generation.json"),
    nativeReview: pin("native-review.json"),
  })
);
