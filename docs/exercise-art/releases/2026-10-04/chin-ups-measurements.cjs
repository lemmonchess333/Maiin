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
    function support(l, t, r, b) {
      let minX = r,
        maxX = l,
        minY = b,
        maxY = t;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * info.channels;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > 45) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      let bx = -1;
      for (let x = l; x < r; x++) {
        const k = (maxY * info.width + x) * info.channels;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > 45) {
          bx = x;
          break;
        }
      }
      if (bx < 0) throw Error("Support missing");
      return {
        anchor: { x: bx, y: maxY },
        minX,
        maxX,
        height: maxY - minY + 1,
      };
    }
    const left = support(10, 130, 105, 270),
      right = support(985, 130, 1055, 270);
    rows.push({
      frame: i,
      anchors: { leftBarSupport: left.anchor, rightBarSupport: right.anchor },
      invariantDimensions: {
        outerSupportSpan: right.maxX - left.minX + 1,
        leftSupportHeight: left.height,
        rightSupportHeight: right.height,
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
  console.log(rows);
})();
