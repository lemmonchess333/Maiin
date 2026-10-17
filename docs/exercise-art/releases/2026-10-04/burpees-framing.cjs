const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path");
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const inputs = [
    "1-squat-fixed.png",
    "2-plank-aligned.png",
    "3-grounded-fixed.png",
    "2-plank-aligned.png",
    "1-squat-fixed.png",
    "6-jump-black.png",
  ];
  const report = [];
  for (let i = 0; i < inputs.length; i++) {
    const p = path.join(workDir, inputs[i]);
    const { data, info } = await sharp(p)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let excludedBrightPixels = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (x < 432 || x >= 1200) {
          const k = (y * info.width + x) * 3;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 40)
            excludedBrightPixels++;
        }
    if (excludedBrightPixels)
      throw Error("Visible content outside common viewport: " + inputs[i]);
    await sharp(p)
      .extract({ left: 432, top: 0, width: 768, height: 1024 })
      .extend({ top: 32, bottom: 32, left: 0, right: 0, background: "#000000" })
      .png()
      .toFile(path.join(workDir, `framed-${i + 1}.png`));
    report.push({
      source: inputs[i],
      output: `framed-${i + 1}.png`,
      excludedBrightPixels,
    });
  }
  fs.writeFileSync(
    path.join(workDir, "framing.json"),
    JSON.stringify(
      {
        viewport: { left: 432, top: 0, width: 768, height: 1024 },
        paddingTopBottom: 32,
        outputSize: [768, 1088],
        scale: 1,
        note: "Identical viewport and position adjustment for every frame; removes empty sides only. No body rescaling or pose change in this step.",
        frames: report,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(report));
})();
