/**
 * Cut an owner-supplied form card into animation frames.
 *
 * The reference for the dips placard is a printed-style card: one image
 * holding six numbered panels. The app animates the FIGURES from those
 * panels, so this script lifts each figure out — the card's own art,
 * unretouched apart from the panel text, which the app renders itself
 * (themed, selectable, translatable, and legible at any size, none of
 * which pixels in a JPEG can be).
 *
 * Two things it does that a naive crop does not:
 *
 *  - Paints out the panel's title and caption before measuring, so the
 *    trim finds the FIGURE and not the text. The boxes are verified
 *    against every panel; a box that clipped a limb would show up as a
 *    straight edge across the body.
 *  - Crops every frame to ONE shared rect — the union of all six
 *    figures' bounding boxes. Trimming each frame to its own box makes
 *    the body jump around the canvas between frames; a shared rect is
 *    what makes six stills read as one movement.
 *  - Keys the card's panel background out to transparency, so the
 *    figure sits on the app's stage instead of on a lighter rectangle
 *    of someone else's background. Soft-edged: pixels near the
 *    background fade rather than cut, or the figure gets a hard halo
 *    where its anti-aliased edge blended into the card.
 * What it deliberately does NOT do is register the frames on the
 * equipment. Panels generated one at a time do not share a camera — on
 * the dips card the station is drawn at a different position, size and
 * angle in all six — and a translation search was written, measured and
 * removed: mean station overlap against the first frame went 9.3% →
 * 8.7%, i.e. slightly worse, because aligning the bar pulls the posts
 * apart. Translation cannot fix a scene that was redrawn each time. The
 * fix for that is upstream, in how the card is generated; a fix in here
 * would be complexity that measurably does nothing.
 *
 * Usage: node scripts/extract-form-frames.mjs <card.png> <outDir>
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/** Panel grid of the 2026-09-03 dips card, in source pixels. */
const GRID = {
  cols: [26, 403, 780],
  rows: [958, 1288],
  w: 374,
  h: 322,
};
/** Panel-local boxes holding the number+title and the two caption
 *  lines. Painted with the panel's own background before trimming. */
const TITLE_BOX = { left: 0, top: 0, width: 214, height: 54 };
const CAPTION_BOX = { left: 0, top: 258, width: 374, height: 64 };
/** Breathing room around the union box, in source pixels. */
const MARGIN = 10;
/** Output width. 2x a ~340px phone card, which is where these render. */
const OUT_W = 680;

const card = process.argv[2];
const outDir = resolve(process.argv[3] ?? "public/form-frames/dips");
if (!card) {
  console.error("usage: node scripts/extract-form-frames.mjs <card.png> [out]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const panelRect = (i) => ({
  left: GRID.cols[i % 3],
  top: GRID.rows[Math.floor(i / 3)],
  width: GRID.w,
  height: GRID.h,
});

/** The panel's flat background, read from a corner the art never uses. */
async function background(buf) {
  const { data } = await sharp(buf)
    .extract({ left: 4, top: 300, width: 8, height: 8 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/** Bounding box of everything that differs from `bg` by more than
 *  `tol` on any channel. */
function contentBox(data, info, bg, tol = 14) {
  let x0 = info.width,
    y0 = info.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (
        Math.abs(data[i] - bg.r) > tol ||
        Math.abs(data[i + 1] - bg.g) > tol ||
        Math.abs(data[i + 2] - bg.b) > tol
      ) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

const flat = (bg, box) => ({
  input: {
    create: {
      width: box.width,
      height: box.height,
      channels: 3,
      background: bg,
    },
  },
  left: box.left,
  top: box.top,
});

const cleaned = [];
let bg;
for (let i = 0; i < 6; i++) {
  const panel = await sharp(card).extract(panelRect(i)).png().toBuffer();
  if (!bg) bg = await background(panel);
  const painted = await sharp(panel)
    .composite([flat(bg, TITLE_BOX), flat(bg, CAPTION_BOX)])
    .png()
    .toBuffer();
  /* Two passes, deliberately. `extract` in the SAME pipeline as
     `composite` is applied as a PRE-crop by sharp, which shrinks the
     canvas under the overlays and fails with "image to composite must
     have same dimensions or smaller". The panel border is card chrome
     rather than figure, so it is inset away before measuring — left in,
     the rounded frame sets the bounding box for every panel and the
     shared rect becomes the panel. */
  cleaned.push(
    await sharp(painted)
      .extract({ left: 6, top: 6, width: GRID.w - 12, height: GRID.h - 12 })
      .png()
      .toBuffer()
  );
}

// One rect for all six: the union of every figure's box.
let U = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
for (const buf of cleaned) {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const b = contentBox(data, info, bg);
  U = {
    x0: Math.min(U.x0, b.x0),
    y0: Math.min(U.y0, b.y0),
    x1: Math.max(U.x1, b.x1),
    y1: Math.max(U.y1, b.y1),
  };
}
const W = GRID.w - 12;
const H = GRID.h - 12;
const rect = {
  left: Math.max(0, U.x0 - MARGIN),
  top: Math.max(0, U.y0 - MARGIN),
};
rect.width = Math.min(W - rect.left, U.x1 - U.x0 + 2 * MARGIN);
rect.height = Math.min(H - rect.top, U.y1 - U.y0 + 2 * MARGIN);

/** Background → transparent, with a ramp so the figure keeps its
 *  anti-aliased edge. Below `SOLID` from the background is card, above
 *  `KEEP` is figure, and between is a partial alpha. */
const SOLID = 8;
const KEEP = 22;
async function keyed(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const d = Math.max(
      Math.abs(data[i] - bg.r),
      Math.abs(data[i + 1] - bg.g),
      Math.abs(data[i + 2] - bg.b)
    );
    data[i + 3] =
      d <= SOLID
        ? 0
        : d >= KEEP
          ? 255
          : Math.round(((d - SOLID) / (KEEP - SOLID)) * 255);
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer();
}

for (let i = 0; i < 6; i++) {
  const cropped = await sharp(cleaned[i]).extract(rect).png().toBuffer();
  await sharp(await keyed(cropped))
    .resize({ width: OUT_W })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(resolve(outDir, `${i + 1}.webp`));
}
console.log(
  JSON.stringify(
    { background: bg, sharedRect: rect, frames: 6, outDir },
    null,
    2
  )
);
