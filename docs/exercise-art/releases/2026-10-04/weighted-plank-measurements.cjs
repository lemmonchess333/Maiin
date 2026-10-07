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
      let bottomX = minX;
      for (let x = minX; x <= maxX; x++)
        if (white(x, maxY)) {
          bottomX = x;
          break;
        }
      return {
        bottom: { x: bottomX, y: maxY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
    const forearms = bounds(44, 457, 524, 595),
      nearToe = bounds(1340, 495, 1440, 550),
      farToe = bounds(1255, 470, 1340, 530);
    rows.push({
      frame,
      anchors: {
        forearmFloor: forearms.bottom,
        nearToe: nearToe.bottom,
        farToe: farToe.bottom,
      },
      invariantDimensions: {
        forearmContourWidth: forearms.width,
        forearmContourHeight: forearms.height,
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
          "Pixel-derived lowest white forearm floor contour and two grounded toe contours; complete fixed forearm assembly contour width/height. RGB components over180 in disclosed ROIs. Native rigid plank, upper-back plate placement/removal and both mobile reviews required separately.",
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
