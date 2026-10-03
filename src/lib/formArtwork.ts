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

// The owner explicitly requested these sets be activated with findings retained.
// This state records release authorization, not a passing visual review.
const ownerReleased = (
  id: string,
  width: number,
  height: number
): HandListedFormArtwork => ({
  ...existing(id, width, height),
  version: "owner-release-2026-09",
  status: "owner-released-with-findings",
  reviewFile: `docs/exercise-art/releases/2026-09-owner/${id}.json`,
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
 * The sets listed by hand: those released without a strict review. Six
 * shipped before the review existed and are kept while replacements are
 * reviewed; they do not claim to pass the new consistency standard. Three
 * the owner released with their findings. An approved set never belongs
 * here: it comes from its record, and formArtwork.test.ts fails if an ID
 * is listed in both places.
 */
export const HAND_LISTED_FORM_ARTWORK: Record<string, HandListedFormArtwork> = {
  "goblet-squat": ownerReleased("goblet-squat", 1024, 1536),
  squat: ownerReleased("squat", 1024, 1536),
  "barbell-curl": ownerReleased("barbell-curl", 1024, 1536),
  "barbell-row": existing("barbell-row", 1000, 1701),
  "bench-press": existing("bench-press", 1000, 823),
  dips: existing("dips", 1000, 1413),
  "overhead-press": existing("overhead-press", 1000, 966),
  "rope-tricep-pushdown": existing("rope-tricep-pushdown", 1000, 1767),
  "skull-crushers": existing("skull-crushers", 1000, 858),
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
