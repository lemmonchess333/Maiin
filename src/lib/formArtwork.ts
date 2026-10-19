import {
  APPROVED_FORM_ART_RELEASES,
  type ApprovedFormArtRelease,
} from "./formArtReleases.data";

/** Artwork is released by exact exercise ID, never by an approximate alias. */
export interface FormArtwork {
  version: string;
  status:
    | "existing-needs-review"
    | "draft"
    | "approved"
    | "owner-released-with-findings";
  width: number;
  height: number;
  frames: readonly string[];
  reference: string;
  reviewFile?: string;
}

/** A set listed by hand, which is never an approved one. */
type HandListedFormArtwork = FormArtwork & {
  status: Exclude<FormArtwork["status"], "approved">;
};

/** A set's six delivered frames, in playing order. */
export const formFramePaths = (id: string): string[] =>
  Array.from({ length: 6 }, (_, i) => `form-frames/${id}/${i + 1}.webp`);

const existing = (
  id: string,
  width: number,
  height: number
): HandListedFormArtwork => ({
  version: "existing-2026-09",
  status: "existing-needs-review",
  width,
  height,
  frames: formFramePaths(id),
  reference: `form-frames/${id}/1.webp`,
});

const legacyRedrawn = (
  id: string,
  width: number,
  height: number,
  reference: number
): HandListedFormArtwork => ({
  ...existing(id, width, height),
  reference: `form-frames/${id}/${reference}.webp`,
  version: "anatomy-v3-2026-10-17-legacy-redraw-v1",
  status: "owner-released-with-findings",
  reviewFile: `docs/exercise-art/releases/2026-10-17/${id}.json`,
});

const equipmentCorrected = (
  id: string,
  width: number,
  height: number,
  reference: number
): HandListedFormArtwork => ({
  ...legacyRedrawn(id, width, height, reference),
  version: "anatomy-v3-2026-10-18-equipment-correction-v1",
  reviewFile: `docs/exercise-art/releases/2026-10-18/${id}.json`,
});

const continuityCorrected = (
  id: string,
  width: number,
  height: number,
  reference: number,
  version: string,
  reviewFolder = "2026-10-18"
): HandListedFormArtwork => ({
  ...legacyRedrawn(id, width, height, reference),
  version: `anatomy-v3-2026-10-18-${version}-v1`,
  reviewFile: `docs/exercise-art/releases/${reviewFolder}/${id}.json`,
});

const illustrationPolished = (
  id: string,
  width: number,
  height: number,
  reference: number
): HandListedFormArtwork => ({
  ...legacyRedrawn(id, width, height, reference),
  version: "anatomy-v3-2026-10-19-illustration-polish-v1",
  reviewFile: `docs/exercise-art/releases/2026-10-19-illustration-polish/${id}.json`,
});

const nativeIllustrationCorrected = (
  id: string,
  width: number,
  height: number,
  reference: number
): HandListedFormArtwork => ({
  ...legacyRedrawn(id, width, height, reference),
  version: "anatomy-v3-2026-10-19-native-followup-v1",
  reviewFile: `docs/exercise-art/releases/2026-10-19-remaining33-batch1/${id}.json`,
});

/**
 * A set approved by strict review. Every fact here comes from its release
 * record, through APPROVED_FORM_ART_RELEASES, which `npm run art:releases`
 * writes from the records: releasing a set is its record and its cues,
 * with no registry entry to copy by hand.
 */
const approved = (
  id: string,
  release: ApprovedFormArtRelease
): FormArtwork => ({
  version: release.version,
  status: "approved",
  width: release.width,
  height: release.height,
  frames: formFramePaths(id),
  reference: `form-frames/${id}/${release.reference}.webp`,
  reviewFile: `docs/exercise-art/releases/${release.folder}/${id}.json`,
});

/**
 * The sets listed by hand: owner-authorized guides with findings
 * retained, including the six legacy sets redrawn in the current style.
 * They do not claim strict visual certification. An approved set never belongs
 * here: it comes from its record, and formArtwork.test.ts fails if an ID
 * is listed in both places.
 */
export const HAND_LISTED_FORM_ARTWORK: Record<string, HandListedFormArtwork> = {
  "lu-raise": {
    ...existing("lu-raise", 1254, 1254),
    version: "anatomy-v3-2026-10-19-lu-overhead-v1",
    status: "owner-released-with-findings",
    reviewFile:
      "docs/exercise-art/releases/2026-10-19-library-audit/lu-raise.json",
  },
  "incline-db-curl": {
    ...existing("incline-db-curl", 992, 784),
    reference: "form-frames/incline-db-curl/1.webp",
    version: "anatomy-v3-2026-10-16-native-moving-source-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/incline-db-curl.json",
  },
  "leg-press": {
    ...existing("leg-press", 1264, 1056),
    reference: "form-frames/leg-press/1.webp",
    version: "anatomy-v3-2026-10-16-native-moving-source-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/leg-press.json",
  },
  "handstand-push-ups": {
    ...existing("handstand-push-ups", 688, 1504),
    reference: "form-frames/handstand-push-ups/1.webp",
    version: "anatomy-v3-2026-10-16-native-head-profile-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/handstand-push-ups.json",
  },
  "straight-arm-pulldown": {
    ...existing("straight-arm-pulldown", 1152, 1728),
    reference: "form-frames/straight-arm-pulldown/1.webp",
    version: "anatomy-v3-2026-10-16-native-local-repair-v1",
    status: "owner-released-with-findings",
    reviewFile:
      "docs/exercise-art/releases/2026-10-16/straight-arm-pulldown.json",
  },
  "front-squat": {
    ...existing("front-squat", 736, 800),
    reference: "form-frames/front-squat/3.webp",
    version: "anatomy-v3-2026-10-16-worn-reference-harness-source-tone-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/front-squat.json",
  },
  "seated-row": {
    ...existing("seated-row", 1335, 942),
    reference: "form-frames/seated-row/3.webp",
    version: "anatomy-v3-2026-10-16-controlled-hinge-cable-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/seated-row.json",
  },
  swimming: illustrationPolished("swimming", 1264, 848, 2),
  stairmaster: illustrationPolished("stairmaster", 1264, 848, 1),
  "turkish-get-up": nativeIllustrationCorrected(
    "turkish-get-up",
    1024,
    1152,
    1
  ),
  "assault-bike": illustrationPolished("assault-bike", 1024, 1024, 1),
  "spin-bike": illustrationPolished("spin-bike", 432, 707, 1),
  elliptical: {
    ...existing("elliptical", 1047, 1072),
    reference: "form-frames/elliptical/1.webp",
    version: "anatomy-v3-2026-10-15-custom-rear-drive-elliptical-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-16/elliptical.json",
  },
  "rowing-machine": {
    ...existing("rowing-machine", 1416, 830),
    reference: "form-frames/rowing-machine/3.webp",
    version: "anatomy-v3-2026-10-15-retained-whole-trio-rowing-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/rowing-machine.json",
  },
  "pendlay-row": {
    ...existing("pendlay-row", 1180, 892),
    reference: "form-frames/pendlay-row/3.webp",
    version: "anatomy-v3-2026-10-15-retained-whole-pair-pendlay-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/pendlay-row.json",
  },
  "leg-extension": {
    ...existing("leg-extension", 1319, 1056),
    reference: "form-frames/leg-extension/3.webp",
    version: "anatomy-v3-2026-10-15-material-endpoint-leg-extension-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/leg-extension.json",
  },
  "single-leg-calf-raise": nativeIllustrationCorrected(
    "single-leg-calf-raise",
    626,
    1209,
    3
  ),
  "side-plank": illustrationPolished("side-plank", 1480, 696, 3),
  "overhead-extension": {
    ...existing("overhead-extension", 461, 1547),
    reference: "form-frames/overhead-extension/3.webp",
    version: "anatomy-v3-2026-10-15-retained-overhead-two-endpoint-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/overhead-extension.json",
  },
  "face-pulls": {
    ...existing("face-pulls", 982, 1258),
    version: "anatomy-v3-2026-10-15-ergonomic-rope-two-endpoint-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/face-pulls.json",
  },
  "t-bar-row": {
    ...existing("t-bar-row", 918, 1036),
    version: "anatomy-v3-2026-10-15-retained-two-endpoint-v1",
    status: "owner-released-with-findings",
    reviewFile: "docs/exercise-art/releases/2026-10-15/t-bar-row.json",
  },
  bike: illustrationPolished("bike", 929, 1432, 1),
  "goblet-squat": illustrationPolished("goblet-squat", 1024, 1536, 1),
  squat: illustrationPolished("squat", 1024, 1536, 1),
  "barbell-curl": nativeIllustrationCorrected("barbell-curl", 1024, 1536, 1),
  "barbell-row": legacyRedrawn("barbell-row", 1140, 1024, 4),
  "bench-press": continuityCorrected(
    "bench-press",
    888,
    1024,
    4,
    "supported-continuity"
  ),
  "calf-raise": continuityCorrected(
    "calf-raise",
    1024,
    1536,
    3,
    "calf-timing-correction",
    "2026-10-18-calf-timing"
  ),
  "standing-calf-raise": continuityCorrected(
    "standing-calf-raise",
    1024,
    1536,
    3,
    "calf-timing-correction",
    "2026-10-18-calf-timing"
  ),
  dips: legacyRedrawn("dips", 880, 1088, 4),
  "overhead-press": illustrationPolished("overhead-press", 1024, 1536, 4),
  "rope-tricep-pushdown": equipmentCorrected(
    "rope-tricep-pushdown",
    1024,
    1600,
    1
  ),
  "skull-crushers": equipmentCorrected("skull-crushers", 870, 1072, 3),
};

export const FORM_ARTWORK: Record<string, FormArtwork> = {
  ...HAND_LISTED_FORM_ARTWORK,
  ...Object.fromEntries(
    Object.entries(APPROVED_FORM_ART_RELEASES).map(([id, release]) => [
      id,
      approved(id, release),
    ])
  ),
};

export function getReleasedFormArtwork(id: string): FormArtwork | null {
  const art = FORM_ARTWORK[id];
  if (!art || art.status === "draft" || art.frames.length !== 6) return null;
  if (
    ![
      "existing-needs-review",
      "approved",
      "owner-released-with-findings",
    ].includes(art.status)
  )
    return null;
  if (art.status !== "existing-needs-review" && !art.reviewFile) return null;
  return art;
}
