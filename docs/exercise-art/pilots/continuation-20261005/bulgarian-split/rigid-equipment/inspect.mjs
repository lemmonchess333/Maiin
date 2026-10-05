import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = [
  {
    name: "setup",
    file: "setup.png",
    near: [560, 470, 190, 130],
    far: [335, 470, 135, 115],
  },
  {
    name: "shallow",
    file: "shallow.png",
    near: [558, 493, 190, 130],
    far: [330, 490, 135, 115],
  },
  {
    name: "deep",
    file: "deep-grip-repair.png",
    near: [567, 570, 190, 130],
    far: [312, 550, 135, 115],
  },
  {
    name: "bottom",
    file: "bottom.png",
    near: [565, 625, 200, 135],
    far: [282, 580, 135, 115],
  },
  {
    name: "bottom-secondary",
    file: "bottom-secondary-repair.png",
    near: [565, 625, 200, 135],
    far: [282, 580, 135, 115],
  },
  {
    name: "bottom-join",
    file: "bottom-join-repair.png",
    near: [565, 625, 200, 135],
    far: [282, 580, 135, 115],
  },
];
mkdirSync(resolve(here, "qa"), { recursive: true });
const pins = [];
for (const source of sources) {
  const path = resolve(here, "../sources", source.file);
  const bytes = readFileSync(path);
  const metadata = await sharp(bytes).metadata();
  pins.push({
    ...source,
    path: `../sources/${source.file}`,
    sha256: sha(bytes),
    width: metadata.width,
    height: metadata.height,
  });
  for (const name of ["near", "far"]) {
    const [left, top, width, height] = source[name];
    await sharp(bytes)
      .extract({ left, top, width, height })
      .resize(width * 3, height * 3, { kernel: "nearest" })
      .png()
      .toFile(resolve(here, "qa", `${source.name}-${name}-original.png`));
  }
}
writeFileSync(
  resolve(here, "source-inspection.json"),
  JSON.stringify(
    {
      releaseApproved: false,
      nativeCanvas: [1536, 1024],
      diagnosticDisplayScale: 3,
      sources: pins,
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify(
    pins.map(({ name, sha256 }) => ({ name, sha256 })),
    null,
    2
  )
);
