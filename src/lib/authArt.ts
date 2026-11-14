/**
 * The drawing the signed-out screens show (DS8): the lifter on sign-in and
 * sign-up. (The welcome shows photographs, src/assets/welcome.)
 *
 * It is named by path, not looked up in the catalogue: these screens
 * draw before anyone signs in, and `formArtCutouts` reaches the exercise
 * database, which a signed-out visit never needs. `authArt.test.ts` holds
 * the path to its released cut-out, so a drawing that is withdrawn or
 * redrawn cannot keep showing here.
 */

/** The exercise whose drawing stands on sign-in and sign-up. Front on:
 *  the owner refused a figure seen from behind (DS8 call 2). It needs a
 *  flipbook (`heroMotionFor`), since the figure plays its rep. */
export const SIGN_IN_EXERCISE = "overhead-press";

/** The cut-out of a released drawing, as `formArtCutouts.data` paths it. */
export const authArtPath = (exerciseId: string) =>
  `form-art/${exerciseId}.webp`;

/** A public file's URL under the app's base path ("/" on Hosting,
 *  "/Maiin/" on the Pages preview). */
export function publicUrl(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}
