/**
 * Render every app icon from the canonical mark
 * (`src/assets/brand/app-icon.svg`):
 *
 *   iOS  AppIcon.appiconset: the default icon, plus the dark and tinted
 *        appearances iOS 18 offers on the home screen, each a 1024 square
 *        with no alpha channel (App Store Connect refuses an icon that has
 *        one). Writes the set's Contents.json too.
 *   Web  public/icons/icon-{72..512}.png, the PWA set (192 is "any
 *        maskable"; the mark sits well inside the maskable safe zone), and
 *        public/icons/icon.svg, the favicon: the icon on a rounded field.
 *
 * The default is the icon file itself, full bleed: iOS and the PWA's
 * maskable crop the corners. Dark is the purple mark on a dark field;
 * tinted is a white mark on black, which the system tints.
 *
 *   node scripts/art/gen-app-icon.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { readMark, markSvg } from "./brand-mark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mark = readMark(root);
const ICONSET = resolve(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
const BRAND = "#7B72E9";
const PWA_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const square = (inner, label = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"${label}>${inner}</svg>`;
const field = (top, bottom, rx = 0) =>
  `<defs><linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="1024" height="1024"${rx ? ` rx="${rx}"` : ""} fill="url(#field)"/>`;

const icon = readFileSync(resolve(root, "src/assets/brand/app-icon.svg"));
const dark = square(field("#1E1D25", "#0B0B0E") + markSvg(mark, BRAND));
const tinted = square(
  `<rect width="1024" height="1024" fill="#000000"/>` + markSvg(mark, "#FFFFFF")
);
const favicon = square(
  field("#8F87F3", "#6A61DD", 224) + markSvg(mark, "#FFFFFF"),
  ' role="img" aria-label="Tropos"'
);

async function png(svg, size, out) {
  let image = sharp(Buffer.from(svg));
  if (size !== 1024) image = image.resize(size, size, { kernel: "lanczos3" });
  const buf = await image
    .flatten({ background: "#000000" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(out, buf);
  return buf.length;
}

await png(icon, 1024, resolve(ICONSET, "AppIcon-512@2x.png"));
await png(dark, 1024, resolve(ICONSET, "AppIcon-dark.png"));
await png(tinted, 1024, resolve(ICONSET, "AppIcon-tinted.png"));

const appearance = (value, filename) => ({
  appearances: [{ appearance: "luminosity", value }],
  filename,
  idiom: "universal",
  platform: "ios",
  size: "1024x1024",
});
writeFileSync(
  resolve(ICONSET, "Contents.json"),
  JSON.stringify(
    {
      images: [
        {
          filename: "AppIcon-512@2x.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
        appearance("dark", "AppIcon-dark.png"),
        appearance("tinted", "AppIcon-tinted.png"),
      ],
      info: { author: "xcode", version: 1 },
    },
    null,
    2
  ) + "\n"
);

for (const size of PWA_SIZES) {
  await png(icon, size, resolve(root, `public/icons/icon-${size}x${size}.png`));
}
writeFileSync(resolve(root, "public/icons/icon.svg"), favicon + "\n");

console.log(
  `wrote 3 iOS icons, ${PWA_SIZES.length} PWA icons and the favicon from brand/app-icon.svg`
);
