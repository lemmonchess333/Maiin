// A bounded draft, not an approval. Existing generated RGB supplies every layer.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024,
  count = width * height;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sources = [
  {
    name: "setup",
    path: "../sources/setup.png",
    sha256: "0ddf3560366a6d9790c051a2e514cdc6d0785229dfa3ee0476151209b8676702",
    shifts: { near: [0, 0], far: [0, 0] },
    hand: { near: [632, 480, 54, 81], far: [407, 478, 37, 73] },
  },
  {
    name: "shallow",
    path: "../sources/shallow.png",
    sha256: "a1bb1762a10f5d01af746f79d14b9b169a71e3205d83e3538e0dd1eff59785ec",
    shifts: { near: [-2, 23], far: [-1, 23] },
    hand: { near: [630, 503, 54, 81], far: [404, 498, 37, 74] },
  },
  {
    name: "deep",
    path: "../sources/deep-grip-repair.png",
    sha256: "5c084a014496a630b1c540f693bf58b3241854cf36f33863e6374651aaa37a3d",
    shifts: { near: [8, 100], far: [-20, 78] },
    hand: { near: [640, 582, 57, 81], far: [391, 558, 42, 74] },
  },
  {
    name: "bottom",
    path: "../composite/bottom.png",
    sha256: "be44d181e77addc57575ed6f516dff7371b97b00b655ebf678f28b50184913dc",
    shifts: { near: [14, 155], far: [-51, 108] },
    hand: { near: [643, 634, 58, 83], far: [360, 585, 43, 78] },
  },
];
const pins = [];
for (const source of sources) {
  const bytes = readFileSync(resolve(here, source.path));
  if (sha(bytes) !== source.sha256)
    throw new Error(`Source changed: ${source.path}`);
  const decoded = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== width ||
    decoded.info.height !== height ||
    decoded.info.channels !== 3
  )
    throw new Error("Wrong native canvas");
  pins.push({ ...source, data: decoded.data });
}
const master = pins[0].data;
function inBox(x, y, [left, top, w, h]) {
  return x >= left && x < left + w && y >= top && y < top + h;
}
function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
const regions = {
  near: [
    [
      [590, 498],
      [623, 498],
      [632, 506],
      [643, 522],
      [643, 550],
      [633, 569],
      [622, 576],
      [592, 576],
      [583, 568],
      [574, 552],
      [574, 521],
      [581, 508],
    ],
    [
      [683, 498],
      [721, 498],
      [734, 519],
      [735, 545],
      [728, 562],
      [715, 570],
      [699, 568],
      [685, 555],
      [680, 542],
      [681, 512],
    ],
    [
      [635, 521],
      [693, 521],
      [694, 542],
      [636, 542],
    ],
  ],
  far: [
    [
      [363, 491],
      [389, 491],
      [402, 494],
      [415, 513],
      [416, 542],
      [407, 557],
      [398, 564],
      [365, 564],
      [354, 551],
      [350, 537],
      [350, 511],
    ],
    [
      [436, 491],
      [465, 491],
      [471, 510],
      [457, 549],
      [430, 552],
      [429, 517],
    ],
    [
      [407, 513],
      [450, 513],
      [450, 539],
      [407, 539],
    ],
  ],
};
const template = {};
mkdirSync(resolve(here, "qa"), { recursive: true });
mkdirSync(resolve(here, "masks"), { recursive: true });
mkdirSync(resolve(here, "trials"), { recursive: true });
for (const name of ["near", "far"]) {
  const mask = new Uint8Array(count),
    rgba = Buffer.alloc(count * 4);
  for (let y = 480; y < 582; y++)
    for (let x = 340; x < 748; x++) {
      const p = y * width + x,
        i = p * 3,
        rgb = master.subarray(i, i + 3);
      const neutral = Math.max(...rgb) - Math.min(...rgb) < 40;
      if (
        regions[name].some((poly) => inPolygon(x + 0.5, y + 0.5, poly)) &&
        Math.max(...rgb) < 170 &&
        neutral
      ) {
        mask[p] = 255;
        for (let c = 0; c < 3; c++) rgba[p * 4 + c] = rgb[c];
        rgba[p * 4 + 3] = 255;
      }
    }
  template[name] = { mask, rgba };
  await sharp(mask, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(resolve(here, "masks", `master-${name}.png`));
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(resolve(here, `master-${name}-layer.png`));
}
const oldHeadRois = {
  setup: {
    near: [
      [574, 498, 70, 80],
      [679, 498, 59, 73],
    ],
    far: [
      [348, 490, 70, 76],
      [429, 489, 43, 63],
    ],
  },
  shallow: {
    near: [
      [571, 520, 74, 81],
      [676, 519, 61, 75],
    ],
    far: [
      [347, 512, 72, 77],
      [428, 512, 37, 57],
    ],
  },
  deep: {
    near: [
      [581, 597, 71, 81],
      [687, 595, 59, 77],
    ],
    far: [
      [328, 567, 70, 75],
      [411, 568, 36, 70],
    ],
  },
  bottom: {
    near: [
      [581, 652, 76, 83],
      [685, 651, 60, 80],
    ],
    far: [
      [298, 598, 68, 77],
      [378, 598, 40, 66],
    ],
  },
};
const results = [];
for (const source of pins) {
  const out = Buffer.from(source.data),
    edit = new Uint8Array(count),
    foreground = new Uint8Array(count),
    cleared = new Uint8Array(count),
    imported = new Uint8Array(count);
  if (source.name !== "setup")
    for (const name of ["near", "far"]) {
      const handBox = source.hand[name],
        [dx, dy] = source.shifts[name],
        layer = template[name];
      // Preserve original hands and their native fine contours. The far-side knee
      // remains foreground where it hides the unseen rear head and shaft.
      for (let y = handBox[1]; y < handBox[1] + handBox[3]; y++)
        for (let x = handBox[0]; x < handBox[0] + handBox[2]; x++) {
          const p = y * width + x,
            rgb = source.data.subarray(p * 3, p * 3 + 3);
          if (
            Math.min(...rgb) > 145 &&
            Math.max(...rgb) - Math.min(...rgb) < 45
          ) {
            for (let yy = y - 1; yy <= y + 1; yy++)
              for (let xx = x - 1; xx <= x + 1; xx++)
                foreground[yy * width + xx] = 255;
          }
        }
      if (name === "far")
        for (let y = 480 + dy; y < 582 + dy; y++)
          for (let x = 416 + dx; x < 478 + dx; x++) {
            const p = y * width + x,
              rgb = source.data.subarray(p * 3, p * 3 + 3);
            if (Math.min(...rgb) > 120 || rgb[2] - rgb[0] > 25)
              foreground[p] = 255;
          }
      // This first trial deliberately leaves cleared holes black. If they expose
      // occluded anatomy, an image-generated local repair is required; the script
      // does not fabricate it by extending neighboring body pixels.
      for (const box of oldHeadRois[source.name][name])
        for (let y = box[1]; y < box[1] + box[3]; y++)
          for (let x = box[0]; x < box[0] + box[2]; x++) {
            const p = y * width + x,
              i = p * 3,
              rgb = source.data.subarray(i, i + 3);
            if (
              !foreground[p] &&
              Math.max(...rgb) < 150 &&
              Math.max(...rgb) - Math.min(...rgb) < 40
            ) {
              out[i] = out[i + 1] = out[i + 2] = 0;
              edit[p] = cleared[p] = 255;
            }
          }
      for (let y = 480; y < 582; y++)
        for (let x = 340; x < 748; x++) {
          const p = y * width + x;
          if (!layer.mask[p]) continue;
          const target = (y + dy) * width + x + dx;
          if (foreground[target]) continue;
          for (let c = 0; c < 3; c++) out[target * 3 + c] = master[p * 3 + c];
          edit[target] = imported[target] = 255;
        }
    }
  let outsideChanged = 0,
    protectedChanged = 0,
    editedPixels = 0;
  for (let p = 0; p < count; p++) {
    if (edit[p]) editedPixels++;
    for (let c = 0; c < 3; c++) {
      if (!edit[p] && out[p * 3 + c] !== source.data[p * 3 + c])
        outsideChanged++;
      if (foreground[p] && out[p * 3 + c] !== source.data[p * 3 + c])
        protectedChanged++;
    }
  }
  if (outsideChanged || protectedChanged)
    throw new Error("Pixel preservation failed");
  const bytes =
    source.name === "setup"
      ? readFileSync(resolve(here, source.path))
      : await sharp(out, { raw: { width, height, channels: 3 } })
          .png()
          .toBuffer();
  writeFileSync(resolve(here, "trials", `${source.name}.png`), bytes);
  for (const [name, mask] of Object.entries({
    edit,
    foreground,
    cleared,
    imported,
  }))
    await sharp(mask, { raw: { width, height, channels: 1 } })
      .png()
      .toFile(resolve(here, "masks", `${source.name}-${name}.png`));
  const crop =
    source.name === "setup"
      ? [550, 470, 205, 135]
      : source.name === "shallow"
        ? [548, 493, 205, 135]
        : source.name === "deep"
          ? [555, 570, 210, 135]
          : [565, 625, 205, 140];
  const [left, top, w, h] = crop;
  const panels = await Promise.all(
    [source.data, out].map((data) =>
      sharp(data, { raw: { width, height, channels: 3 } })
        .extract({ left, top, width: w, height: h })
        .resize(w * 3, h * 3, { kernel: "nearest" })
        .png()
        .toBuffer()
    )
  );
  await sharp({
    create: { width: w * 6, height: h * 3, channels: 3, background: "black" },
  })
    .composite(panels.map((input, i) => ({ input, left: i * w * 3, top: 0 })))
    .png()
    .toFile(resolve(here, "qa", `${source.name}-near-trial.png`));
  results.push({
    name: source.name,
    input: { path: source.path, sha256: source.sha256 },
    shifts: source.shifts,
    output: { path: `trials/${source.name}.png`, sha256: sha(bytes) },
    editedPixels,
    outsideChanged,
    protectedChanged,
    releaseApproved: false,
  });
}
writeFileSync(
  resolve(here, "composition-trial.json"),
  JSON.stringify(
    {
      releaseApproved: false,
      status: "first-rigid-layer-trial-awaiting-boundary-review",
      method:
        "Fixed master equipment pixels, integer translations only. Original generated hand and far-knee foreground masks are preserved. No global scaling or camera change. Any exposed black anatomy holes require a separate localized generated repair.",
      nativeCanvas: [width, height],
      sourcePolygons: regions,
      oldHeadRois,
      results,
      limitations: [
        "Visible master equipment is sufficient to preserve its observed faces, not recover hidden shaft or rear-head anatomy.",
        "Black clearing can expose previously occluded anatomy. This trial must not be promoted on dimension diagnostics alone.",
        "Source antialiasing was baked against master background; native contour review must check halos at new background boundaries.",
      ],
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify(
    results.map(({ name, output, outsideChanged, protectedChanged }) => ({
      name,
      output,
      outsideChanged,
      protectedChanged,
    })),
    null,
    2
  )
);
