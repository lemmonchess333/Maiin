/**
 * Render the iOS launch image from the canonical brand mark.
 *
 * Two things are DERIVED here rather than re-typed, because both had
 * already drifted once:
 *
 *   1. The mark geometry is read out of `src/assets/brand/app-icon.svg`,
 *      which that file's own header declares the single source of truth
 *      for icon + brand derivations.
 *   2. The ground colour is read out of the `.dark { --background }`
 *      token in `src/index.css`. The launch image's whole job is to hand
 *      over to the app's first real frame with nothing to flash through,
 *      so it has to be the SAME colour the app paints — not a hardcoded
 *      approximation of it. (`#121214` in DESIGN_GUIDE prose is the
 *      approximation; the token resolves a shade under it.)
 *
 * `coldStartChrome.test.ts` reads this image's corner pixel back and
 * pins it against the token, so a drift between the two converters here
 * and there is a test failure rather than an invisible mismatch.
 *
 * MARK_SHARE is set against the DEVICE CROP, not the square. The
 * storyboard image view is `scaleAspectFill`, so a 2732 square on a
 * 1179x2556 phone is scaled 0.9356 and centre-cropped to the middle
 * ~46% of its width; the painted hexagon is 50.8% of its own box. At
 * 0.22 that lands the hexagon at ~24% of phone screen width and ~16% of
 * an 11" iPad's — the usual launch-mark register on both.
 *
 *   node scripts/art/gen-splash.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIZE = 2732;
const MARK_SHARE = 0.22;

/** `240 4% 7%` -> `#111113`. Same arithmetic as coldStartChrome.test.ts. */
function hslTokenToHex(token) {
  const [h, s, l] = token
    .trim()
    .split(/\s+/)
    .map((p) => parseFloat(p));
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

const css = readFileSync(resolve(root, "src/index.css"), "utf8");
const darkBlock = /\.dark\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
const bgToken = darkBlock && /--background:\s*([^;]+);/.exec(darkBlock)?.[1];
if (!bgToken)
  throw new Error("src/index.css: could not read .dark --background");
const GROUND = hslTokenToHex(bgToken);

const icon = readFileSync(
  resolve(root, "src/assets/brand/app-icon.svg"),
  "utf8"
);
const hex = /<polygon points="([^"]+)"/.exec(icon)?.[1];
const chevron = /<polyline points="([^"]+)"/.exec(icon)?.[1];
const strokeWidth = /stroke-width="(\d+)"/.exec(icon)?.[1];
if (!hex || !chevron || !strokeWidth) {
  throw new Error("brand/app-icon.svg: could not read the mark geometry");
}

const mark = Math.round(SIZE * MARK_SHARE);
/* Same construction as the icon: a solid hexagon with the chevron cut out
   of it, so the chevron shows the ground through the mark exactly as it
   shows the purple field through the icon. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="black"/>
      <polygon points="${hex}" fill="white"/>
      <polyline points="${chevron}" fill="none" stroke="black" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>
    </mask>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${GROUND}"/>
  <g transform="translate(${(SIZE - mark) / 2}, ${(SIZE - mark) / 2}) scale(${mark / 1024})">
    <rect width="1024" height="1024" fill="#7B72E9" mask="url(#cut)"/>
  </g>
</svg>`;

const out = await sharp(Buffer.from(svg))
  .png({ compressionLevel: 9 })
  .toBuffer();
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  // Capacitor's imageset declares the same file at 1x/2x/3x; the asset is
  // already larger than any device needs, so one render serves all three.
  writeFileSync(
    resolve(root, "ios/App/App/Assets.xcassets/Splash.imageset", name),
    out
  );
}
console.log(
  `wrote 3 x ${SIZE}px launch images on ${GROUND}, ${(out.length / 1024) | 0} KB each`
);
