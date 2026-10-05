const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  const rows = [];
  for (let frame = 1; frame <= 6; frame++) {
    const f = path.join(
        path.resolve(process.argv[2] || "."),
        `review-${frame}.png`
      ),
      { data, info } = await sharp(f)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    function bounds(l, t, r, b, threshold) {
      l += 48;
      r += 48;
      let minX = r,
        maxX = -1,
        minY = b,
        maxY = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          let k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      let bottomX = minX;
      for (let x = minX; x <= maxX; x++) {
        let k = (maxY * info.width + x) * 3;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
          bottomX = x;
          break;
        }
      }
      return {
        anchor: { x: bottomX, y: maxY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
    const left = bounds(225, 1180, 400, 1335, 180),
      right = bounds(620, 1180, 800, 1335, 180),
      base = bounds(470, 1230, 555, 1300, 40),
      plateY = [640, 340, 255, 255, 340, 640][frame - 1],
      leftPlate = bounds(75, plateY, 150, plateY + 235, 40),
      rightPlate = bounds(872, plateY, 945, plateY + 235, 40);
    rows.push({
      frame,
      anchors: {
        leftSole: left.anchor,
        rightSole: right.anchor,
        benchBase: base.anchor,
      },
      invariantDimensions: {
        leftShoeWidth: left.width,
        rightShoeWidth: right.width,
        benchBaseWidth: base.width,
        leftPlateHeight: leftPlate.height,
        rightPlateHeight: rightPlate.height,
      },
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(f))
        .digest("hex"),
    });
  }
  const findings = [];
  for (const r of rows.slice(1)) {
    for (const k in r.anchors)
      if (
        Math.hypot(
          r.anchors[k].x - rows[0].anchors[k].x,
          r.anchors[k].y - rows[0].anchors[k].y
        ) > 1
      )
        findings.push(`frame${r.frame} anchor ${k}`);
    for (const k in r.invariantDimensions)
      if (
        Math.abs(
          r.invariantDimensions[k] / rows[0].invariantDimensions[k] - 1
        ) > 0.01
      )
        findings.push(`frame${r.frame} dimension ${k}`);
  }
  fs.writeFileSync(
    path.join(
      path.resolve(process.argv[2] || "."),
      "final-measurements-detail.json"
    ),
    JSON.stringify(
      {
        rows,
        findings,
        scope:
          "Pixel-derived contact anchors, shoe/base widths and moving plate heights. Not a substitute for native anatomy, grip and sequence review.",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ rows, findings }));
  if (findings.length) throw Error(findings.join(";"));
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
})();
