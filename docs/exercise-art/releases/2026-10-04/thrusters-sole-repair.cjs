const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const files = [
  "1-rack-grip-candidate.png",
  "2-squat-candidate.png",
  "3-drive-candidate.png",
  "4-press-guided.png",
  "5-overhead-guided.png",
];
const regions = [
  { left: 655, top: 889, width: 115, height: 20 },
  { left: 770, top: 879, width: 126, height: 22 },
];
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const master = path.join(workDir, files[0]),
    overlays = [];
  for (const r of regions)
    overlays.push({
      input: await sharp(master).extract(r).toBuffer(),
      left: r.left,
      top: r.top,
    });
  const report = [];
  for (let i = 0; i < files.length; i++) {
    const input = path.join(workDir, files[i]),
      output = path.join(workDir, `fixed-${i + 1}.png`);
    await sharp(input).composite(overlays).png().toFile(output);
    const a = await sharp(input).removeAlpha().raw().toBuffer(),
      b = await sharp(output).removeAlpha().raw().toBuffer();
    let outside = 0;
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1536; x++) {
        const k = (y * 1536 + x) * 3;
        if (
          (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) &&
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
    if (outside) throw Error("Outside sole regions");
    report.push({
      input: files[i],
      output: `fixed-${i + 1}.png`,
      regions,
      changedPixelsOutsideRegions: outside,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(output))
        .digest("hex"),
    });
  }
  fs.writeFileSync(
    path.join(workDir, "sole-repair.json"),
    JSON.stringify(report, null, 2)
  );
})();
