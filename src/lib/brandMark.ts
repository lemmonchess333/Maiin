/**
 * The Tropos mark, in the app icon's 1024 space: a pointy-top hexagon with
 * rounded corners and an upward chevron cut out of it.
 *
 * The hexagon is the corner-inset polygon, drawn with a round-joined stroke
 * of MARK_CORNER in its own colour; that stroke is what rounds the corners
 * (radius MARK_CORNER / 2). A path with arcs would draw the same shape, but
 * the stroke keeps it one polygon that the icon, the launch image and every
 * in-app drawing can share by its points.
 *
 * `src/assets/brand/app-icon.svg` draws these same numbers, and the icon and
 * launch-image generators read them out of that file, so the file and this
 * module must agree. `BrandMark.test.tsx` holds them together.
 */

/** The hexagon's corner-inset polygon (centre 512,512; circumradius 318). */
export const MARK_HEXAGON =
  "512,240.2 747.4,376.1 747.4,647.9 512,783.8 276.6,647.9 276.6,376.1";

/** Stroke width that rounds the hexagon's corners: twice the radius, 40. */
export const MARK_CORNER = 80;

/** The chevron, drawn as a round-capped stroke. */
export const MARK_CHEVRON = "342,604 512,410 682,604";
export const MARK_CHEVRON_WIDTH = 100;

/** The rounded hexagon's box, so the mark fills its element with no inset. */
export const MARK_VIEWBOX = "236.6 200.2 550.8 623.6";

/**
 * How tall the hexagon is on the iOS launch image, as a share of the
 * screen's longer side. The launch image is a 2732 square drawn
 * aspect-fill, with the mark's 1024 box at 22% of it
 * (`scripts/art/gen-splash.mjs`), and the hexagon is 623.6 of those 1024.
 * The launch animation draws its first frame at this size, so the native
 * launch image hands over to it without a jump.
 */
export const LAUNCH_MARK_SHARE = (0.22 * 623.6) / 1024;
