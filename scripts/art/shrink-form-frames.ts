/**
 * The exercise pictures a build ships, made small (Ship1).
 *
 * The sources in `public/form-frames` stay exactly as reviewed: each
 * review record pins its pictures' bytes (`scripts/audit-form-art.ts`), and
 * most of them are lossless WebP at about 450 KB a frame. Copied as they
 * are, they made up nearly all of a 336 MB build, every byte of it inside
 * the iPhone app. So a build re-saves each lossless frame in its output as
 * lossy WebP at quality 85, which took the 756 frames from 335 MB to 32 MB.
 *
 * The re-save also fits each frame inside `FORM_FRAME_MAX_SIDE`, the
 * pixels the frame's box can show: `ExerciseFormFrames` draws a frame in a
 * 360-point square, which is 1080 pixels on a 3x iPhone. Most sources are
 * 1000 to 1700 pixels on their long side, so the rest was bytes no screen
 * shows; fitting them took the 912 frames from 38 MB to 25 MB. A frame that
 * is already lossy and already fits is left alone, since saving it again
 * only loses more; a lossy one bigger than the box is brought down. Either
 * way a re-save has to make the frame at least a tenth smaller to ship.
 *
 * Results are kept in a cache keyed by the source's bytes, so a rebuild
 * re-saves only frames that changed.
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";

export const FORM_FRAME_QUALITY = 85;

/** The longest side a shipped frame needs: the 360-point box it is drawn
 *  in, at 3x. `shrink-form-frames.test.ts` pins it to that box. */
export const FORM_FRAME_BOX_POINTS = 360;
export const FORM_FRAME_MAX_SIDE = FORM_FRAME_BOX_POINTS * 3;

/** Whether a WebP holds lossless image data (a `VP8L` chunk). */
export function isLosslessWebp(data: Buffer): boolean {
  if (
    data.length < 12 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WEBP"
  )
    return false;
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (kind === "VP8L") return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

/** The frame as the build ships it: the lossy re-save, fitted inside the
 *  box, when the frame is lossless or bigger than the box and the re-save
 *  makes it at least a tenth smaller; else null. */
export async function shrunkFormFrame(data: Buffer): Promise<Buffer | null> {
  const lossless = isLosslessWebp(data);
  const { width = 0, height = 0 } = await sharp(data).metadata();
  const oversized = Math.max(width, height) > FORM_FRAME_MAX_SIDE;
  if (!lossless && !oversized) return null;
  const smaller = await sharp(data)
    .resize({
      width: FORM_FRAME_MAX_SIDE,
      height: FORM_FRAME_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: FORM_FRAME_QUALITY, effort: 4 })
    .toBuffer();
  return smaller.length <= data.length * 0.9 ? smaller : null;
}

export interface ShrinkSummary {
  files: number;
  shrunk: number;
  bytesBefore: number;
  bytesAfter: number;
}

/** Re-saves every frame under `dir`, including dated release subfolders. */
export async function shrinkFormFrames(
  dir: string,
  options: { cacheDir?: string } = {}
): Promise<ShrinkSummary> {
  const summary: ShrinkSummary = {
    files: 0,
    shrunk: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
  if (!existsSync(dir)) return summary;
  const webpsBelow = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) return webpsBelow(path);
      return entry.isFile() && entry.name.endsWith(".webp") ? [path] : [];
    });
  const files = webpsBelow(dir);
  const { cacheDir } = options;
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const queue = [...files];
  const work = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const data = readFileSync(file);
      const key = createHash("sha256")
        .update(`q${FORM_FRAME_QUALITY}:max${FORM_FRAME_MAX_SIDE}:`)
        .update(data)
        .digest("hex");
      // The cache holds the re-save, or a marker that the frame ships as is.
      const cached = cacheDir ? join(cacheDir, `${key}.webp`) : null;
      const asIs = cached ? `${cached}.as-is` : null;
      let shipped: Buffer | null;
      if (cached && existsSync(cached)) shipped = readFileSync(cached);
      else if (asIs && existsSync(asIs)) shipped = null;
      else {
        shipped = await shrunkFormFrame(data);
        if (cached && asIs)
          writeFileSync(shipped ? cached : asIs, shipped ?? "");
      }
      summary.files += 1;
      summary.bytesBefore += data.length;
      if (shipped) {
        writeFileSync(file, shipped);
        summary.shrunk += 1;
        summary.bytesAfter += shipped.length;
      } else summary.bytesAfter += data.length;
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, cpus().length) }, () => work())
  );
  return summary;
}
