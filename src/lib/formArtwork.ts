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
  frames: release.frames ?? formFramePaths(id),
  reference: (release.frames ?? formFramePaths(id))[release.reference - 1],
  reviewFile: `docs/exercise-art/releases/${release.folder}/${id}.json`,
});

/**
 * The sets listed by hand: owner-authorized guides with findings
 * retained until their physical measurement evidence meets strict review.
 * They do not claim strict visual certification. An approved set never belongs
 * here: it comes from its record, and formArtwork.test.ts fails if an ID
 * is listed in both places.
 */
export const HAND_LISTED_FORM_ARTWORK: Record<string, HandListedFormArtwork> =
  {};

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
