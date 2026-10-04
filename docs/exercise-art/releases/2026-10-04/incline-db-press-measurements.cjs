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
    function foot(l, t, r, b) {
      let bottom = -1,
        pts = [],
        left = r,
        right = l;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > 35) {
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
    const rear = foot(25, 700, 105, 765),
      front = foot(355, 792, 430, 846),
      near = foot(510, 800, 690, 900),
      far = foot(710, 735, 910, 825);
    rows.push({
      frame: i,
      anchors: {
        rearBenchContact: rear.anchor,
        frontBenchContact: front.anchor,
        nearSole: near.anchor,
        farSole: far.anchor,
      },
      invariantDimensions: {
        benchSupportSpan: Math.hypot(
          front.anchor.x - rear.anchor.x,
          front.anchor.y - rear.anchor.y
        ),
        nearShoeWidth: near.width,
        farShoeWidth: far.width,
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
