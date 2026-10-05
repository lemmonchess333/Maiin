import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const composition = JSON.parse(
  readFileSync(resolve(here, "composition-trial.json"))
);
const masterBytes = readFileSync(resolve(here, "../sources/setup.png"));
if (
  sha(masterBytes) !==
  "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702"
)
  throw Error("Master changed");
const master = await sharp(masterBytes).removeAlpha().raw().toBuffer();
const patches = [
  {
    name: "near-front-face",
    layer: "near",
    x: 585,
    y: 527,
    width: 18,
    height: 22,
  },
  {
    name: "near-rear-face",
    layer: "near",
    x: 704,
    y: 521,
    width: 20,
    height: 24,
  },
  {
    name: "far-front-face",
    layer: "far",
    x: 356,
    y: 515,
    width: 17,
    height: 25,
  },
];
const measurements = [];
for (const frame of composition.results) {
  const bytes = readFileSync(resolve(here, frame.output.path));
  if (sha(bytes) !== frame.output.sha256)
    throw Error(`Output changed: ${frame.name}`);
  const raw = await sharp(bytes).removeAlpha().raw().toBuffer();
  for (const patch of patches) {
    const [dx, dy] = frame.shifts[patch.layer];
    let changedChannels = 0,
      maxChannelDifference = 0;
    for (let y = 0; y < patch.height; y++)
      for (let x = 0; x < patch.width; x++)
        for (let c = 0; c < 3; c++) {
          const ref = ((patch.y + y) * width + patch.x + x) * 3 + c;
          const dst = ((patch.y + dy + y) * width + patch.x + dx + x) * 3 + c;
          const difference = Math.abs(master[ref] - raw[dst]);
          if (difference) changedChannels++;
          maxChannelDifference = Math.max(maxChannelDifference, difference);
        }
    measurements.push({
      pose: frame.name,
      patch: patch.name,
      referenceBox: [patch.x, patch.y, patch.width, patch.height],
      translatedBox: [patch.x + dx, patch.y + dy, patch.width, patch.height],
      changedChannels,
      maxChannelDifference,
    });
  }
}
const supportMask = await sharp(
  resolve(here, "../composite/protected-support-mask.png")
)
  .raw()
  .toBuffer({ resolveWithObject: true });
const bottomFrame = composition.results.find(
  (frame) => frame.name === "bottom"
);
const supportInputBytes = readFileSync(resolve(here, bottomFrame.input.path));
if (sha(supportInputBytes) !== bottomFrame.input.sha256)
  throw Error("Contact base changed since the rigid candidate was built");
const supportInput = await sharp(supportInputBytes)
  .removeAlpha()
  .raw()
  .toBuffer();
const supportOutput = await sharp(resolve(here, "trials/bottom.png"))
  .removeAlpha()
  .raw()
  .toBuffer();
let supportPixels = 0,
  supportChangedChannels = 0;
for (let p = 0; p < width * height; p++) {
  if (!supportMask.data[p * supportMask.info.channels]) continue;
  supportPixels++;
  for (let c = 0; c < 3; c++)
    if (supportInput[p * 3 + c] !== supportOutput[p * 3 + c])
      supportChangedChannels++;
}
const report = {
  releaseApproved: false,
  selected: false,
  status: "interior-checks-only-rigid-contours-rejected",
  method:
    "Exact integer-translated RGB comparisons of three visible equipment interiors. These checks establish shared observed texture and absence of scaling inside the declared patches. They do not certify the outer visible extent, the hidden rear head, or grip anatomy.",
  sourceMaster: { path: "../sources/setup.png", sha256: sha(masterBytes) },
  nativeCanvas: [width, height],
  measurements,
  fixedSupportPreservation: {
    pixels: supportPixels,
    changedChannels: supportChangedChannels,
  },
  geometry: {
    perFrameScaling: false,
    perFrameRotation: false,
    transforms: composition.results.map(({ name, shifts }) => ({
      pose: name,
      integerTranslations: shifts,
    })),
    outerBoundaryUncertaintyPixelsPerEdge: 1,
  },
  limitations: [
    "The initial original-image scanline chords in ../equipment-review/report.json were 67/69/67/73px horizontally. They were image-space chords, not calibrated physical widths.",
    "A one-pixel uncertainty at each outer boundary is already greater than 1% for these approximately 67px objects. Visual chord measurements alone cannot certify a 1% gate.",
    "Shared translated source layers support exact geometric invariance of those layers, but any uncleared old rim outside the mask would still enlarge the displayed object. Native contour review is required.",
    "Original hands and knee remain foreground. Fully hidden shaft/head geometry is not directly observed or assigned a measured width.",
    "Both attempted localized generated repairs changed pose/scale. The rigid variants are rejected, and the selected bottom-contact-colour.png keeps the original equipment and its measured variation.",
  ],
};
writeFileSync(
  resolve(here, "rigidity-trial.json"),
  JSON.stringify(report, null, 2) + "\n"
);
console.log(
  JSON.stringify(
    {
      patches: measurements.length,
      failedPatches: measurements.filter((m) => m.changedChannels).length,
      supportPixels,
      supportChangedChannels,
      releaseApproved: false,
    },
    null,
    2
  )
);
