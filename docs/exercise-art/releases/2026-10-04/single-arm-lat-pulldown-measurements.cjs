const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  const rows = [];
  for (let frame = 1; frame <= 6; frame++) {
    const file = path.join(
        path.resolve(process.argv[2] || "."),
        `review-${frame}.png`
      ),
      { data, info } = await sharp(file)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    function bounds(l, t, r, b, threshold) {
      let minX = r,
        maxX = -1,
        minY = b,
        maxY = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * info.channels;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      if (maxX < 0) throw Error("Empty measurement");
      let bottomX = minX;
      for (let x = minX; x <= maxX; x++) {
        const k = (maxY * info.width + x) * info.channels;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
          bottomX = x;
          break;
        }
      }
      return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        anchor: { x: bottomX, y: maxY },
      };
    }
    const front = bounds(90, 1255, 285, 1350, 40),
      rear = bounds(298, 1200, 435, 1265, 40),
      near = bounds(535, 1208, 700, 1280, 180),
      far = bounds(395, 1160, 532, 1235, 180),
      lower = bounds(778, 952, 882, 1170, 35);
    const strip = await sharp(file)
      .extract({ left: 778, top: 952, width: 104, height: 218 })
      .raw()
      .toBuffer();
    rows.push({
      frame,
      anchors: {
        frontBenchFoot: front.anchor,
        rearBenchFoot: rear.anchor,
        nearSole: near.anchor,
        farSole: far.anchor,
      },
      invariantDimensions: {
        frontBenchFootWidth: front.width,
        nearShoeWidth: near.width,
        farShoeWidth: far.width,
      },
      stationaryStackPixelsSha256: crypto
        .createHash("sha256")
        .update(strip)
        .digest("hex"),
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
    if (row.stationaryStackPixelsSha256 !== rows[0].stationaryStackPixelsSha256)
      throw Error("Lower stack differs");
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(
    JSON.stringify({
      frames: rows.length,
      first: rows[0],
      result:
        "Selected contact/dimension invariants pass; lower stack exact across all six. Cable geometry requires separate verification.",
    })
  );
})();
