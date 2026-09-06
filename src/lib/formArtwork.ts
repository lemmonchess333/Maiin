/** Artwork is released by exact exercise ID, never by an approximate alias. */
export interface FormArtwork {
  version: string;
  status: "existing-needs-review" | "draft" | "approved";
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

// Preserve the seven previously shipped sets while replacements are reviewed.
// These entries do not claim that the art passes the new consistency standard.
export const FORM_ARTWORK: Record<string, FormArtwork> = {
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
  if (art.status === "approved" && !art.reviewFile) return null;
  return art;
}
