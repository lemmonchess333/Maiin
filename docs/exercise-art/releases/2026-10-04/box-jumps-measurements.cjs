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
    function edge(l, t, r, b, threshold) {
      let left = r,
        right = l,
        bottom = t;
      const pixels = [];
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
            pixels.push([x, y]);
          }
        }
      if (!pixels.length) throw Error("Empty region");
      const end = pixels.filter((p) => p[1] === bottom);
      return {
        left,
        right,
        width: right - left + 1,
        edge: { x: end[0][0], y: bottom },
      };
    }
    const box = edge(400, 700, 745, 890, 30),
      section = edge(400, 860, 745, 861, 30),
      anchors = { boxBase: box.edge, boxSectionLeft: section.edge },
      invariantDimensions = {
        boxWidth: box.width,
        boxSectionWidth: section.width,
      };
    if (i <= 2) {
      const near = edge(150, 840, 235, 880, 200),
        far = edge(260, 800, 335, 842, 200);
      anchors.nearSole = near.edge;
      anchors.farSole = far.edge;
      invariantDimensions.nearSoleBandWidth = near.width;
      invariantDimensions.farSoleBandWidth = far.width;
    }
    if (i === 4 || i === 5) {
      const near = edge(480, 670, 555, 705, 200),
        far = edge(590, 645, 658, 686, 200);
      anchors.nearTopSole = near.edge;
      anchors.farTopSole = far.edge;
      invariantDimensions.nearTopSoleBandWidth = near.width;
      invariantDimensions.farTopSoleBandWidth = far.width;
    }
    rows.push({ frame: i, anchors, invariantDimensions });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify(rows));
})();
