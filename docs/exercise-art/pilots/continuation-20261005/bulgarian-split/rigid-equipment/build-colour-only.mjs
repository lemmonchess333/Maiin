// Selected draft continuation: fixed contact + bounded native lilac import.
// The rigid-equipment trials are rejected and do not enter this image.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024,
  count = width * height;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pins = {
  contact: {
    path: "../composite/bottom.png",
    sha256: "97ede66ab06894d36c2712222aba62a997c0b0a63c82e7b09903eef1956ec32f",
  },
  colour: {
    path: "../sources/bottom-secondary-repair.png",
    sha256: "5d95ba9a1ed62bc535ae14472eb42a964cf621c4713d713371c0b647f2f48ad1",
  },
};
async function readPinned(pin) {
  const bytes = readFileSync(resolve(here, pin.path));
  if (sha(bytes) !== pin.sha256) throw Error(`Source changed: ${pin.path}`);
  const result = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    result.info.width !== width ||
    result.info.height !== height ||
    result.info.channels !== 3
  )
    throw Error("Wrong native canvas");
  return result.data;
}
const [source, colour] = await Promise.all([
  readPinned(pins.contact),
  readPinned(pins.colour),
]);
const maskPath = "masks/bottom-tint-import.png";
const maskBytes = readFileSync(resolve(here, maskPath));
if (
  sha(maskBytes) !==
  "9fa9588c1267719d0a5a4bbe21e2a54365c8bf2c6066a126a3a1605525549051"
)
  throw Error("Reviewed tint mask changed");
const maskRaw = await sharp(maskBytes)
  .raw()
  .toBuffer({ resolveWithObject: true });
if (maskRaw.info.width !== width || maskRaw.info.height !== height)
  throw Error("Wrong tint mask canvas");
const supportBytes = readFileSync(
  resolve(here, "../composite/protected-support-mask.png")
);
const supportRaw = await sharp(supportBytes)
  .raw()
  .toBuffer({ resolveWithObject: true });
const output = Buffer.from(source);
let importedPixels = 0,
  changedPixels = 0,
  outsideMaskChangedChannels = 0,
  protectedSupportPixels = 0,
  protectedSupportChangedChannels = 0,
  nearGearChangedChannels = 0,
  farGearChangedChannels = 0;
const inBox = (x, y, [l, t, w, h]) =>
  x >= l && x < l + w && y >= t && y < t + h;
const gearBoxes = { near: [582, 650, 171, 94], far: [296, 596, 116, 86] };
for (let p = 0; p < count; p++) {
  const a = maskRaw.data[p * maskRaw.info.channels],
    protectedSupport = supportRaw.data[p * supportRaw.info.channels];
  const x = p % width,
    y = Math.floor(p / width);
  if (a) importedPixels++;
  if (protectedSupport) protectedSupportPixels++;
  let changed = false;
  for (let c = 0; c < 3; c++) {
    const i = p * 3 + c;
    if (a)
      output[i] = Math.round(source[i] * (1 - a / 255) + (colour[i] * a) / 255);
    if (output[i] !== source[i]) {
      changed = true;
      if (!a) outsideMaskChangedChannels++;
      if (protectedSupport) protectedSupportChangedChannels++;
      if (inBox(x, y, gearBoxes.near)) nearGearChangedChannels++;
      if (inBox(x, y, gearBoxes.far)) farGearChangedChannels++;
    }
  }
  if (changed) changedPixels++;
}
if (
  importedPixels !== 2374 ||
  outsideMaskChangedChannels ||
  protectedSupportChangedChannels ||
  nearGearChangedChannels ||
  farGearChangedChannels
)
  throw Error("Bounded colour-only preservation check failed");
const bytes = await sharp(output, { raw: { width, height, channels: 3 } })
  .png()
  .toBuffer();
const outputPath = "bottom-contact-colour.png";
writeFileSync(resolve(here, outputPath), bytes);
const report = {
  releaseApproved: false,
  status: "selected-non-rigid-draft-with-equipment-variation-finding",
  method:
    "Copy the final fixed-contact bottom source, then import only the already reviewed 2374-pixel generated lilac mask. No rigid equipment layer, old-gear clearing, edge matte or anatomy bridge is used. Every pixel outside the tint mask is identical to the contact source.",
  nativeCanvas: [width, height],
  sources: pins,
  mask: {
    path: maskPath,
    sha256: sha(maskBytes),
    region: [444, 622, 138, 42],
    derivation:
      "See finalize.mjs: neutral original hamstring anatomy + generated lilac, two-pixel dark-boundary guard, bounded 4–6px outer feather.",
  },
  output: { path: outputPath, sha256: sha(bytes) },
  preservation: {
    importedPixels,
    changedPixels,
    outsideMaskChangedChannels,
    protectedSupportPixels,
    protectedSupportChangedChannels,
    gearBoxes,
    nearGearChangedChannels,
    farGearChangedChannels,
  },
  rejectedAlternative:
    "Rigid poses under poses/ and trials/ have exact interior patches but unacceptable outer contours. They are not selected for the main six-frame draft.",
  remainingFindings: [
    "Original generated dumbbell-head dimensions vary across the four native poses; the equipment invariance gate is not passed.",
    "Actual mobile light/dark playback is unavailable in this environment; there is no release approval.",
  ],
};
writeFileSync(
  resolve(here, "colour-only-composition.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(JSON.stringify(report.output));
console.log(JSON.stringify(report.preservation));
