/**
 * The font files the first screen draws with, preloaded from
 * `dist/index.html` (vite.config.ts's `firstPaintFontsPlugin`).
 *
 * The faces are self-hosted through @font-face CSS, so the browser
 * learns a font file exists only once the stylesheet has arrived and a
 * text node needs the face: on a first visit on the web the text draws in
 * the fallback face and then swaps. A `<link rel=preload as=font>` in the
 * HTML starts the downloads with the stylesheet instead.
 *
 * Only the Latin subset of each, the one an English screen uses: the other
 * subsets (Vietnamese, Latin Extended) stay on demand through their
 * `unicode-range`. Barlow is the text face, one static file for each of
 * the five weights the app sets (src/styles/barlow.css); Archivo is the
 * stand-alone figures, one variable file (`--font-display` /
 * `--font-figure` in index.css).
 */
import type { HtmlTagDescriptor } from "vite";

export const FIRST_PAINT_FONTS = [
  /^assets\/barlow-latin-400-normal-[\w-]+\.woff2$/,
  /^assets\/barlow-latin-500-normal-[\w-]+\.woff2$/,
  /^assets\/barlow-latin-600-normal-[\w-]+\.woff2$/,
  /^assets\/barlow-latin-700-normal-[\w-]+\.woff2$/,
  /^assets\/barlow-latin-800-normal-[\w-]+\.woff2$/,
  /^assets\/archivo-latin-wght-normal-[\w-]+\.woff2$/,
] as const;

/**
 * One preload tag per first-paint font, from the emitted file names.
 * Throws when any is missing, so a renamed fontsource file fails the
 * build instead of quietly dropping its preload.
 *
 * `crossorigin` is required: fonts are fetched in CORS mode even from
 * the same origin, and a preload without it is fetched twice.
 */
export function firstPaintFontPreloads(
  emittedFiles: readonly string[],
  base: string
): HtmlTagDescriptor[] {
  return FIRST_PAINT_FONTS.map((pattern) => {
    const file = emittedFiles.find((name) => pattern.test(name));
    if (!file)
      throw new Error(
        `first-paint font missing from the build: nothing matches ${pattern}`
      );
    return {
      tag: "link",
      attrs: {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: `${base}${file}`,
        crossorigin: "",
      },
      injectTo: "head",
    };
  });
}
