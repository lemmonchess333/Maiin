/**
 * Derive one transparent cut-out per released exercise drawing.
 *
 * The cut-outs are for the places a drawing sits on a CARD rather than on
 * the form guide's stage: Home's Today card, exercise rows, the finish
 * screen. Many released sets were drawn on solid black, which on a card
 * reads as a black box.
 *
 * The reviewed frame sets under public/form-frames are NOT touched. Their
 * release records pin every delivered frame's sha256
 * (docs/exercise-art/releases, formArtOwnerRelease.test.ts), so a cut-out
 * written over them would quietly un-approve the art. Each cut-out is
 * derived from its set's card frame (its reference, unless
 * src/lib/formArtCardFrames.ts lists a frame that shows the exercise
 * better) and records that frame's hash; formArtCutouts.test.ts fails
 * when that frame changes and its cut-out was not regenerated.
 *
 * Black-background sets are keyed out by keying.ts (`cutoutWebp`), which
 * also trims each to its content and scales it to fit 480 px.
 * A reviewed transparent source can be supplied in
 * docs/exercise-art/cutout-sources/<id>.json. Its image and reference hashes
 * must match; this preserves imagegen/artist edits when regenerating cards.
 * Sets that already carry their own alpha are only trimmed and scaled.
 *
 *   npm run art:cutouts
 *   npm run art:cutouts -- --only=leg-raise
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { cutoutWebp } from "./keying";
import {
  FORM_ART_CUTOUTS,
  type FormArtCutout,
} from "../../src/lib/formArtCutouts.data";
import { CUTOUT_MANIFEST, renderCutoutManifest } from "./cutout-manifest";
import { formatGenerated } from "./format-generated";
import { preparedCutoutPath } from "./prepared-cutout";
import {
  FORM_ARTWORK,
  getReleasedFormArtwork,
} from "../../src/lib/formArtwork";
import { cardFrameOf } from "../../src/lib/formArtCardFrames";

const ROOT = resolve(import.meta.dirname, "..", "..");
const OUT_DIR = resolve(ROOT, "public", "form-art");
const MANIFEST = resolve(ROOT, CUTOUT_MANIFEST);

const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: [string, FormArtCutout][] = [];
  const ids = Object.keys(FORM_ARTWORK)
    .filter((id) => getReleasedFormArtwork(id))
    .sort();
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
  if (only && !ids.includes(only))
    throw new Error(`Unknown released exercise: ${only}`);
  for (const id of ids) {
    const art = getReleasedFormArtwork(id)!;
    const source = cardFrameOf(id, art);
    const sourcePath = resolve(ROOT, "public", source);
    const sourceBytes = readFileSync(sourcePath);
    if (only && id !== only) {
      const previous = FORM_ART_CUTOUTS[id];
      if (
        !previous ||
        previous.source !== source ||
        previous.sourceSha256 !== sha256(sourceBytes) ||
        previous.sha256 !==
          sha256(readFileSync(resolve(ROOT, "public", previous.src)))
      ) {
        throw new Error(
          `${id}: stale existing cutout; regenerate it before a targeted export`
        );
      }
      rows.push([id, previous]);
      continue;
    }
    // Preserve reviewed artist/imagegen cutouts across future regenerations.
    // Their transparent source stays bound to the exact released reference.
    const preparedDir = resolve(ROOT, "docs/exercise-art/cutout-sources");
    const prepared = preparedCutoutPath(preparedDir, id, source, sourceBytes);
    const inputPath = prepared ?? sourcePath;
    if (prepared) {
      const alpha = await sharp(prepared).stats();
      if (alpha.channels.length !== 4 || alpha.channels[3].min !== 0)
        throw new Error(
          `${id}: prepared cutout needs a transparent background`
        );
    }
    const {
      webp,
      width: outW,
      height: outH,
      keyed,
    } = await cutoutWebp(inputPath);
    const rel = `form-art/${id}.webp`;
    writeFileSync(resolve(ROOT, "public", rel), webp);
    rows.push([
      id,
      {
        src: rel,
        width: outW,
        height: outH,
        keyed,
        source,
        sourceSha256: sha256(sourceBytes),
        sha256: sha256(webp),
      },
    ]);
    console.log(
      `${id.padEnd(28)} ${keyed ? "keyed " : "alpha "} ${outW}x${outH}  ${(webp.length / 1024).toFixed(0)} KB`
    );
  }
  writeFileSync(
    MANIFEST,
    await formatGenerated(MANIFEST, renderCutoutManifest(rows))
  );
  console.log(`wrote ${rows.length} cut-outs and ${MANIFEST}`);
}

await main();
