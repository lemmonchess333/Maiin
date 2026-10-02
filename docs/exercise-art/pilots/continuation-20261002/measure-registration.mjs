// Read-only pixel measurements: this script does not modify any source image.
// Run from the repository root with node. Results are not visual approval.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const root = "docs/exercise-art/pilots/continuation-20261002";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function pixels(path) {
  const source = readFileSync(path);
  const { data, info } = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    path,
    sha256: hash(source),
    data,
    width: info.width,
    height: info.height,
  };
}

const leg = await Promise.all(
  [1, 2, 3].map((n) => pixels(`${root}/leg-raise/${n}.png`))
);
const patches = {
  screenLeftGrip: { x: 513, y: 63 },
  screenRightGrip: { x: 724, y: 45 },
  screenLeftBarJoint: { x: 75, y: 94 },
  screenRightBarJoint: { x: 942, y: 35 },
};
const frames = leg.map((image, index) => {
  const anchors = {};
  for (const [name, point] of Object.entries(patches)) {
    let best = { error: Infinity, dx: 0, dy: 0 };
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        let error = 0;
        for (let y = point.y - 15; y <= point.y + 15; y++) {
          for (let x = point.x - 15; x <= point.x + 15; x++) {
            for (let c = 0; c < 3; c++) {
              error += Math.abs(
                leg[0].data[(y * image.width + x) * 3 + c] -
                  image.data[((y + dy) * image.width + x + dx) * 3 + c]
              );
            }
          }
        }
        if (error < best.error) best = { error, dx, dy };
      }
    }
    anchors[name] = {
      x: point.x + best.dx,
      y: point.y + best.dy,
      meanChannelDifference: best.error / (31 * 31 * 3),
    };
  }
  return { frame: index + 1, path: image.path, sha256: image.sha256, anchors };
});
writeFileSync(
  `${root}/leg-raise/registration.json`,
  JSON.stringify(
    {
      method:
        "31x31 RGB master patches; integer translation search +/-5px minimizing absolute difference. No image edits. Zero best-fit translation does not establish identical pixels or anatomical dimensions.",
      selectedPoseOrder: [1, 2, 3, 3, 2, 1],
      frames,
    },
    null,
    2
  ) + "\n"
);

const side = await Promise.all(
  ["1.png", "raised-contact-drift.png", "rejected-contact-repair.png"].map(
    (name) => pixels(`${root}/side-plank/${name}`)
  )
);
function lastBrightRow(image, [left, top, right, bottom]) {
  let result = null;
  for (let y = top; y <= bottom; y++) {
    let brightPixels = 0;
    for (let x = left; x <= right; x++) {
      const offset = (y * image.width + x) * 3;
      if (Math.max(...image.data.subarray(offset, offset + 3)) > 60)
        brightPixels++;
    }
    // Suppress isolated highlights; require at least five foreground pixels.
    if (brightPixels >= 5) result = y;
  }
  return result;
}
const regions = {
  forearmAndFist: [80, 700, 380, 850],
  lowerShoe: [1270, 735, 1495, 870],
};
const contacts = side.map((image) => ({
  path: image.path,
  sha256: image.sha256,
  contacts: Object.fromEntries(
    Object.entries(regions).map(([name, region]) => [
      name,
      lastBrightRow(image, region),
    ])
  ),
}));
writeFileSync(
  `${root}/side-plank/registration.json`,
  JSON.stringify(
    {
      method:
        "Last row with at least five RGB pixels above 60 in named fixed contact regions. This detects vertical support drift, not anatomy or technique. No source image changes.",
      regions,
      contacts,
      releaseApproved: false,
    },
    null,
    2
  ) + "\n"
);
console.log(
  JSON.stringify({ hangingLegRaise: frames, sidePlank: contacts }, null, 2)
);
