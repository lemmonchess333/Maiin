/**
 * Transparent cut-outs of the released exercise drawings, for the places a
 * drawing sits on a card (Home's Today card, exercise rows, the finish
 * screen) rather than on the form guide's own dark stage.
 *
 * They are DERIVED, never edited in place: the reviewed six-frame sets in
 * `public/form-frames` stay byte-for-byte what their release records
 * approved, and each cut-out records the frame it came from: the set's
 * card frame (`formArtCardFrames`), which is its reference unless a
 * frame that shows the exercise better is listed.
 * `npm run art:cutouts` regenerates them; `formArtCutouts.test.ts` fails
 * when a reference frame changes without a regenerate.
 */
import { getReleasedFormArtwork } from "./formArtwork";
import { isFormArtQuarantined } from "./formArtQuarantine";
import { cardFrameOf } from "./formArtCardFrames";
import { isCompoundPrimary } from "@/features/program/variationBank";
import { getExerciseById } from "@/lib/exercises";
import { FORM_ART_CUTOUTS, type FormArtCutout } from "./formArtCutouts.data";

export type { FormArtCutout };

/**
 * The cut-out for an exercise's released drawing, or null.
 *
 * Null when the exercise has no released art, and also when the cut-out
 * was made from a different frame than the set's current card frame: a
 * drawing that is no longer the released one must not keep showing on a
 * card.
 */
export function getFormArtCutout(exerciseId: string): FormArtCutout | null {
  if (isFormArtQuarantined(exerciseId)) return null;
  const art = getReleasedFormArtwork(exerciseId);
  const cutout = FORM_ART_CUTOUTS[exerciseId];
  if (!art || !cutout || cutout.source !== cardFrameOf(exerciseId, art))
    return null;
  return cutout;
}

/** The cut-out's URL under the app's base path ("/" on Hosting, "/Maiin/"
 *  on the Pages preview), built the way the form guide builds its frames. */
export function formArtCutoutUrl(cutout: FormArtCutout): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${cutout.src.replace(/^\//, "")}`;
}

/**
 * Which exercise pictures a lift day: its main lift, drawn. That is the
 * first compound primary with released art (the squat, the bench, the
 * row: `isCompoundPrimary`), else the first compound movement with art (a
 * primary mover, not an isolation), else the first exercise with art,
 * else -1. Position alone picked a beginner's pull day by its straight-arm
 * pulldown, a cable tower with a small figure, over the barbell row that
 * is the day's main lift (owner, 2026-11-07); and a day with no compound
 * primary still led with that isolation pulldown over the chest-supported
 * row beside it, the one lead the hero could not animate (owner,
 * 2026-11-10: a primary mover leads). Home's hero, Train's session card
 * and the finish screen all use it, so the pictures of one day agree.
 */
export function sessionLeadIndex(
  exercises: readonly { exerciseId?: string }[]
): number {
  let firstCompound = -1;
  let firstDrawn = -1;
  for (let i = 0; i < exercises.length; i++) {
    const id = exercises[i].exerciseId;
    if (!id || !getFormArtCutout(id)) continue;
    if (isCompoundPrimary(id)) return i;
    if (firstCompound < 0 && getExerciseById(id)?.mechanic !== "isolation")
      firstCompound = i;
    if (firstDrawn < 0) firstDrawn = i;
  }
  return firstCompound >= 0 ? firstCompound : firstDrawn;
}

/** The drawing that pictures a lift day (`sessionLeadIndex`), with its
 *  exercise's name. Null when no exercise in the day has art. */
export function sessionLeadArt(
  exercises: readonly { exerciseId?: string; name: string }[]
): { cutout: FormArtCutout; exerciseName: string } | null {
  const lead = exercises[sessionLeadIndex(exercises)];
  const cutout = lead?.exerciseId ? getFormArtCutout(lead.exerciseId) : null;
  return lead && cutout ? { cutout, exerciseName: lead.name } : null;
}
