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
    function edge(l, t, r, b, threshold = 35) {
      let bottom = -1,
        pts = [],
        left = r,
        right = l;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * info.channels;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            if (y > bottom) {
              bottom = y;
              pts = [];
            }
            if (y === bottom) pts.push(x);
          }
        }
      if (!pts.length) throw Error("Missing contact");
      return { anchor: { x: pts[0], y: bottom }, width: right - left + 1 };
    }
    const left = edge(10, 860, 245, 975),
      right = edge(820, 955, 1010, 1085),
      shoe = edge(410, 935, 660, 1080, 80);
    rows.push({
      frame: i,
      anchors: {
        leftBenchContact: left.anchor,
        rightBenchContact: right.anchor,
        plantedSole: shoe.anchor,
      },
      invariantDimensions: {
        benchSupportSpan: Math.hypot(
          right.anchor.x - left.anchor.x,
          right.anchor.y - left.anchor.y
        ),
        plantedShoeWidth: shoe.width,
        leftBenchFootWidth: left.width,
        rightBenchFootWidth: right.width,
      },
    });
  }
  for (const row of rows.slice(1)) {
    for (const k of Object.keys(rows[0].anchors))
      if (
        Math.hypot(
          row.anchors[k].x - rows[0].anchors[k].x,
          row.anchors[k].y - rows[0].anchors[k].y
        ) > 1
      )
        throw Error("Anchor drift " + k);
    for (const k of Object.keys(rows[0].invariantDimensions))
      if (
        Math.abs(
          row.invariantDimensions[k] / rows[0].invariantDimensions[k] - 1
        ) > 0.01
      )
        throw Error("Dimension drift " + k);
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify(rows));
})();
