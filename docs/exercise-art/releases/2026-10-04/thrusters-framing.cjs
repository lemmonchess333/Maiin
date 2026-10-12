const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
const files = [
  "fixed-1.png",
  "fixed-2.png",
  "fixed-3.png",
  "fixed-4.png",
  "fixed-5.png",
  "fixed-1.png",
];
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const report = [];
  for (let i = 0; i < files.length; i++) {
    const p = path.join(workDir, files[i]);
    const { data, info } = await sharp(p)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let excluded = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (x < 432 || x >= 1200) {
          const k = (y * info.width + x) * 3;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 40) excluded++;
        }
    if (excluded) throw Error("Clipped content " + files[i]);
    await sharp(p)
      .extract({ left: 432, top: 0, width: 768, height: 1024 })
      .extend({ top: 32, bottom: 32, left: 0, right: 0, background: "#000" })
      .png()
      .toFile(path.join(workDir, `framed-${i + 1}.png`));
    report.push({
      frame: i + 1,
      source: files[i],
      excludedBrightPixels: excluded,
    });
  }
  fs.writeFileSync(
    path.join(workDir, "framing.json"),
    JSON.stringify(
      {
        crop: { left: 432, top: 0, width: 768, height: 1024 },
        padding: 32,
        scale: 1,
        frames: report,
      },
      null,
      2
    )
  );
})();
