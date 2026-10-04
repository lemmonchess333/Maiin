const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const { data, info } = await sharp(
      path.join(path.resolve(process.argv[2] || "."), `review-${i}.png`)
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function shape(l, t, r, b, threshold) {
      let left = r,
        right = l,
        bottom = t;
      const pixels = [];
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
            pixels.push([x, y]);
          }
        }
      const edge = pixels.filter((p) => p[1] === bottom);
      return {
        left,
        right,
        width: right - left + 1,
        edge: { x: edge[0][0], y: edge[0][1] },
      };
    }
    const near = shape(55, 735, 180, 845, 140),
      far = shape(330, 705, 500, 800, 140),
      base = shape(1330, 866, 1525, 932, 70);
    rows.push({
      frame: i,
      anchors: {
        nearSoleEdge: near.edge,
        farSoleEdge: far.edge,
        anchorBaseEdge: base.edge,
      },
      invariantDimensions: {
        nearShoeWidth: near.width,
        farShoeWidth: far.width,
        anchorBaseWidth: base.width,
      },
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify(rows));
})();
