throw new Error("Rejected historical trial; do not overwrite reviewed assets.");
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = "docs/exercise-art/pilots/shrugs-rigid-20261003";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const sources = JSON.parse(readFileSync(`${root}/sources.json`));
const buffers = await Promise.all(
  sources.map(async (s) => {
    const b = readFileSync(s.path);
    if (sha(b) !== s.sha256) throw Error("Source changed");
    return sharp(b).removeAlpha().raw().toBuffer();
  })
);
const layers = [
  {
    name: "screenLeftGripAndDumbbell",
    box: [230, 665, 385, 840],
    polygon: [
      [311, 674],
      [350, 674],
      [349, 702],
      [353, 715],
      [372, 714],
      [369, 754],
      [361, 799],
      [345, 807],
      [324, 807],
      [313, 815],
      [272, 816],
      [252, 800],
      [241, 779],
      [242, 745],
      [260, 720],
      [282, 718],
      [305, 718],
      [307, 699],
    ],
    shifts: [
      [0, 0],
      [2, -46],
      [5, -88],
    ],
  },
  {
    name: "screenRightGripAndDumbbell",
    box: [543, 680, 775, 846],
    polygon: [
      [643, 681],
      [694, 681],
      [693, 715],
      [710, 723],
      [738, 722],
      [756, 739],
      [762, 756],
      [762, 793],
      [748, 818],
      [734, 822],
      [705, 822],
      [692, 810],
      [675, 819],
      [650, 820],
      [640, 811],
      [626, 830],
      [589, 833],
      [574, 820],
      [556, 795],
      [556, 765],
      [573, 741],
      [587, 732],
      [623, 732],
      [637, 742],
      [641, 716],
    ],
    shifts: [
      [0, 0],
      [0, -41],
      [-2, -86],
    ],
  },
];
const inside = (x, y, points) => {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      yes = !yes;
  }
  return yes;
};
for (const layer of layers) {
  const svg = `<svg width="1024" height="1536"><polygon points="${layer.polygon.map((p) => p.join(",")).join(" ")}" fill="white" stroke="white" stroke-width="6"/></svg>`;
  layer.mask = await sharp(Buffer.from(svg))
    .blur(1)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer();
}
const poses = [];
for (let pose = 0; pose < 3; pose++) {
  const out = Buffer.from(buffers[pose]);
  // Use the most revealed far rear plate as a rigid source; the thigh
  // and fingers in each target remain in front wherever they occlude it.
  for (let y = 628; y < 723; y++)
    for (let x = 347; x < 395; x++) {
      if (
        !inside(x, y, [
          [360, 629],
          [393, 629],
          [383, 674],
          [372, 718],
          [350, 718],
          [347, 700],
          [350, 667],
        ])
      )
        continue;
      const dx = [-5, -3, 0][pose],
        dy = [88, 42, 0][pose];
      const i = (y * 1024 + x) * 3,
        j = ((y + dy) * 1024 + x + dx) * 3;
      const src = [buffers[2][i], buffers[2][i + 1], buffers[2][i + 2]];
      const dst = [out[j], out[j + 1], out[j + 2]];
      if (
        Math.min(...src) > 25 &&
        Math.max(...src) < 175 &&
        Math.max(...src) - Math.min(...src) < 30 &&
        Math.max(...dst) < 175
      )
        for (let c = 0; c < 3; c++) out[j + c] = src[c];
    }
  if (pose)
    for (const layer of layers) {
      const [l, t, r, b] = layer.box,
        [dx, dy] = layer.shifts[pose];
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          let top = Math.max(0, Math.min(1, (y - t) / 45));
          let a = (layer.mask[y * 1024 + x] / 255) * top * top * (3 - 2 * top);
          // Exclude setup thigh pixels beyond the far grip. They must not move.
          if (
            layer.name === "screenLeftGripAndDumbbell" &&
            x > 354 &&
            y > 700
          ) {
            a = 0;
          }
          if (layer.name === "screenRightGripAndDumbbell" && x < 643) {
            const v = (y * 1024 + x) * 3;
            if (
              Math.min(buffers[0][v], buffers[0][v + 1], buffers[0][v + 2]) >
              175
            )
              a = 0;
          }
          for (let c = 0; c < 3; c++) {
            const i = (y * 1024 + x) * 3 + c,
              j = ((y + dy) * 1024 + x + dx) * 3 + c;
            out[j] = Math.round(out[j] * (1 - a) + buffers[0][i] * a);
          }
        }
    }
  if (!out.subarray(860 * 1024 * 3).equals(buffers[0].subarray(860 * 1024 * 3)))
    throw Error("Fixed legs changed");
  poses.push(
    await sharp(out, { raw: { width: 1024, height: 1536, channels: 3 } })
      .png()
      .toBuffer()
  );
}
const frames = [1, 2, 3, 3, 2, 1].map((pose, i) => {
  const path = `${root}/frames/${i + 1}.png`;
  writeFileSync(path, poses[pose - 1]);
  return {
    path,
    pose,
    sha256: sha(poses[pose - 1]),
    source: sources[pose - 1],
  };
});
writeFileSync(
  `${root}/composition.json`,
  JSON.stringify(
    {
      releaseApproved: false,
      method:
        "Trial rigid RGB translation of setup dumbbell-and-grip patches; contour masks and feathered wrist joins, no scaling or rotation. Fixed lower legs remain exact.",
      layers: layers.map(({ mask, ...layer }) => layer),
      frames,
    },
    null,
    2
  ) + "\n"
);
console.log("Wrote trial; visual review required.");
