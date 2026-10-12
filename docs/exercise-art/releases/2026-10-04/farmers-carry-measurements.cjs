const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
const files = [
  "1-lead-candidate.png",
  "2-near-support-candidate.png",
  "3-far-lead-candidate.png",
  "4-far-support-candidate.png",
  "5-next-step-candidate.png",
];
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const report = [];
  for (const file of files) {
    const { data, info } = await sharp(path.join(workDir, file))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const edge = (l, r, y, white) => {
      const xs = [];
      for (let x = l; x < r; x++) {
        const k = (y * info.width + x) * 3;
        const min = Math.min(data[k], data[k + 1], data[k + 2]),
          max = Math.max(data[k], data[k + 1], data[k + 2]);
        if (white ? min > 145 : max > 20 && max < 130) xs.push(x);
      }
      if (!xs.length) throw Error("No edge");
      return { left: Math.min(...xs), right: Math.max(...xs), y };
    };
    const nearGrip = edge(645, 702, 790, true),
      farGrip = edge(324, 350, 777, true),
      front = edge(548, 649, 780, false),
      back = edge(704, 780, 780, false),
      farPlate = edge(230, 328, 780, false);
    report.push({
      file,
      anchors: {
        nearGripLeft: { x: nearGrip.left, y: 790 },
        nearGripRight: { x: nearGrip.right, y: 790 },
        farGripLeft: { x: farGrip.left, y: 777 },
      },
      invariantDimensions: {
        nearDumbbellSpan: back.right - front.left + 1,
        farPlateWidth: farPlate.right - farPlate.left + 1,
      },
      equipmentEdges: { front, back, farPlate },
    });
  }
  fs.writeFileSync(
    path.join(workDir, "equipment-measurements.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report));
})();
