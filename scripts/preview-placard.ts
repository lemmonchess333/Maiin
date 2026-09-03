/** Placard-demo preview: renders each `FORM_BEATS` sequence as the card
 *  it is a moving version of — every position drawn under its own
 *  numbered caption, plus the muscle key — so a stepped demo can be
 *  reviewed as a whole instead of frame by frame.
 *
 *  This is the review artefact the ordinary contact sheet cannot be:
 *  `preview-rig.ts` samples t at fixed fifths, which for a placard
 *  lands between the authored positions rather than on them.
 *
 *  Usage: npx tsx scripts/preview-placard.ts [outDir]
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  FORM_BEAT_IDS,
  getDemoLegend,
  getFormBeats,
  renderBodyDemo,
  __unlockSideDemosForPreview,
  type FormBeat,
} from "../src/lib/bodyRig";

__unlockSideDemosForPreview();

const out = resolve(process.argv[2] ?? "/tmp/placard-preview");
mkdirSync(out, { recursive: true });

/* The app's fixed dark stage (--stage 240 4% 7%) and its text tokens. */
const STAGE = "#111113";
const FG = "#F4F4F6";
const MUTED = "#AFAFB8";
const COLS = 3;
const CELL_W = 300;
const CELL_H = 400;
const PAD = 28;
const HEAD = 96;

/** A position's picture: the supplied frame where there is one, else
 *  the rig's own figure at that beat's t. The preview has to show what
 *  the app shows, or it is reviewing something nobody will see. */
const frameOf = (id: string, b: FormBeat, effort = 0.85): Buffer =>
  b.image
    ? readFileSync(resolve("public", b.image))
    : Buffer.from(renderBodyDemo(id, b.t, effort));

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Wrap a cue to the cell width — roughly 34 characters a line at 15px. */
function wrap(text: string, max = 34): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines;
}

async function main() {
  const manifest: Record<string, { t: number; label: string; cue: string }[]> =
    {};
  for (const id of FORM_BEAT_IDS) {
    const beats = getFormBeats(id);
    const legend = getDemoLegend(id);
    if (!beats || !legend) {
      console.warn(`skipped ${id}: no beats or no demo`);
      continue;
    }
    const rows = Math.ceil(beats.length / COLS);
    const W = PAD * 2 + COLS * CELL_W;
    const H = PAD * 2 + HEAD + rows * CELL_H;

    // Each figure is rasterised on its own, then composited — sharp
    // renders one SVG root at a time, and nesting the rig's output
    // inside another <svg> would re-resolve its viewBox.
    const tiles = await Promise.all(
      beats.map(async (b, i) => {
        const png = await sharp(frameOf(id, b), { density: 300 })
          .resize(CELL_W - 24, CELL_H - 118, {
            fit: "contain",
            background: { r: 17, g: 17, b: 19, alpha: 1 },
          })
          .flatten({ background: { r: 17, g: 17, b: 19, alpha: 1 } })
          .png()
          .toBuffer();
        return {
          input: png,
          left: PAD + (i % COLS) * CELL_W + 12,
          top: PAD + HEAD + Math.floor(i / COLS) * CELL_H,
        };
      })
    );

    const key = [
      legend.primary.length
        ? `<text x="${PAD}" y="${PAD + 30}" fill="${MUTED}" font-family="sans-serif" font-size="15">PRIMARY  <tspan fill="${FG}">${esc(legend.primary.join(", "))}</tspan></text>`
        : "",
      legend.secondary.length
        ? `<text x="${PAD}" y="${PAD + 54}" fill="${MUTED}" font-family="sans-serif" font-size="15">SECONDARY  <tspan fill="${FG}">${esc(legend.secondary.join(", "))}</tspan></text>`
        : "",
    ].join("");

    const captions = beats
      .map((b, i) => {
        const x = PAD + (i % COLS) * CELL_W + 12;
        const y = PAD + HEAD + Math.floor(i / COLS) * CELL_H + (CELL_H - 92);
        const cue = wrap(b.cue)
          .map(
            (l, k) =>
              `<text x="${x}" y="${y + 26 + k * 20}" fill="${MUTED}" font-family="sans-serif" font-size="15">${esc(l)}</text>`
          )
          .join("");
        return (
          `<text x="${x}" y="${y}" fill="${FG}" font-family="sans-serif" font-size="17" font-weight="700">${i + 1}. ${esc(b.label)}</text>` +
          cue
        );
      })
      .join("");

    const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${STAGE}"/><text x="${PAD}" y="${PAD + 4}" fill="${FG}" font-family="sans-serif" font-size="0"> </text>${key}${captions}</svg>`;

    await sharp(Buffer.from(canvas))
      .composite(tiles)
      .png()
      .toFile(resolve(out, `${id}-placard.png`));
    manifest[id] = beats.map((b) => ({ t: b.t, label: b.label, cue: b.cue }));

    /* Second artefact: the in-app CARD at each position — key on top,
     * one figure, the rail, the caption under it. An approximation of
     * `ExerciseRigDemo`'s placard branch drawn in SVG, since the agent
     * sandbox has no browser; it exists to judge the LAYOUT before a
     * capture run, not to stand in for one. */
    const CARD_W = 330;
    const CARD_H = 470;
    const cards = await Promise.all(
      beats.map(async (b, i) => {
        const png = await sharp(frameOf(id, b), { density: 300 })
          .resize(190, 250, {
            fit: "contain",
            background: { r: 17, g: 17, b: 19, alpha: 1 },
          })
          .flatten({ background: { r: 17, g: 17, b: 19, alpha: 1 } })
          .png()
          .toBuffer();
        return {
          input: png,
          left: (i % 3) * CARD_W + (CARD_W - 190) / 2,
          top: Math.floor(i / 3) * CARD_H + 92,
        };
      })
    );
    const chrome = beats
      .map((b, i) => {
        const cx = (i % 3) * CARD_W;
        const cy = Math.floor(i / 3) * CARD_H;
        const key =
          `<text x="${cx + 20}" y="${cy + 34}" fill="${MUTED}" font-family="sans-serif" font-size="12">PRIMARY  <tspan fill="${FG}">${esc(legend.primary.join(", "))}</tspan></text>` +
          `<text x="${cx + 20}" y="${cy + 54}" fill="${MUTED}" font-family="sans-serif" font-size="12">SECONDARY  <tspan fill="${FG}">${esc(legend.secondary.join(", "))}</tspan></text>`;
        // The rail: a wide pill for the position on screen.
        const railY = cy + 366;
        const railW = beats.length * 14;
        const rail = beats
          .map((_, k) => {
            const x = cx + CARD_W / 2 - railW / 2 + k * 14;
            return k === i
              ? `<rect x="${x}" y="${railY}" width="16" height="6" rx="3" fill="#7B72E9"/>`
              : `<rect x="${x + 4}" y="${railY}" width="6" height="6" rx="3" fill="#4A4A55"/>`;
          })
          .join("");
        const cue = wrap(b.cue, 40)
          .map(
            (l, k) =>
              `<text x="${cx + CARD_W / 2}" y="${cy + 424 + k * 20}" fill="${MUTED}" text-anchor="middle" font-family="sans-serif" font-size="14">${esc(l)}</text>`
          )
          .join("");
        return (
          `<rect x="${cx + 8}" y="${cy + 8}" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="16" fill="${STAGE}" stroke="#26262C"/>` +
          key +
          rail +
          `<circle cx="${cx + CARD_W / 2 - 52}" cy="${cy + 396}" r="10" fill="#FFFFFF" fill-opacity="0.1"/>` +
          `<text x="${cx + CARD_W / 2 - 52}" y="${cy + 400}" fill="${FG}" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="700">${i + 1}</text>` +
          `<text x="${cx + CARD_W / 2 - 34}" y="${cy + 401}" fill="${FG}" font-family="sans-serif" font-size="15" font-weight="600">${esc(b.label)}</text>` +
          cue
        );
      })
      .join("");
    const cardRows = Math.ceil(beats.length / 3);
    const SW = 3 * CARD_W;
    const SH = cardRows * CARD_H;
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" fill="#0A0A0C"/>${chrome}</svg>`
      )
    )
      .composite(cards)
      .png()
      .toFile(resolve(out, `${id}-stage.png`));

    console.log(`rendered ${id} (${beats.length} positions)`);
  }
  writeFileSync(
    resolve(out, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`manifest.json → ${out}`);
}
main();
