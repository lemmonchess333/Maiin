const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
// Run from a directory containing the five named background-cleaned source PNGs.
const inputDir = path.resolve(process.argv[2] || ".");
const files = ["1-floor", "2-pull", "3-rack", "4-dip", "5-overhead"];
// Fixed footwear contact only; no athlete translation or joint transformation.
const regions = [
  { left: 660, top: 882, width: 109, height: 33 },
  { left: 769, top: 872, width: 127, height: 34 },
];
(async () => {
  const ref = await sharp(path.join(inputDir, "2-pull-clean-background.png"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const report = [];
  for (const name of files) {
    const input = path.join(inputDir, name + "-clean-background.png");
    const { data, info } = await sharp(input)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const out = Buffer.from(data);
    for (const r of regions)
      for (let y = r.top; y < r.top + r.height; y++)
        for (let x = r.left; x < r.left + r.width; x++) {
          const weight = Math.min(1, (y - r.top + 1) / 4);
          const p = (y * info.width + x) * 3;
          for (let c = 0; c < 3; c++)
            out[p + c] = Math.round(
              data[p + c] * (1 - weight) + ref.data[p + c] * weight
            );
        }
    let changed = 0,
      outside = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const p = (y * info.width + x) * 3;
        if (
          out[p] !== data[p] ||
          out[p + 1] !== data[p + 1] ||
          out[p + 2] !== data[p + 2]
        ) {
          changed++;
          if (
            !regions.some(
              (r) =>
                x >= r.left &&
                x < r.left + r.width &&
                y >= r.top &&
                y < r.top + r.height
            )
          )
            outside++;
        }
      }
    if (outside) throw Error("Out-of-scope pixel change");
    await sharp(out, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      .png()
      .toFile(path.join(inputDir, name + "-contact-stable.png"));
    report.push({
      name,
      changedPixels: changed,
      changedOutsideContactRegions: outside,
    });
  }
  fs.writeFileSync(
    path.join(inputDir, "sole-contact-repair.json"),
    JSON.stringify(
      { reference: "2-pull-clean-background.png", regions, report },
      null,
      2
    )
  );
  console.log(JSON.stringify(report));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
