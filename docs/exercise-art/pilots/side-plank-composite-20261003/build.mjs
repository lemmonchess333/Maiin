// Authorized local contact-layer trial. Outputs remain drafts outside public/.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const root = "docs/exercise-art/pilots/side-plank-composite-20261003";
const parent = "docs/exercise-art/pilots/continuation-20261002/side-plank";
const sources = [
  ["1.png", "def24ed878af8075ead35553ee8b1142ff4f2c973058e150477a6d5c0d1f2786"],
  [
    "raised-contact-drift.png",
    "89d0866e0f165831b539839a8c0d7e45b9dc8a77533d916cc4d23a38465d1bc3",
  ],
];
const hash = (data) => createHash("sha256").update(data).digest("hex");
const pixels = [];
for (const [name, expected] of sources) {
  const bytes = readFileSync(`${parent}/${name}`);
  if (hash(bytes) !== expected) throw new Error(`Source changed: ${name}`);
  const { data, info } = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== 1536 || info.height !== 1024 || info.channels !== 3)
    throw new Error("Unexpected source format");
  pixels.push(data);
}
const [setup, raised] = pixels;
const output = Buffer.from(raised);
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
for (let y = 0; y < 1024; y++)
  for (let x = 0; x < 1536; x++) {
    // Transplant fixed forearm/fist and stacked shoes; narrow joining regions
    // are explicitly unapproved until inspected for doubled contours/anatomy.
    const arm = x < 400 ? smooth((y - 685) / 40) : 0;
    const feet = smooth((x - 1200) / 100);
    const weight = Math.max(arm, feet);
    for (let c = 0; c < 3; c++) {
      const i = (y * 1536 + x) * 3 + c;
      output[i] = Math.round(setup[i] * weight + raised[i] * (1 - weight));
    }
  }
const path = `${root}/raised-contact-trial.png`;
await sharp(output, { raw: { width: 1536, height: 1024, channels: 3 } })
  .png()
  .toFile(path);
const regions = {
  forearmAndFist: [80, 700, 380, 850],
  lowerShoe: [1270, 735, 1495, 870],
};
function contacts(data) {
  return Object.fromEntries(
    Object.entries(regions).map(([name, [l, t, r, b]]) => {
      let last = null;
      for (let y = t; y <= b; y++) {
        let count = 0;
        for (let x = l; x <= r; x++) {
          const i = (y * 1536 + x) * 3;
          if (Math.max(data[i], data[i + 1], data[i + 2]) > 60) count++;
        }
        if (count >= 5) last = y;
      }
      return [name, last];
    })
  );
}
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(
    {
      method:
        "Setup contact-layer transplant with smooth joining bands. Last row containing >=5 pixels above RGB 60; contact rows alone do not establish anatomy or technique.",
      sources: sources.map(([name, sha256]) => ({
        path: `${parent}/${name}`,
        sha256,
      })),
      output: { path, sha256: hash(readFileSync(path)) },
      regions,
      setup: contacts(setup),
      originalRaised: contacts(raised),
      repairedRaised: contacts(output),
      releaseApproved: false,
    },
    null,
    2
  ) + "\n"
);

// Second trial: translate the raised pose's contact layers and resample their
// joins, avoiding a crossfade between two incompatible silhouettes.
const translated = Buffer.alloc(raised.length);
function sample(x, y, c) {
  const sx = Math.max(0, Math.min(1535, x)),
    sy = Math.max(0, Math.min(1023, y));
  const x0 = Math.floor(sx),
    y0 = Math.floor(sy),
    x1 = Math.min(1535, x0 + 1),
    y1 = Math.min(1023, y0 + 1);
  const tx = sx - x0,
    ty = sy - y0;
  return Math.round(
    (raised[(y0 * 1536 + x0) * 3 + c] * (1 - tx) +
      raised[(y0 * 1536 + x1) * 3 + c] * tx) *
      (1 - ty) +
      (raised[(y1 * 1536 + x0) * 3 + c] * (1 - tx) +
        raised[(y1 * 1536 + x1) * 3 + c] * tx) *
        ty
  );
}
for (let y = 0; y < 1024; y++)
  for (let x = 0; x < 1536; x++) {
    const arm = smooth((y - 620) / 90) * (1 - smooth((x - 375) / 40));
    const feet = smooth((x - 1100) / 190);
    const dx = -4 * arm,
      dy = 4 * arm + 12 * feet;
    for (let c = 0; c < 3; c++)
      translated[(y * 1536 + x) * 3 + c] = sample(x - dx, y - dy, c);
  }
const translatedPath = `${root}/raised-translated-contacts.png`;
await sharp(translated, { raw: { width: 1536, height: 1024, channels: 3 } })
  .png()
  .toFile(translatedPath);
const registration = JSON.parse(readFileSync(`${root}/registration.json`));
registration.translatedTrial = {
  path: translatedPath,
  sha256: hash(readFileSync(translatedPath)),
  contacts: contacts(translated),
  method:
    "Raised forearm layer translated (-4,+4)px; shoe layers translated (0,+12)px. Smooth spatial joins at y620..710 / x1100..1290, bilinear RGB sampling. No silhouette crossfade. These corrections only address measured contact position; identity and dimension review remains required.",
};
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(registration, null, 2) + "\n"
);
const extentRegions = {
  fist: [250, 725, 390, 815],
  lowerShoe: [1290, 748, 1495, 840],
};
function extents(data) {
  return Object.fromEntries(
    Object.entries(extentRegions).map(([name, [l, t, r, b]]) => {
      let bounds = [9999, 9999, -1, -1];
      for (let y = t; y <= b; y++)
        for (let x = l; x <= r; x++) {
          const i = (y * 1536 + x) * 3;
          if (Math.max(data[i], data[i + 1], data[i + 2]) > 60)
            bounds = [
              Math.min(bounds[0], x),
              Math.min(bounds[1], y),
              Math.max(bounds[2], x),
              Math.max(bounds[3], y),
            ];
        }
      return [name, bounds];
    })
  );
}
registration.extentCheck = {
  method:
    "Foreground bounds above RGB60 in clipped ROIs; not whole-limb dimensions. Fist right edge still moves 6px after vertical correction.",
  regions: extentRegions,
  setup: extents(setup),
  translated: extents(translated),
};
writeFileSync(
  `${root}/registration.json`,
  JSON.stringify(registration, null, 2) + "\n"
);
