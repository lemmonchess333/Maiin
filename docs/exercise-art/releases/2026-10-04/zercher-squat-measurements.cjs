const sharp = require("sharp");
const path = require("node:path");
const dir = path.resolve(process.argv[2] || ".");
(async () => {
  const rows = [];
  for (let frame = 1; frame <= 6; frame++) {
    const { data, info } = await sharp(path.join(dir, `review-${frame}.png`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function feature(l, t, r, b) {
      let left = r,
        right = l,
        bottom = t;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > 140) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
      if (right < left) throw Error("Missing shoe");
      return { left, bottom, width: right - left + 1 };
    }
    const l = feature(250, 1290, 500, 1430),
      r = feature(500, 1340, 720, 1500);
    rows.push({
      frame,
      anchors: {
        leftSole: { x: l.left, y: l.bottom },
        rightSole: { x: r.left, y: r.bottom },
      },
      invariantDimensions: { leftShoeWidth: l.width, rightShoeWidth: r.width },
    });
  }
  console.log(JSON.stringify(rows, null, 2));
})();
