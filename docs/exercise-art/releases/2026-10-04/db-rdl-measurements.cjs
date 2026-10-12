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
      let bx = minX;
      for (let x = minX; x <= maxX; x++) {
        let k = (maxY * info.width + x) * 3;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
          bx = x;
          break;
        }
      }
      return {
        anchor: { x: bx, y: maxY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
    const left = bounds(150, 1345, 390, 1415, 180),
      right = bounds(360, 1385, 570, 1480, 180);
    rows.push({
      frame,
      anchors: { leftSole: left.anchor, rightSole: right.anchor },
      invariantDimensions: {
        leftShoeWidth: left.width,
        rightShoeWidth: right.width,
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
          "Measured planted sole contacts and widths. Native hinge, wrist, dumbbell and sequence review additionally required.",
      },
      null,
      2
    )
  );
  if (findings.length) throw Error(findings.join(";"));
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify({ findings, first: rows[0] }));
})();
