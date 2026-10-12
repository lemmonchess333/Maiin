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
    function bounds(l, t, r, b) {
      let minX = r,
        maxX = -1,
        minY = b,
        maxY = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > 180) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      if (maxX < 0) throw Error("Missing grip");
      let topX = minX;
      for (let x = minX; x <= maxX; x++) {
        const k = (minY * info.width + x) * 3;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > 180) {
          topX = x;
          break;
        }
      }
      return {
        anchor: { x: topX, y: minY },
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
    }
    function capWidth(l, t, r, b) {
      let a = r,
        z = -1;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 35) {
            a = Math.min(a, x);
            z = Math.max(z, x);
          }
        }
      if (z < 0) throw Error("Missing handle cap");
      return z - a + 1;
    }
    const left = bounds(154, 317, 222, 382),
      right = bounds(644, 317, 714, 382);
    rows.push({
      frame,
      anchors: { leftGrip: left.anchor, rightGrip: right.anchor },
      invariantDimensions: {
        leftHandleCapWidth: capWidth(174, 277, 214, 302),
        rightHandleCapWidth: capWidth(664, 277, 704, 302),
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
          "Measured two stationary hand/handle contacts and handle-cap diameters; native anatomy, rotating pads/footrests, fixed hub/frame and sequence review additionally required. Moving shoe widths intentionally not invariants.",
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
