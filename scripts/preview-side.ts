/** Renders the side-view figure (raw, standing) at high scale on the
 *  dark stage, next to the vendored anterior figure for a like-for-like
 *  style check. Usage: npx tsx scripts/preview-side.ts [outDir] */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SIDE_PIECES } from "../src/lib/bodySideData";
import { ANTERIOR } from "../src/lib/bodyModelData";

const out = resolve(process.argv[2] ?? "/tmp/side-preview");
mkdirSync(out, { recursive: true });
const BG = { r: 17, g: 17, b: 19, alpha: 1 }; // the stage (#111113)
const STAGE = "#111113";
const BODY = "#B6BDC3";

function sideSvg(viewBox: string) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
    SIDE_PIECES.map(
      (piece) =>
        `<polygon points="${piece.outline
          .map(([x, y]) => `${x},${y}`)
          .join(" ")}" fill="${STAGE}"/>` +
        piece.facets
          .map(
            (f) =>
              `<polygon points="${f.points
                .map(([x, y]) => `${x},${y}`)
                .join(" ")}" fill="${BODY}"/>`
          )
          .join("")
    ).join("") +
    `</svg>`
  );
}

function anteriorSvg(viewBox: string) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">` +
    ANTERIOR.map(
      (p) =>
        `<polygon points="${p.points
          .map(([x, y]) => `${x},${y}`)
          .join(" ")}" fill="${BODY}"/>`
    ).join("") +
    `</svg>`
  );
}

async function main() {
  // Same 116-unit-wide viewBox for both — like-for-like scale.
  await sharp(Buffer.from(sideSvg("-8 -6 116 216")), { density: 300 })
    .resize(320, 900, { fit: "contain", background: BG })
    .flatten({ background: BG })
    .png()
    .toFile(resolve(out, "side.png"));
  await sharp(Buffer.from(anteriorSvg("-8 -6 116 216")), { density: 300 })
    .resize(320, 900, { fit: "contain", background: BG })
    .flatten({ background: BG })
    .png()
    .toFile(resolve(out, "anterior-ref.png"));
  console.log("done");
}
main();
