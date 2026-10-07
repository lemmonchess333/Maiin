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
    function white(x, y) {
      const k = (y * info.width + x) * 3;
      return Math.min(data[k], data[k + 1], data[k + 2]) > 180;
    }
    function bounds(l, t, r, b) {
      let minX = r,
        maxX = -1,
        minY = b,
        maxY = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++)
          if (white(x, y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
      if (maxX < 0) throw Error("Missing contact");
      let topX = minX;
      for (let x = minX; x <= maxX; x++)
        if (white(x, minY)) {
          topX = x;
          break;
        }
      let bottomX = minX;
      for (let x = minX; x <= maxX; x++)
        if (white(x, maxY)) {
          bottomX = x;
          break;
        }
      return {
        anchor: { x: topX, y: minY },
        bottom: { x: bottomX, y: maxY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
    const left = bounds(305, 385, 360, 440),
      right = bounds(363, 382, 410, 426),
      shoe = bounds(535, 880, 685, 960);
    rows.push({
      frame,
      anchors: {
        leftGrip: left.anchor,
        rightGrip: right.anchor,
        plantedSole: shoe.bottom,
      },
      invariantDimensions: {
        plantedShoeContourWidth: shoe.width,
        plantedShoeContourHeight: shoe.height,
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
          "Pixel-derived stationary two hand-contact contours and planted shoe sole, width and height. White RGB components over 180 inside fixed disclosed ROIs. Native movement, fixed equipment, cuff/cable and sequence review separately required.",
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
