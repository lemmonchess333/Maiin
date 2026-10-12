const workDir = require("node:path").resolve(process.argv[2] || ".");
const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const { data, info } = await sharp(path.join(workDir, `review-${i}.png`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function box(l, t, r, b, threshold) {
      let xs = [],
        ys = [];
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          let k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            xs.push(x);
            ys.push(y);
          }
        }
      if (!xs.length) throw Error("No visible feature");
      return {
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      };
    }
    const near = box(245, 840, 390, 960, 140),
      far = box(410, 825, 580, 920, 140),
      boltL = box(1300, 908, 1332, 929, 130),
      boltR = box(1410, 905, 1440, 928, 130);
    const bright = (x, y) =>
      Math.min(
        ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)
      ) > 130;
    let bx = 1300;
    while (bx < 1332 && !bright(bx, 918)) bx++;
    let by = 900;
    while (by < 928 && !bright(1425, by)) by++;
    rows.push({
      frame: i,
      near,
      far,
      boltL,
      boltR,
      anchors: {
        leftBoltEdge: { x: bx, y: 918 },
        rightBoltTop: { x: 1425, y: by },
      },
      dimensions: {
        nearShoeWidth: near.right - near.left + 1,
        farShoeWidth: far.right - far.left + 1,
      },
    });
  }
  fs.writeFileSync(
    path.join(workDir, "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(rows);
})();
