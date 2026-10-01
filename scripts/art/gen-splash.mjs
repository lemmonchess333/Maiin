/**
 * Render the iOS launch image from the canonical brand mark.
 *
 * The launch image is the mark's hexagon alone, without its chevron: the
 * app's launch animation (src/components/LaunchSplash.tsx) starts from
 * this exact frame and raises the chevron into the hexagon, so the native
 * image hands over to the web layer without a jump.
 *
 * Two things are DERIVED here rather than re-typed, because both had
 * already drifted once:
 *
 *   1. The hexagon is read out of `src/assets/brand/app-icon.svg` by its
 *      id (`scripts/art/brand-mark.mjs`), the file every icon is rendered
 *      from.
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
 * ~46% of its width; the hexagon is 53.8% of its own box. At 0.22 that
 * lands the hexagon at ~26% of phone screen width and ~17% of an 11"
 * iPad's — the usual launch-mark register on both. LAUNCH_MARK_SHARE in
 * src/lib/brandMark.ts is the same arithmetic for the web layer.
 *
 *   node scripts/art/gen-splash.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readMark } from "./brand-mark.mjs";

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

const { hexagon, corner } = readMark(root);

const mark = Math.round(SIZE * MARK_SHARE);
/* The hexagon alone, rounded the way the icon rounds it: a round-joined
   stroke of its own colour around the corner-inset polygon. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${GROUND}"/>
  <g transform="translate(${(SIZE - mark) / 2}, ${(SIZE - mark) / 2}) scale(${mark / 1024})">
    <polygon points="${hexagon}" fill="#7B72E9" stroke="#7B72E9" stroke-width="${corner}" stroke-linejoin="round"/>
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
