/**
 * Reads the Tropos mark out of the canonical app icon
 * (`src/assets/brand/app-icon.svg`), by the shapes' ids, so the icon and
 * launch-image generators draw the geometry the icon declares rather than
 * a copy of it.
 *
 *   bar   the notched bar's path
 *   stem  the pointed stem's path
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function shape(svg, id) {
  const tag = new RegExp(`<path\\s+id="${id}"([^>]*)>`).exec(svg)?.[1];
  const d = tag && /\sd="([^"]+)"/.exec(tag)?.[1];
  if (!d) throw new Error(`brand/app-icon.svg: no #${id} with a path`);
  return d;
}

export function readMark(root) {
  const svg = readFileSync(
    resolve(root, "src/assets/brand/app-icon.svg"),
    "utf8"
  );
  return { bar: shape(svg, "bar"), stem: shape(svg, "stem") };
}

/** The mark as SVG markup in the 1024 space, both shapes in `fill`. */
export function markSvg(mark, fill) {
  return `<path d="${mark.bar}" fill="${fill}"/>
  <path d="${mark.stem}" fill="${fill}"/>`;
}
