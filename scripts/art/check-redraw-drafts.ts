/** Read-only image checks for the quarantined exercise redraw drafts.
 *
 * Usage: node --import tsx scripts/art/check-redraw-drafts.ts [exercise-id ...]
 *
 * Put 1.png … 6.png (or WebP equivalents) in each draft directory. Optional
 * `fixed-zones.json` may contain {"zones":[{"name":"bench leg", "x":10,
 * "y":20,"width":30,"height":40}]} in native pixel coordinates. A zone
 * should contain fixed equipment only; the report compares it with frame 1
 * and prints its bright-pixel bounds. Crop edges and shadows can move the
 * bounds, so use actual equipment landmarks for a release review record.
 * This is a screening report. Anatomy, motion and contact require visual review.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = "docs/exercise-art/pilots/redraw-20261027";
const ids = process.argv.slice(2);
const EDGE_WIDTH = 4;
const FOREGROUND_MIN = 32;
const BACKGROUND_MAX = 24;

type RawFrame = {
  path: string;
  sha256: string;
  width: number;
  height: number;
  data: Buffer;
  channels: number;
};
type FixedZone = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

async function loadFrame(path: string): Promise<RawFrame> {
  const bytes = readFileSync(path);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: info.width,
    height: info.height,
    data,
    channels: info.channels,
  };
}

function inspectFrame(frame: RawFrame) {
  const { width, height } = frame;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const edgeHits = { top: 0, right: 0, bottom: 0, left: 0 };
  let cornerTotal = 0;
  let cornerBright = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * frame.channels;
      const value = Math.max(
        frame.data[offset],
        frame.data[offset + 1],
        frame.data[offset + 2]
      );
      if (value >= FOREGROUND_MIN) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (value >= 64) {
        if (y < EDGE_WIDTH) edgeHits.top++;
        if (x >= width - EDGE_WIDTH) edgeHits.right++;
        if (y >= height - EDGE_WIDTH) edgeHits.bottom++;
        if (x < EDGE_WIDTH) edgeHits.left++;
      }
      if (
        (x < 12 || x >= width - 12) &&
        (y < 12 || y >= height - 12)
      ) {
        cornerTotal++;
        if (value > BACKGROUND_MAX) cornerBright++;
      }
    }
  }
  const margins =
    maxX === -1
      ? null
      : { top: minY, right: width - 1 - maxX, bottom: height - 1 - maxY, left: minX };
  const span =
    maxX === -1
      ? null
      : {
          widthPercent: +((100 * (maxX - minX + 1)) / width).toFixed(1),
          heightPercent: +((100 * (maxY - minY + 1)) / height).toFixed(1),
        };
  return { margins, span, edgeHits, cornerBright, cornerTotal };
}

function compare(a: RawFrame, b: RawFrame, zone?: FixedZone) {
  const x0 = zone?.x ?? 0;
  const y0 = zone?.y ?? 0;
  const x1 = x0 + (zone?.width ?? a.width);
  const y1 = y0 + (zone?.height ?? a.height);
  let sum = 0;
  let changed = 0;
  let samples = 0;
  // Every fourth pixel is sufficient to screen drift without keeping 90
  // full-resolution comparison images in memory at once.
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const p = (y * a.width + x) * a.channels;
      const q = (y * b.width + x) * b.channels;
      const diff = Math.max(
        Math.abs(a.data[p] - b.data[q]),
        Math.abs(a.data[p + 1] - b.data[q + 1]),
        Math.abs(a.data[p + 2] - b.data[q + 2])
      );
      sum += diff;
      if (diff > 12) changed++;
      samples++;
    }
  }
  return { meanDifference: +(sum / samples).toFixed(2), changedPercent: +((100 * changed) / samples).toFixed(2) };
}

function brightBounds(frame: RawFrame, zone: FixedZone) {
  let minX = zone.x + zone.width;
  let minY = zone.y + zone.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = zone.y; y < zone.y + zone.height; y++) {
    for (let x = zone.x; x < zone.x + zone.width; x++) {
      const p = (y * frame.width + x) * frame.channels;
      if (Math.max(frame.data[p], frame.data[p + 1], frame.data[p + 2]) < FOREGROUND_MIN)
        continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return null;
  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function fixedZones(dir: string, width: number, height: number): FixedZone[] {
  const path = join(dir, "fixed-zones.json");
  if (!existsSync(path)) return [];
  const json: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!json || typeof json !== "object" || !Array.isArray((json as { zones?: unknown }).zones))
    throw new Error(`${path}: expected a zones array`);
  const zones = (json as { zones: FixedZone[] }).zones;
  for (const zone of zones) {
    if (
      !zone || typeof zone.name !== "string" || !zone.name.trim() ||
      ![zone.x, zone.y, zone.width, zone.height].every(Number.isInteger) ||
      zone.x < 0 || zone.y < 0 || zone.width <= 0 || zone.height <= 0 ||
      zone.x + zone.width > width || zone.y + zone.height > height
    ) throw new Error(`${path}: invalid fixed zone`);
  }
  return zones;
}

async function inspectExercise(id: string) {
  const dir = join(ROOT, id);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.log(`${id}: no draft directory`);
    return;
  }
  const names = readdirSync(dir);
  const frames: Array<RawFrame | null> = [];
  const problems: string[] = [];
  for (let n = 1; n <= 6; n++) {
    const candidates = names.filter((name) => new RegExp(`^${n}\\.(png|webp)$`, "i").test(name));
    if (candidates.length !== 1) {
      problems.push(`frame ${n}: ${candidates.length ? "multiple formats" : "missing"}`);
      frames.push(null);
      continue;
    }
    frames.push(await loadFrame(join(dir, candidates[0])));
  }
  const present = frames.filter((frame): frame is RawFrame => frame !== null);
  console.log(`\n${id}: ${present.length}/6 frames`);
  if (!present.length) {
    console.log(`  ${problems.join("; ")}`);
    return;
  }
  const canvas = `${present[0].width}×${present[0].height}`;
  const dimensionsMatch = present.every((frame) => frame.width === present[0].width && frame.height === present[0].height);
  console.log(`  canvas ${canvas}${dimensionsMatch ? "" : " — MISMATCH"}`);
  if (!dimensionsMatch) problems.push("frames have mismatched dimensions");
  const hashes = new Map<string, number[]>();
  for (let n = 0; n < frames.length; n++) {
    const frame = frames[n];
    if (!frame) continue;
    const check = inspectFrame(frame);
    const touched = Object.entries(check.edgeHits).filter(([, count]) => count > 0).map(([side]) => side);
    const margins = check.margins ? Object.entries(check.margins).map(([side, px]) => `${side} ${px}px`).join(", ") : "no foreground";
    const span = check.span ? `${check.span.widthPercent}%×${check.span.heightPercent}%` : "none";
    console.log(`  ${n + 1}: ${frame.width}×${frame.height} ${frame.sha256.slice(0, 12)}  content ${span}; margins ${margins}; edge ${touched.join("/") || "clear"}; corners ${check.cornerBright}/${check.cornerTotal} bright`);
    if (touched.length) problems.push(`frame ${n + 1}: foreground touches ${touched.join("/")} border`);
    if (check.cornerBright) problems.push(`frame ${n + 1}: nonblack corner`);
    const group = hashes.get(frame.sha256) ?? [];
    group.push(n + 1);
    hashes.set(frame.sha256, group);
  }
  const duplicates = [...hashes.values()].filter((group) => group.length > 1);
  console.log(`  identical files: ${duplicates.map((group) => group.join("=" )).join(", ") || "none"}`);
  if (
    frames[0] && frames[5] &&
    frames[0].width === frames[5].width &&
    frames[0].height === frames[5].height
  ) {
    const seam = compare(frames[0], frames[5]);
    console.log(`  frame 6→1: ${frames[0].sha256 === frames[5].sha256 ? "byte-identical" : `${seam.meanDifference} mean RGB difference, ${seam.changedPercent}% samples changed — inspect loop manually`}`);
  }
  if (frames[0] && dimensionsMatch) {
    for (const zone of fixedZones(dir, frames[0].width, frames[0].height)) {
      const stats = frames.map((frame, i) => frame && i > 0 ? `${i + 1}:${compare(frames[0]!, frame, zone).changedPercent}%` : null).filter(Boolean);
      console.log(`  fixed zone ${zone.name}: changed samples vs 1 — ${stats.join(" ")}`);
      const bounds = frames.map((frame, i) => {
        if (!frame) return `${i + 1}:missing`;
        const box = brightBounds(frame, zone);
        return box
          ? `${i + 1}:(${box.left},${box.top})–(${box.right},${box.bottom}) ${box.width}×${box.height}`
          : `${i + 1}:empty`;
      });
      console.log(`  fixed zone ${zone.name}: bright bounds — ${bounds.join("; ")}`);
    }
  }
  if (problems.length) console.log(`  findings: ${problems.join("; ")}`);
}

async function main() {
  const selected = ids.length ? ids : existsSync(ROOT) ? readdirSync(ROOT).filter((name) => statSync(join(ROOT, name)).isDirectory()).sort() : [];
  for (const id of selected) await inspectExercise(id);
  if (!selected.length) console.log(`No drafts found under ${ROOT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
