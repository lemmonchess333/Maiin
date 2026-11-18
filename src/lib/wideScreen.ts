/**
 * The wide screens Tropos lays out for: the iPhone Duo's inner display
 * (DESIGN_GUIDE §14r). The CSS is the source of truth: `wide` and
 * `split` are custom variants in src/index.css, and these are the same
 * media queries for the few places that must know in script (a panel
 * that stops being draggable, a list that names every row). Pinned to
 * the CSS by wideScreen.test.ts.
 *
 * - `wide`: a touch screen at least 640 pt wide. The inner display in
 *   either orientation; the outer display (466) and half of Split View
 *   (about 475) stay phones.
 * - `split`: at least 800, room for two panes side by side. The inner
 *   display open in landscape (951).
 *
 * Touch, so a desktop browser window keeps the phone layout. Chrome's
 * device toolbar with touch on shows them on the web.
 */
export const WIDE_QUERY = "(min-width: 640px) and (pointer: coarse)";
export const SPLIT_QUERY = "(min-width: 800px) and (pointer: coarse)";

/**
 * Pages drawn in two panes under `split`. Layout widens its column for
 * them alone; every other page keeps the phone's column, centred, as iOS
 * keeps a readable width on a wide screen.
 */
export const TWO_PANE_PATHS: ReadonlySet<string> = new Set(["/"]);
