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

const existing = (id: string, width: number, height: number): FormArtwork => ({
  version: "existing-2026-09",
  status: "existing-needs-review",
  width,
  height,
  frames: Array.from(
    { length: 6 },
    (_, i) => `form-frames/${id}/${i + 1}.webp`
  ),
  reference: `form-frames/${id}/1.webp`,
});

// The owner explicitly requested these ten sets be activated with findings retained.
// This state records release authorization, not a passing visual review.
const ownerReleased = (
  id: string,
  width: number,
  height: number
): FormArtwork => ({
  ...existing(id, width, height),
  version: "owner-release-2026-09",
  status: "owner-released-with-findings",
  reviewFile: `docs/exercise-art/releases/2026-09-owner/${id}.json`,
});

// Preserve the seven previously shipped sets while replacements are reviewed.
// These entries do not claim that the art passes the new consistency standard.
export const FORM_ARTWORK: Record<string, FormArtwork> = {
  "db-curl": ownerReleased("db-curl", 1024, 1536),
  "hammer-curl": ownerReleased("hammer-curl", 1024, 1536),
  "front-raise": ownerReleased("front-raise", 1024, 1536),
  "goblet-squat": ownerReleased("goblet-squat", 1024, 1536),
  "push-ups": ownerReleased("push-ups", 1536, 1024),
  squat: ownerReleased("squat", 1024, 1536),
  "barbell-curl": ownerReleased("barbell-curl", 1024, 1536),
  "db-bench": ownerReleased("db-bench", 1536, 1024),
  "bodyweight-squat": ownerReleased("bodyweight-squat", 1024, 1536),
  "barbell-shrug": ownerReleased("barbell-shrug", 1024, 1536),
  "barbell-row": existing("barbell-row", 1000, 1701),
  "bench-press": existing("bench-press", 1000, 823),
  dips: existing("dips", 1000, 1413),
  "lateral-raise": existing("lateral-raise", 1000, 990),
  "overhead-press": existing("overhead-press", 1000, 966),
  "rope-tricep-pushdown": existing("rope-tricep-pushdown", 1000, 1767),
  "skull-crushers": existing("skull-crushers", 1000, 858),
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
