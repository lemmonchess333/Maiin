const workDir = require("node:path").resolve(process.argv[2] || ".");
const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const rows = [];
  for (let f = 1; f <= 6; f++) {
    const { data, info } = await sharp(path.join(workDir, `review-${f}.png`))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function span(y, lo, hi, threshold) {
      const xs = [];
      for (let x = lo; x < hi; x++) {
        let k = (y * info.width + x) * 3;
        if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) xs.push(x);
      }
      return [xs[0], xs.at(-1)];
    }
    rows.push({
      frame: f,
      leftFront: span(854, 50, 120, 100)[0],
      leftBack: span(734, 150, 200, 100)[0],
      plateSpan: span(
        720,
        [1100, 1140, 1180, 1100, 1030, 980][f - 1],
        [1310, 1350, 1390, 1310, 1230, 1180][f - 1],
        80
      ),
      loadingPost: span(
        675,
        [1170, 1210, 1250, 1170, 1100, 1050][f - 1],
        [1220, 1260, 1300, 1220, 1150, 1100][f - 1],
        25
      ),
    });
  }
  fs.writeFileSync(
    path.join(workDir, "release-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(rows);
})();
