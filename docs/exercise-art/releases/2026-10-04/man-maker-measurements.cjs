const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const result = [];
  for (let frame = 1; frame <= 6; frame++) {
    const { data, info } = await sharp(
      path.join(path.resolve(process.argv[2] || "."), `review-${frame}.png`)
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function box(l, t, r, b, threshold = 25) {
      let left = r,
        right = l,
        top = b,
        bottom = t;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * 3;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      if (left === r) throw Error("Empty feature");
      return {
        left,
        right,
        top,
        bottom,
        width: right - left + 1,
        height: bottom - top + 1,
      };
    }
    const anchors = {},
      invariantDimensions = {};
    for (const [name, valid, l, t, r, b, y] of [
      ["near", [1, 2, 6], 175, 807, 220, 868, 820],
      ["far", [1, 3, 6], 42, 792, 84, 850, 805],
    ])
      if (valid.includes(frame)) {
        const end = box(l, t, r, b),
          cross = box(l + 10, t, l + 11, b);
        anchors[name + "EndChordTop"] = { x: l + 10, y: cross.top };
        anchors[name + "EndChordBottom"] = { x: l + 10, y: cross.bottom };
        invariantDimensions[name + "EndHeight"] = end.height;
        invariantDimensions[name + "EndVerticalChord"] = cross.height;
      }
    if ([4, 5].includes(frame)) {
      const far = box(115, 795, 260, 860, 140),
        near = box(280, 827, 400, 890, 140);
      for (const [name, shoe, l, r] of [
        ["far", far, 115, 260],
        ["near", near, 280, 400],
      ]) {
        const y = shoe.bottom - 3,
          cross = box(l, y, r, y + 1, 140);
        anchors[name + "SoleEdge"] = { x: cross.left, y };
        invariantDimensions[name + "ShoeWidth"] = shoe.width;
      }
    }
    result.push({ frame, anchors, invariantDimensions });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(result, null, 2)
  );
  console.log(result);
})();
