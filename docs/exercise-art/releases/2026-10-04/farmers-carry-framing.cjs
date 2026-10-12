const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
const files = [
  "1-lead-candidate.png",
  "2-near-support-candidate.png",
  "3-far-lead-candidate.png",
  "4-far-support-candidate.png",
  "5-next-step-candidate.png",
  "1-lead-candidate.png",
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
        if (x < 128 || x >= 896) {
          const k = (y * info.width + x) * 3;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 40) excluded++;
        }
    if (excluded) throw Error("Visible content clipped");
    await sharp(p)
      .extract({ left: 128, top: 0, width: 768, height: 1536 })
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
        crop: { left: 128, top: 0, width: 768, height: 1536 },
        paddingTopBottom: 32,
        scale: 1,
        frames: report,
      },
      null,
      2
    )
  );
})();
