/**
 * The iPhone Duo's screens in CSS px (points), for the capture rig and the
 * tests that check which layout each one gets. Sources: App Store
 * Connect's screenshot specifications
 * (https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
 * and WebKit's "WebKit Features for Safari 27.1"
 * (https://webkit.org/blog/18486/webkit-features-for-safari-27-1/); the
 * iPhone Duo page in the docs has the rest.
 *
 * Apple publishes no point sizes for the Duo, so every number here is
 * derived, and says from what:
 * - outer: the App Store screenshot size for the outer display, 1398 ×
 *   2034 px (also its panel's resolution), at the 3× scale a 460 ppi
 *   iPhone draws at: 466 × 678.
 * - inner: the inner display's screenshot size, 2007 × 2853 px, at 3×:
 *   669 × 951 standing up, 951 × 669 open flat on its side. WebKit's
 *   Safari 27.1 viewports for the inner display are 669 and 951 wide,
 *   which agree.
 * - innerSdk27: an app built with the iOS 27 SDK (not 27.1) "still
 *   avoids the status bar on the right edge" on the inner display, so it
 *   gets less than the full 951. How much is not published; Safari's own
 *   side column, which holds its tab bar too, is 84, so 867 is a floor.
 * - splitHalf: one of two apps side by side on the inner display, about
 *   half of 951. Safari's own windows there are 385 wide.
 */
export const IPHONE_DUO = {
  outer: { width: 466, height: 678 },
  innerLandscape: { width: 951, height: 669 },
  innerPortrait: { width: 669, height: 951 },
  innerSdk27: { width: 867, height: 669 },
  splitHalf: { width: 475, height: 669 },
} as const;
