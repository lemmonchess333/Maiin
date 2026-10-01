/**
 * Reads the Tropos mark out of the canonical app icon
 * (`src/assets/brand/app-icon.svg`), by the shapes' ids, so the icon and
 * launch-image generators draw the geometry the icon declares rather than
 * a copy of it.
 *
 *   hexagon      the corner-inset hexagon's points
 *   corner       the round-joined stroke width that rounds its corners
 *   chevron      the chevron's points
 *   chevronWidth the chevron's stroke width
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function shape(svg, id) {
  const tag = new RegExp(`<(?:polygon|polyline)\\s+id="${id}"([^>]*)>`).exec(
    svg
  )?.[1];
  const points = tag && /\spoints="([^"]+)"/.exec(tag)?.[1];
  const width = tag && /\sstroke-width="([\d.]+)"/.exec(tag)?.[1];
  if (!points || !width) {
    throw new Error(
      `brand/app-icon.svg: no #${id} with points and a stroke width`
    );
  }
  return { points, width: Number(width) };
}

export function readMark(root) {
  const svg = readFileSync(
    resolve(root, "src/assets/brand/app-icon.svg"),
    "utf8"
  );
  const hexagon = shape(svg, "hexagon");
  const chevron = shape(svg, "chevron");
  return {
    hexagon: hexagon.points,
    corner: hexagon.width,
    chevron: chevron.points,
    chevronWidth: chevron.width,
  };
}

/** The mark as SVG markup in the 1024 space: `fill` paints the hexagon and
 *  the chevron is cut out of it, so whatever lies beneath shows through.
 *  `id` keeps the mask unique within one document. */
export function markSvg(mark, fill, id = "cut") {
  return `<defs>
    <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="black"/>
      <polygon points="${mark.hexagon}" fill="white" stroke="white" stroke-width="${mark.corner}" stroke-linejoin="round"/>
      <polyline points="${mark.chevron}" fill="none" stroke="black" stroke-width="${mark.chevronWidth}" stroke-linejoin="round" stroke-linecap="round"/>
    </mask>
  </defs>
  <rect width="1024" height="1024" fill="${fill}" mask="url(#${id})"/>`;
}
