// Freeze reviewable poses after bounded generated tint/boundary imports.
// This compositor never grants release approval.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const width = 1536,
  height = 1024,
  count = width * height;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const smooth = (v) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
const inside = (x, y, [l, t, w, h]) =>
  x >= l && x < l + w && y >= t && y < t + h;
const composition = JSON.parse(
  readFileSync(resolve(here, "composition-trial.json"))
);
const tintPin = {
  path: "../sources/bottom-secondary-repair.png",
  sha256: "5d95ba9a1ed62bc535ae14472eb42a964cf621c4713d713371c0b647f2f48ad1",
};
const bottomRawPin = {
  path: "../sources/bottom.png",
  sha256: "e2a7a41b2c30e2214ce3e7ab5164b5f02daa59d0494746efe66a4c06152653bb",
};
async function readPin(pin) {
  const bytes = readFileSync(resolve(here, pin.path));
  if (sha(bytes) !== pin.sha256)
    throw Error(`Pinned source changed: ${pin.path}`);
  const decoded = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.width !== width ||
    decoded.info.height !== height ||
    decoded.info.channels !== 3
  )
    throw Error(`Wrong native canvas: ${pin.path}`);
  return decoded.data;
}
async function mask(path) {
  const { data, info } = await sharp(resolve(here, path))
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Uint8Array.from({ length: count }, (_, p) => data[p * info.channels]);
}
const [tint, rawBottom] = await Promise.all([
  readPin(tintPin),
  readPin(bottomRawPin),
]);
const [gearProtection, handProtection, supportProtection] = await Promise.all([
  mask("masks/bottom-imported.png"),
  mask("masks/bottom-foreground.png"),
  mask("../composite/protected-support-mask.png"),
]);
const tintMask = new Uint8Array(count),
  bridgeMask = new Uint8Array(count);
const tintBox = [444, 622, 138, 42];
// Only the generated light-lilac pixels inside previously visible neutral
// hamstring anatomy are imported. A two-pixel dark-boundary guard keeps the
// original muscle silhouette, knee gap and foreground quadriceps untouched.
for (let y = tintBox[1]; y < tintBox[1] + tintBox[3]; y++)
  for (let x = tintBox[0]; x < tintBox[0] + tintBox[2]; x++) {
    const p = y * width + x,
      i = p * 3,
      o = rawBottom.subarray(i, i + 3),
      n = tint.subarray(i, i + 3);
    const lilac =
      n[2] - n[1] > 8 &&
      n[0] - n[1] > 2 &&
      n[0] > 130 &&
      n[1] > 110 &&
      n[2] - n[0] < 80;
    const neutral =
      Math.max(...o) - Math.min(...o) < 40 && Math.min(...o) > 120;
    if (!lilac || !neutral) continue;
    let interior = true;
    for (let yy = y - 2; yy <= y + 2; yy++)
      for (let xx = x - 2; xx <= x + 2; xx++)
        if (
          Math.min(
            ...rawBottom.subarray(
              (yy * width + xx) * 3,
              (yy * width + xx) * 3 + 3
            )
          ) < 100
        )
          interior = false;
    if (!interior) continue;
    const fade = Math.min(
      smooth((x - tintBox[0]) / 6),
      smooth((tintBox[0] + tintBox[2] - 1 - x) / 6),
      smooth((y - tintBox[1]) / 4),
      smooth((tintBox[1] + tintBox[3] - 1 - y) / 4)
    );
    tintMask[p] = Math.round(255 * fade);
  }
let bridgePin = null,
  bridge = null;
const bridgeConfigPath = resolve(here, "bridge-input.json");
if (existsSync(bridgeConfigPath)) {
  bridgePin = JSON.parse(readFileSync(bridgeConfigPath));
  bridge = await readPin(bridgePin);
  if (
    bridgePin.referenceTargetSha256 !==
    "ee9bbd06a29d6c39298855f8350ea80d4b80cf7c1c253463b691424b00f51bdf"
  )
    throw Error("Wrong boundary edit target");
  for (const box of bridgePin.importRegions)
    for (let y = box[1]; y < box[1] + box[3]; y++)
      for (let x = box[0]; x < box[0] + box[2]; x++) {
        const p = y * width + x;
        if (gearProtection[p] || handProtection[p] || supportProtection[p])
          continue;
        const fade = Math.min(
          smooth((x - box[0]) / 3),
          smooth((box[0] + box[2] - 1 - x) / 3),
          smooth((y - box[1]) / 3),
          smooth((box[1] + box[3] - 1 - y) / 3)
        );
        bridgeMask[p] = Math.max(bridgeMask[p], Math.round(255 * fade));
      }
}
mkdirSync(resolve(here, "poses"), { recursive: true });
const results = [];
for (const pose of composition.results) {
  const bytes = readFileSync(resolve(here, pose.output.path));
  if (sha(bytes) !== pose.output.sha256)
    throw Error(`Trial changed: ${pose.name}`);
  let outputBytes = bytes,
    stats = {
      tintPixels: 0,
      bridgePixels: 0,
      outsideAllowedChannelDifferences: 0,
      protectedGearChannelDifferences: 0,
      protectedHandChannelDifferences: 0,
      protectedSupportChannelDifferences: 0,
    };
  if (pose.name === "bottom") {
    const input = await sharp(bytes).removeAlpha().raw().toBuffer(),
      out = Buffer.from(input);
    for (let p = 0; p < count; p++) {
      if (tintMask[p]) stats.tintPixels++;
      if (bridgeMask[p]) stats.bridgePixels++;
      for (let c = 0; c < 3; c++) {
        const i = p * 3 + c;
        if (tintMask[p])
          out[i] = Math.round(
            input[i] * (1 - tintMask[p] / 255) + (tint[i] * tintMask[p]) / 255
          );
        if (bridgeMask[p])
          out[i] = Math.round(
            out[i] * (1 - bridgeMask[p] / 255) +
              (bridge[i] * bridgeMask[p]) / 255
          );
        if (!tintMask[p] && !bridgeMask[p] && out[i] !== input[i])
          stats.outsideAllowedChannelDifferences++;
        if (gearProtection[p] && out[i] !== input[i])
          stats.protectedGearChannelDifferences++;
        if (handProtection[p] && out[i] !== input[i])
          stats.protectedHandChannelDifferences++;
        if (supportProtection[p] && out[i] !== input[i])
          stats.protectedSupportChannelDifferences++;
      }
    }
    if (
      Object.entries(stats).some(
        ([key, value]) => key.endsWith("Differences") && value
      )
    )
      throw Error("Local import changed protected pixels");
    outputBytes = await sharp(out, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    await sharp(out, { raw: { width, height, channels: 3 } })
      .extract({ left: 420, top: 603, width: 180, height: 78 })
      .resize(720, 312, { kernel: "nearest" })
      .png()
      .toFile(resolve(here, "qa/hamstring-colour-import.png"));
  }
  const path = `poses/${pose.name}.png`;
  writeFileSync(resolve(here, path), outputBytes);
  results.push({
    name: pose.name,
    source: pose.output,
    output: { path, sha256: sha(outputBytes) },
    ...stats,
  });
}
await sharp(tintMask, { raw: { width, height, channels: 1 } })
  .png()
  .toFile(resolve(here, "masks/bottom-tint-import.png"));
await sharp(bridgeMask, { raw: { width, height, channels: 1 } })
  .png()
  .toFile(resolve(here, "masks/bottom-bridge-import.png"));
writeFileSync(
  resolve(here, "final-composition.json"),
  JSON.stringify(
    {
      releaseApproved: false,
      selected: false,
      status: "rejected-rigid-contours-not-selected",
      selectionDecision:
        "Root selected bottom-contact-colour.png with original equipment because the rigid alternatives introduce unacceptable outer contours. No generated bridge pixels are used.",
      nativeCanvas: [width, height],
      tint: {
        source: tintPin,
        parent: bottomRawPin,
        region: tintBox,
        mask: "masks/bottom-tint-import.png",
        method:
          "Native generated lilac RGB inside already-visible neutral hamstring anatomy, two-pixel dark-boundary guard, 4–6px outer feather. No anatomy is created with code.",
      },
      bridge: bridgePin,
      protect: {
        gear: "masks/bottom-imported.png",
        hands: "masks/bottom-foreground.png",
        supports: "../composite/protected-support-mask.png",
      },
      results,
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify(
    results.map(({ name, output, ...rest }) => ({ name, output, ...rest })),
    null,
    2
  )
);
