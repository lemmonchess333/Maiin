/** Convert reviewed draft PNG frames into immutable dated WebP candidates.
 *
 *   node scripts/art/package-redraw-candidate.mjs <exercise-id> [YYYY-MM-DD]
 *
 * This is lossless format conversion. It does not crop, composite, or edit the
 * generated illustrations. A candidate remains quarantined until its six
 * frames and release record pass review.
 */
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const [id, date = "2026-10-27"] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]+$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error(
    "Usage: package-redraw-candidate.mjs <exercise-id> [YYYY-MM-DD]"
  );
}
const source = join(
  "docs/exercise-art/pilots",
  `redraw-${date.replaceAll("-", "")}`,
  id
);
const target = join("public/form-frames", id, date);
const inputs = await Promise.all(
  Array.from({ length: 6 }, (_, index) =>
    readFile(join(source, `${index + 1}.png`))
  )
);
const sizes = await Promise.all(inputs.map((bytes) => sharp(bytes).metadata()));
const [width, height] = [sizes[0].width, sizes[0].height];
if (
  !width ||
  !height ||
  sizes.some((size) => size.width !== width || size.height !== height)
) {
  throw new Error(`${id}: all six source frames must have one canvas size`);
}
await mkdir(target, { recursive: true });
for (let index = 0; index < 6; index++) {
  await sharp(inputs[index])
    .webp({ lossless: true, effort: 6 })
    .toFile(join(target, `${index + 1}.webp`));
}
console.log(`${id}: six lossless WebPs at ${width}×${height} in ${target}`);
