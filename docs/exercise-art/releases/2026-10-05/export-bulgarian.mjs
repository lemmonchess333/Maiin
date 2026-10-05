/**
 * Reproduce the reviewed Bulgarian split-squat delivery without resizing.
 * Both destinations are explicit so candidates can stay outside public/.
 *
 * node docs/exercise-art/releases/2026-10-05/export-bulgarian.mjs <output-directory> <report-file>
 *
 * Export integrity is separate from visual approval.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const [outputArgument, reportArgument] = process.argv.slice(2);
if (!outputArgument || !reportArgument) {
  throw new Error("Provide an output directory and a report path explicitly.");
}
const output = resolve(outputArgument);
const reportPath = resolve(reportArgument);
const draft = "docs/exercise-art/pilots/continuation-20261005";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = {
  setup: "f93fc4136da95f40799f4da0fb1386fc8cb3e943a8467fdcd46d904038d87057",
  shallow: "4646fb08e1d96df0d3d03d2642c63d78861f1d707edd5a33f07b38662a1194b3",
  deep: "d3551326c4964abacea0978e604d2cf7d856aaa1bd25bdd5b99d95a20233002b",
  bottom: "9a3da727c7801234407a1d97811e5603edfbf9ca43b96d6b6534d37ea5b7c954",
};
const poses = ["setup", "shallow", "deep", "bottom", "deep", "shallow"];
const manifestBytes = await readFile(resolve(root, draft, "MANIFEST.json"));
const manifest = JSON.parse(manifestBytes);
const set = manifest.completeDraftSets.find(
  (item) => item.exerciseId === "bulgarian-split"
);
assert.equal(set?.frames.length, 6);

// Validate every selected source before writing any delivery file.
const sources = [];
for (const [index, pose] of poses.entries()) {
  const path = `${draft}/bulgarian-split/frames/${index + 1}.png`;
  const bytes = await readFile(resolve(root, path));
  assert.equal(sha256(bytes), expected[pose], `Frame ${index + 1} changed`);
  assert.equal(set.frames[index].path, path);
  assert.equal(set.frames[index].sha256, expected[pose]);
  const rgba = await sharp(bytes).ensureAlpha().raw().toBuffer();
  for (let pixel = 3; pixel < rgba.length; pixel += 4) {
    assert.equal(rgba[pixel], 255, "Delivery expects an opaque native canvas");
  }
  const decoded = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(
    [decoded.info.width, decoded.info.height, decoded.info.channels],
    [1536, 1024, 3]
  );
  sources.push({ path, pose, bytes, decoded: decoded.data });
}

const deliveries = [];
for (const [index, source] of sources.entries()) {
  const bytes = await sharp(source.bytes)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const decoded = await sharp(bytes)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(
    [decoded.info.width, decoded.info.height, decoded.info.channels],
    [1536, 1024, 3]
  );
  assert.ok(
    decoded.data.equals(source.decoded),
    `Frame ${index + 1} RGB changed`
  );
  deliveries.push({ index: index + 1, source, bytes });
}
assert.ok(deliveries[2].bytes.equals(deliveries[4].bytes));
assert.ok(deliveries[1].bytes.equals(deliveries[5].bytes));
assert.ok(!deliveries[0].bytes.equals(deliveries[5].bytes));

await mkdir(output, { recursive: true });
for (const delivery of deliveries) {
  await writeFile(resolve(output, `${delivery.index}.webp`), delivery.bytes);
}
const report = {
  exerciseId: "bulgarian-split",
  method: "Sharp lossless WebP, effort 6; native canvas, no crop or resize",
  visualApproval: false,
  note: "This report proves export integrity; visual and player approval are recorded separately.",
  dimensions: [1536, 1024],
  sourceManifest: {
    path: `${draft}/MANIFEST.json`,
    sha256: sha256(manifestBytes),
  },
  totalBytes: deliveries.reduce(
    (total, frame) => total + frame.bytes.length,
    0
  ),
  frames: deliveries.map(({ index, source, bytes }) => ({
    index,
    pose: source.pose,
    path: relative(root, resolve(output, `${index}.webp`)),
    sha256: sha256(bytes),
    bytes: bytes.length,
    dimensions: [1536, 1024],
    source: { path: source.path, sha256: sha256(source.bytes) },
    decodedRgbChangedChannels: 0,
  })),
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    frames: 6,
    totalBytes: report.totalBytes,
    output,
    reportPath,
  })
);
