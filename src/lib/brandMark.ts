/**
 * The Tropos mark, in the app icon's 1024 space: a T whose stem rises into
 * its bar (DS7). Two filled shapes. The bar is a slab with a notch under
 * its middle, the stem is pointed to fit the notch, and the gap between
 * them is an upward chevron.
 *
 * `src/assets/brand/app-icon.svg` draws these same paths, and the icon and
 * launch-image generators read them out of that file, so the file and this
 * module must agree. `BrandMark.test.tsx` holds them together.
 */

/** The bar: 524 wide, corners of radius 20, notched under its middle. */
export const MARK_BAR =
  "M270 256 H754 a20 20 0 0 1 20 20 V386 a20 20 0 0 1 -20 20 H602.6 L512 319.7 L421.4 406 H270 a20 20 0 0 1 -20 -20 V276 a20 20 0 0 1 20 -20 Z";

/** The stem: 150 wide, its point 96.7 below the notch's. */
export const MARK_STEM =
  "M512 416.4 L587 487.8 V754 a20 20 0 0 1 -20 20 H457 a20 20 0 0 1 -20 -20 V487.8 Z";

/** The mark's box, so it fills its element with no inset. */
export const MARK_VIEWBOX = "250 256 524 518";

/**
 * How tall the mark is on the iOS launch image, as a share of the screen's
 * longer side. The launch image is a 2732 square drawn aspect-fill, with
 * the mark's 1024 box at 22% of it (`scripts/art/gen-splash.mjs`), and the
 * mark is 518 of those 1024. The launch animation draws its first frame at
 * this size, so the native launch image hands over to it without a jump.
 */
export const LAUNCH_MARK_SHARE = (0.22 * 518) / 1024;
