/**
 * The two font files the first screen draws with, preloaded from
 * `dist/index.html` (vite.config.ts's `firstPaintFontsPlugin`).
 *
 * The faces are self-hosted through fontsource's CSS, so the browser
 * learns a font file exists only once the stylesheet has arrived and a
 * text node needs the face: on a first visit on the web the text draws in
 * the fallback face and then swaps. A `<link rel=preload as=font>` in the
 * HTML starts both downloads with the stylesheet instead.
 *
 * Only the Latin subset of each, the one an English screen uses: the other
 * subsets (Cyrillic, Vietnamese, Latin Extended) stay on demand through
 * their `unicode-range`. Plus Jakarta Sans is the text face, Archivo the
 * stand-alone figures (`--font-display` / `--font-figure` in index.css).
 */
import type { HtmlTagDescriptor } from "vite";

export const FIRST_PAINT_FONTS = [
  /^assets\/plus-jakarta-sans-latin-wght-normal-[\w-]+\.woff2$/,
  /^assets\/archivo-latin-wght-normal-[\w-]+\.woff2$/,
] as const;

/**
 * One preload tag per first-paint font, from the emitted file names.
 * Throws when either is missing, so a renamed fontsource file fails the
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
