const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const frames = [];
  for (let n = 1; n <= 6; n++) {
    const { data, info } = await sharp(path.join(workDir, `framed-${n}.png`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const anchors = {},
      invariantDimensions = {};
    const scans =
      n === 6
        ? []
        : [
            ["nearPalm", 875, 957, 930],
            ["farPalm", 1010, 1090, 918],
            ...([2, 3, 4].includes(n)
              ? [
                  ["nearToe", 490, 545, 898],
                  ["farToe", 545, 590, 894],
                ]
              : []),
          ];
    for (const [name, start, end, row] of scans) {
      let left = Infinity,
        right = -1;
      const y = row + 32;
      for (let x = start - 432; x < end - 432; x++) {
        const k = (y * info.width + x) * 3;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > 110) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      if (!Number.isFinite(left)) throw Error("Missing " + name + " in " + n);
      anchors[name + "Left"] = { x: left, y };
      anchors[name + "Right"] = { x: right, y };
      invariantDimensions[name + "Width"] = right - left + 1;
    }
    frames.push({ frame: n, anchors, invariantDimensions });
  }
  fs.writeFileSync(
    path.join(workDir, "phase-measurements.json"),
    JSON.stringify(frames, null, 2)
  );
  console.log(JSON.stringify(frames));
})();
