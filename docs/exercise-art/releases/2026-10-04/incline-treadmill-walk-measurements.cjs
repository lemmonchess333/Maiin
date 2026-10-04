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
    function shape(l, t, r, b) {
      let left = r,
        right = l,
        bottom = t;
      const pixels = [];
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > 35) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
            pixels.push([x, y]);
          }
        }
      if (!pixels.length) throw Error("No geometry");
      const edge = pixels.filter((p) => p[1] === bottom);
      return {
        left,
        right,
        width: right - left + 1,
        edge: { x: edge[0][0], y: bottom },
      };
    }
    const rear = shape(85, 890, 180, 925),
      front = shape(1090, 885, 1220, 925);
    rows.push({
      frame: i,
      anchors: { rearSupportBottom: rear.edge, frontSupportBottom: front.edge },
      invariantDimensions: {
        rearSupportWidth: rear.width,
        frontSupportWidth: front.width,
      },
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify(rows));
})();
