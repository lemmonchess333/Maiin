/**
 * The deadlift's card picture, drawn from the front (owner, 2026-11-12).
 *
 *   npx tsx docs/exercise-art/sources/deadlift/2026-11-12/card.ts
 *   npm run art:cutouts -- --only=deadlift
 *
 * Keys build.py's start.png (the bar on the floor, from the front
 * three-quarter) out of its black stage with the same keying every other
 * card uses (scripts/art/keying.ts), and writes it as the deadlift's
 * prepared card source: docs/exercise-art/cutout-sources/deadlift.png and
 * the record beside it. The record binds it to the released reference it
 * stands for, form-frames/deadlift/1.webp, the same position drawn from
 * behind, so `art:cutouts` refuses it if that frame ever changes. The form
 * guide's six frames are not touched.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { cutOut } from "../../../../../scripts/art/keying";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

const start =
  "docs/exercise-art/pilots/redraw-20261112/deadlift-front/start.png";
const reference = "form-frames/deadlift/1.webp";
const { rgba, width, height, keyed } = await cutOut(resolve(ROOT, start));
if (!keyed) throw new Error(`${start}: expected a black stage to key out`);
const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
const dir = resolve(ROOT, "docs/exercise-art/cutout-sources");
writeFileSync(resolve(dir, "deadlift.png"), png);
const record = {
  reviewStatus: "reviewed",
  image: "deadlift.png",
  imageSha256: sha256(png),
  reference,
  referenceSha256: sha256(readFileSync(resolve(ROOT, "public", reference))),
  method:
    "The owner asked on 2026-11-12 for the deadlift's card and Home animation to face the person; the reviewed form guide keeps its six frames drawn from behind. This is the same position as the reference (the bar on the floor, set and gripped), drawn from the front three-quarter by gemini-3-pro-image with the canonical athlete, lined up by build.py and keyed out of its black stage by scripts/art/keying.ts, as every black-stage card is. Reviewed by Claude at native size and as a card on both themes; the owner has not yet seen this card in the app.",
  reviewEvidence:
    "docs/exercise-art/pilots/redraw-20261112/deadlift-front/start.png",
  provenance: "docs/exercise-art/sources/deadlift/2026-11-12/provenance.json",
};
writeFileSync(
  resolve(dir, "deadlift.json"),
  `${JSON.stringify(record, null, 2)}\n`
);
console.log(`deadlift card source: ${width}x${height}, ${png.length} bytes`);
