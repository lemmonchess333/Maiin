/**
 * Key a drawing out of its solid black backdrop, for a card.
 *
 * Black-background drawings are keyed out in five steps:
 *   1. background candidates: max(r, g, b) <= 14
 *   2. erode by 3 px (a 7x7 minimum), so thin dark lines inside the
 *      figure drop out of the candidate set
 *   3. keep connected regions of at least 1,200 px: the backdrop and the
 *      large enclosed gaps (between an arm and the torso), never a small
 *      shadow inside the figure
 *   4. grow the kept regions back by 4 px (a 9x9 maximum)
 *   5. inside the grown region, anything at or below the threshold is
 *      fully transparent and brighter pixels ramp to opaque by 48, so the
 *      anti-aliased edge fades instead of leaving a dark rim. (A ramp that
 *      started at zero left the backdrop at 10-30% opacity, invisible on a
 *      dark card and a grey box on a white one.)
 * A drawing that already carries its own alpha is only trimmed and scaled.
 * Every image is then trimmed to its content with 4% padding and scaled to
 * fit 480 px on its long side.
 *
 * The exercise cut-outs (cut-out-form-art.ts) and the run cards' runner
 * (cut-out-run-poses.ts) both come through here, so a card's drawings are
 * keyed alike.
 */
import sharp from "sharp";

const DARK_MAX = 14;
const ERODE_RADIUS = 3;
const MIN_REGION = 1200;
const GROW_RADIUS = 4;
const EDGE_RAMP = 48;
const PAD_SHARE = 0.04;
const LONG_SIDE = 480;

/** Separable square min (erode) or max (dilate) filter over a 0/1 mask. */
function squareFilter(
  mask: Uint8Array,
  w: number,
  h: number,
  radius: number,
  mode: "min" | "max"
): Uint8Array {
  const pick = mode === "min" ? Math.min : Math.max;
  // Outside the image counts as background for the erosion, so the
  // backdrop is not eaten away from the canvas border.
  const edge = mode === "min" ? 1 : 0;
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = mode === "min" ? 1 : 0;
      for (let d = -radius; d <= radius; d++) {
        const xx = x + d;
        const s = xx < 0 || xx >= w ? edge : mask[y * w + xx];
        v = pick(v, s);
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = mode === "min" ? 1 : 0;
      for (let d = -radius; d <= radius; d++) {
        const yy = y + d;
        const s = yy < 0 || yy >= h ? edge : tmp[yy * w + x];
        v = pick(v, s);
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Keep the 4-connected regions of `mask` with at least `min` pixels. */
function bigRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  min: number
): Uint8Array {
  const seen = new Uint8Array(mask.length);
  const keep = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const region: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    region.length = 0;
    while (top > 0) {
      const i = stack[--top];
      region.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack[top++] = i + 1;
      }
      if (y > 0 && mask[i - w] && !seen[i - w]) {
        seen[i - w] = 1;
        stack[top++] = i - w;
      }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) {
        seen[i + w] = 1;
        stack[top++] = i + w;
      }
    }
    if (region.length >= min) for (const i of region) keep[i] = 1;
  }
  return keep;
}

async function cutOut(file: string): Promise<{
  rgba: Buffer;
  width: number;
  height: number;
  keyed: boolean;
}> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;
  let hasOwnAlpha = false;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 255) {
      hasOwnAlpha = true;
      break;
    }
  }
  if (hasOwnAlpha) return { rgba: data, width: w, height: h, keyed: false };

  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    dark[i] = Math.max(data[p], data[p + 1], data[p + 2]) <= DARK_MAX ? 1 : 0;
  }
  const eroded = squareFilter(dark, w, h, ERODE_RADIUS, "min");
  const keep = bigRegions(eroded, w, h, MIN_REGION);
  const near = squareFilter(keep, w, h, GROW_RADIUS, "max");
  for (let i = 0; i < n; i++) {
    if (!near[i]) continue;
    const p = i * 4;
    const lum = Math.max(data[p], data[p + 1], data[p + 2]);
    data[p + 3] =
      lum <= DARK_MAX
        ? 0
        : Math.min(
            255,
            Math.round(((lum - DARK_MAX) * 255) / (EDGE_RAMP - DARK_MAX))
          );
  }
  return { rgba: data, width: w, height: h, keyed: true };
}

/** Bounding box of pixels with visible alpha, padded and clamped. */
function contentBox(rgba: Buffer, w: number, h: number) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("image has no visible content");
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * PAD_SHARE);
  const left = Math.max(0, x0 - pad);
  const top = Math.max(0, y0 - pad);
  return {
    left,
    top,
    width: Math.min(w, x1 + pad + 1) - left,
    height: Math.min(h, y1 + pad + 1) - top,
  };
}

/** The card cut-out of one drawing, as a transparent WebP. */
export async function cutoutWebp(file: string): Promise<{
  webp: Buffer;
  width: number;
  height: number;
  keyed: boolean;
}> {
  const { rgba, width, height, keyed } = await cutOut(file);
  const box = contentBox(rgba, width, height);
  const scale = Math.min(1, LONG_SIDE / Math.max(box.width, box.height));
  const outW = Math.round(box.width * scale);
  const outH = Math.round(box.height * scale);
  const webp = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract(box)
    .resize(outW, outH, { kernel: "lanczos3" })
    .webp({ quality: 82, alphaQuality: 90, effort: 6 })
    .toBuffer();
  return { webp, width: outW, height: outH, keyed };
}
