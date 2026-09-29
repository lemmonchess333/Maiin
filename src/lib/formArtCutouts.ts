/**
 * Transparent cut-outs of the released exercise drawings, for the places a
 * drawing sits on a card (Home's Today card, exercise rows, the finish
 * screen) rather than on the form guide's own dark stage.
 *
 * They are DERIVED, never edited in place: the reviewed six-frame sets in
 * `public/form-frames` stay byte-for-byte what their release records
 * approved, and each cut-out records the reference frame it came from.
 * `npm run art:cutouts` regenerates them; `formArtCutouts.test.ts` fails
 * when a reference frame changes without a regenerate.
 */
import { getReleasedFormArtwork } from "./formArtwork";
import { FORM_ART_CUTOUTS, type FormArtCutout } from "./formArtCutouts.data";

export type { FormArtCutout };

/**
 * The cut-out for an exercise's released drawing, or null.
 *
 * Null when the exercise has no released art, and also when the cut-out
 * was made from a different frame than the set's current reference: a
 * drawing that is no longer the released one must not keep showing on a
 * card.
 */
export function getFormArtCutout(exerciseId: string): FormArtCutout | null {
  const art = getReleasedFormArtwork(exerciseId);
  const cutout = FORM_ART_CUTOUTS[exerciseId];
  if (!art || !cutout || cutout.source !== art.reference) return null;
  return cutout;
}

/** The cut-out's URL under the app's base path ("/" on Hosting, "/Maiin/"
 *  on the Pages preview), built the way the form guide builds its frames. */
export function formArtCutoutUrl(cutout: FormArtCutout): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${cutout.src.replace(/^\//, "")}`;
}
