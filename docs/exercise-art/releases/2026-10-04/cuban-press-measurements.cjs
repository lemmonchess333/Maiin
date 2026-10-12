const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  let rows = [];
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
      l -= 250;
      r -= 250;
      t -= 230;
      b -= 230;
      let minX = r,
        maxX = -1,
        maxY = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          let k = (y * info.width + x) * info.channels;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      let bottomX = minX;
      for (let x = minX; x <= maxX; x++) {
        let k = (maxY * info.width + x) * info.channels;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
          bottomX = x;
          break;
        }
      }
      return { anchor: { x: bottomX, y: maxY }, width: maxX - minX + 1 };
    }
    const left = bounds(345, 1330, 510, 1415, 180),
      right = bounds(510, 1350, 655, 1450, 180);
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
  let findings = [];
  for (let r of rows.slice(1)) {
    for (let k in r.anchors)
      if (
        Math.hypot(
          r.anchors[k].x - rows[0].anchors[k].x,
          r.anchors[k].y - rows[0].anchors[k].y
        ) > 1
      )
        findings.push(`frame${r.frame} anchor ${k}`);
    for (let k in r.invariantDimensions)
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
          "Thresholded fixed contacts only; not moving anatomy, handle, cable or visual approval.",
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
  console.log(
    JSON.stringify({ frames: rows.length, findings, first: rows[0] })
  );
})();
