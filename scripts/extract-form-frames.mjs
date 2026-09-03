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

/* The panel grid is DETECTED, not declared.
 *
 * It was hardcoded to the first card's pixel coordinates, which worked
 * for exactly that file: the second card arrived as 1448x1086 where the
 * first had been a 1170x2532 phone screenshot, and every constant was
 * wrong. Cards come out of a generator one at a time and their framing
 * is not going to be stable, so the script finds the panels instead.
 *
 * The signal is the panel BACKGROUND — a few levels lighter than the
 * page — because it is the one thing the layout is made of. Projecting
 * that mask onto each axis gives the gutters, and the gutters give the
 * grid. */

/** Panel-local boxes holding the number+title and the caption, as
 *  FRACTIONS of the panel, so they travel between card sizes. Measured
 *  on the first card (a 374x322 panel: title 214x54, caption full-width
 *  x64 starting at y258). */
const TITLE_BOX_F = { left: 0, top: 0, width: 0.572, height: 0.168 };
const CAPTION_BOX_F = { left: 0, top: 0.801, width: 1, height: 0.199 };
/** Breathing room around the union box, in source pixels. */
const MARGIN = 10;
/**
 * Output width: the DISPLAY size, so the browser resamples nothing.
 *
 * The player renders the frame 300pt wide, which is 900 device pixels
 * on a 3x phone. Writing anything else means two resamples instead of
 * one — sharp's Lanczos and then the browser's, which is the poorer of
 * the two. Writing exactly the display size costs a little in bytes on
 * a small source and spends it in the right place.
 *
 * It does NOT fix sharpness on a card, and nothing here can. Six panels
 * inside the 1448px a generator emits leave each figure about 300px
 * against the 900 the phone asks for: a 3x upscale however it is
 * resampled, and a card that could feed it would need to be roughly
 * 4300px wide. That is what `--frames` is for.
 */
const OUT_W = 1000;

/* Two inputs, because a card cannot be sharp.
 *
 *   <card.png>                 six panels in one image
 *   --frames a.png b.png ...   one image per position
 *
 * The card is the convenient form and the low-resolution one: six
 * panels inside what a generator can emit leaves each figure about a
 * third of what a 3x phone asks for. One image per position spends the
 * whole canvas on one figure and is the only route to a sharp frame
 * here — at the cost that the six are separate generations, so they
 * must be produced by EDITING the first rather than generated afresh,
 * or the camera moves between them. */
const args = process.argv.slice(2);
const framesAt = args.indexOf("--frames");
const perFrame = framesAt >= 0;
const inputs = perFrame ? args.slice(framesAt + 1) : [];
const card = perFrame ? null : args[0];
const outDir = resolve(
  (perFrame ? args[framesAt - 1] : args[1]) ?? "public/form-frames/dips"
);
if (!card && inputs.length === 0) {
  console.error(
    "usage: node scripts/extract-form-frames.mjs <card.png> [outDir]\n" +
      "       node scripts/extract-form-frames.mjs [outDir] --frames 1.png 2.png ..."
  );
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

/** The panel's flat background, read from a corner its art never
 *  reaches — in the panel's own proportions, since a fixed offset is
 *  off the bottom of a smaller card's panel entirely. */
async function background(buf) {
  const m = await sharp(buf).metadata();
  const { data } = await sharp(buf)
    .extract({
      left: Math.round((m.width ?? 0) * 0.01),
      top: Math.round((m.height ?? 0) * 0.93),
      width: 8,
      height: 8,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/**
 * Find the card's panels, in reading order.
 *
 * Detected rather than declared: the constants were measured off the
 * first card, and the second arrived as 1448x1086 where the first had
 * been a 1170x2532 phone screenshot. Cards come out of a generator one
 * at a time and their framing will not be stable.
 *
 * Three approaches were tried; the two that failed say why this one is
 * shaped as it is.
 *
 *  - Masking the panel TONE and projecting it. The figure sits inside
 *    the panel and is not that tone, so it punches a hole through every
 *    panel at almost every row. There is no band of clean full-width
 *    fill to find.
 *  - Identifying the page background by its commonest colour. Wrong in
 *    both directions: on a standalone card the panels cover more area
 *    than the gaps, so the panel fill wins; on a screenshot the phone's
 *    own black chrome wins.
 *
 * What works is the negative space. A GUTTER is page background at
 * every row it crosses, and neither art nor fill nor text can fake
 * that. Rows are measured first so the column pass can be confined to
 * the band the panels actually occupy — which is also what keeps the
 * header and the tip bar out of it.
 */
async function findPanels(card) {
  const { data, info } = await sharp(card)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const at = (x, y) => {
    const p = (y * W + x) * C;
    return [data[p], data[p + 1], data[p + 2]];
  };
  /* The page is read from a corner. That is exact for a card image and
     wrong for a screenshot of one, where the corner is the phone's
     chrome — hence the check at the end, which fails loudly rather than
     cutting six frames out of the wrong rectangles. */
  const page = at(2, 2);
  const ink = (x, y) => {
    const c = at(x, y);
    return (
      Math.abs(c[0] - page[0]) > 3 ||
      Math.abs(c[1] - page[1]) > 3 ||
      Math.abs(c[2] - page[2]) > 3
    );
  };

  /** Bands where `density` stays above `bar`, at least `minLen` long. */
  const bands = (density, bar, minLen) => {
    const out = [];
    let a = -1;
    density.forEach((v, i) => {
      if (v >= bar) {
        if (a < 0) a = i;
      } else {
        if (a >= 0 && i - a >= minLen) out.push([a, i - 1]);
        a = -1;
      }
    });
    if (a >= 0 && density.length - a >= minLen)
      out.push([a, density.length - 1]);
    return out;
  };

  const rowD = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (ink(x, y)) n++;
    rowD.push(n / W);
  }
  /* A panel row is filled edge to edge; a header row is sparse text.
     The tip bar is filled too, which the height filter removes. */
  let rows = bands(rowD, 0.5, Math.round(H * 0.05));
  const tallest = Math.max(0, ...rows.map(([a, b]) => b - a));
  rows = rows.filter(([a, b]) => b - a > tallest * 0.7);
  if (rows.length === 0)
    throw new Error("no panel rows found — is this a form card?");

  // Columns, measured only down the panel rows.
  const colD = new Array(W).fill(0);
  let counted = 0;
  for (const [y0, y1] of rows)
    for (let y = y0; y <= y1; y++) {
      counted++;
      for (let x = 0; x < W; x++) if (ink(x, y)) colD[x]++;
    }
  const cols = bands(
    colD.map((v) => v / counted),
    0.5,
    Math.round(W * 0.1)
  );

  if (cols.length < 2 || rows.length < 2)
    throw new Error(
      `grid not found (${cols.length} columns x ${rows.length} rows). ` +
        `Send the card IMAGE rather than a screenshot of one: a screenshot's ` +
        `corner pixel is the phone's chrome, not the card's background.`
    );

  const panels = [];
  for (const [y0, y1] of rows)
    for (const [x0, x1] of cols)
      panels.push({
        left: x0,
        top: y0,
        width: x1 - x0 + 1,
        height: y1 - y0 + 1,
      });
  return panels;
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

/** Per-position images need no grid: each file IS a panel. Their whole
 *  frame is the panel, so the title/caption boxes are empty. */
const detected = perFrame
  ? await Promise.all(
      inputs.map(async (f) => {
        const m = await sharp(f).metadata();
        return { left: 0, top: 0, width: m.width ?? 0, height: m.height ?? 0 };
      })
    )
  : await findPanels(card);
/* Normalised to one size before anything measures them. Detection is
   per-run and lands a pixel or two apart between panels, which is
   invisible until a title box computed from the first panel overflows
   a slightly shorter one. Everything downstream — the caption boxes,
   the shared crop — assumes the panels are congruent, so make them so
   here rather than defending against it in four places. */
const PW = Math.min(...detected.map((p) => p.width));
const PH = Math.min(...detected.map((p) => p.height));
const panels = detected.map((p) => ({ ...p, width: PW, height: PH }));
console.error(`detected ${panels.length} panels, ${PW}x${PH}`);

/** The panel border is card chrome, not figure: left in, the rounded
 *  frame sets the bounding box for every panel and the shared rect
 *  becomes the whole panel. Inset scales with the card. */
const INSET = Math.max(4, Math.round(PW * 0.016));
const W = PW - INSET * 2;
const H = PH - INSET * 2;
const scaleBox = (f) => {
  const left = Math.round(f.left * PW);
  const top = Math.round(f.top * PH);
  return {
    left,
    top,
    width: Math.min(PW - left, Math.max(1, Math.round(f.width * PW))),
    height: Math.min(PH - top, Math.max(1, Math.round(f.height * PH))),
  };
};
/**
 * A caption burned into a per-position image, as a box to paint out.
 *
 * The prompt asks for no text and the generators add it anyway — the
 * first real set came back with "RETURN TO TOP 6/6" across the bottom.
 * Left in, it joins the figure's bounding box, so the shared canvas
 * grows to hold it and every frame carries someone else's caption under
 * a caption the app is already drawing.
 *
 * Found rather than assumed: content rows are grouped into bands, and a
 * SHORT band at the bottom, separated from the body of the picture by a
 * clear gap, is a caption. A figure whose feet reach the bottom edge has
 * no such gap and nothing is painted.
 */
async function captionBox(file, bg) {
  const { data, info } = await sharp(file)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const ink = [];
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      if (
        Math.abs(data[i] - bg.r) > 14 ||
        Math.abs(data[i + 1] - bg.g) > 14 ||
        Math.abs(data[i + 2] - bg.b) > 14
      )
        n++;
    }
    ink.push(n);
  }
  const bands = [];
  let a = -1;
  ink.forEach((v, y) => {
    if (v > 0) {
      if (a < 0) a = y;
    } else {
      if (a >= 0) bands.push([a, y - 1]);
      a = -1;
    }
  });
  if (a >= 0) bands.push([a, H - 1]);
  if (bands.length < 2) return null;
  const last = bands[bands.length - 1];
  const prev = bands[bands.length - 2];
  const tall = last[1] - last[0];
  const gap = last[0] - prev[1];
  // A caption is short and stands clear of the figure above it.
  if (tall > H * 0.12 || gap < H * 0.02) return null;
  return {
    left: 0,
    top: Math.max(0, last[0] - 4),
    width: W,
    height: Math.min(H - Math.max(0, last[0] - 4), tall + 12),
  };
}

// A per-position image carries no panel chrome to paint out.
const TITLE_BOX = perFrame ? null : scaleBox(TITLE_BOX_F);
const CAPTION_BOX = perFrame ? null : scaleBox(CAPTION_BOX_F);

const cleaned = [];
let bg;
for (const [i, rect] of panels.entries()) {
  const source = perFrame ? inputs[i] : card;
  const panel = await sharp(source).extract(rect).png().toBuffer();
  if (!bg) bg = await background(panel);
  const boxes =
    TITLE_BOX && CAPTION_BOX
      ? [flat(bg, TITLE_BOX), flat(bg, CAPTION_BOX)]
      : await (async () => {
          const cap = await captionBox(source, bg);
          if (cap) console.error(`  ${source}: painting out a caption`);
          return cap ? [flat(bg, cap)] : [];
        })();
  const painted = boxes.length
    ? await sharp(panel).composite(boxes).png().toBuffer()
    : panel;
  /* Two passes, deliberately. `extract` in the SAME pipeline as
     `composite` is applied as a PRE-crop by sharp, which shrinks the
     canvas under the overlays and fails with "image to composite must
     have same dimensions or smaller". The panel border is card chrome
     rather than figure, so it is inset away before measuring — left in,
     the rounded frame sets the bounding box for every panel and the
     shared rect becomes the panel. */
  cleaned.push(
    await sharp(painted)
      .extract({ left: INSET, top: INSET, width: W, height: H })
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

for (let i = 0; i < cleaned.length; i++) {
  const cropped = await sharp(cleaned[i]).extract(rect).png().toBuffer();
  await sharp(await keyed(cropped))
    .resize({
      width: OUT_W,
    })
    // 82, not 90: on a card the source is upscaled and carries no
    // detail worth 55 KB an exercise to preserve. Alpha stays lossless
    // — the keyed edge is the one thing a low setting visibly frays.
    .webp({ quality: 82, alphaQuality: 100 })
    .toFile(resolve(outDir, `${i + 1}.webp`));
}
console.log(
  JSON.stringify(
    {
      mode: perFrame ? "per-position" : "card",
      background: bg,
      panels: panels.length,
      panelSize: `${PW}x${PH}`,
      sharedRect: rect,
      writtenWidth: OUT_W,
      outDir,
    },
    null,
    2
  )
);
if (!perFrame && rect.width < 600)
  console.error(
    `\nNOTE: each figure is only ${rect.width}px wide in this card, and the ` +
      `Form card renders ~900 device pixels on a 3x phone. It will look soft. ` +
      `Generate one image per position and use --frames for a sharp result.`
  );
