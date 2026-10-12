const sharp = require("sharp");
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
// Exact fixed-contact source pixels only. No body resizing or joint warping.
const regions = [
  { name: "nearFingerContact", left: 875, top: 925, width: 82, height: 23 },
  { name: "farFingerContact", left: 1010, top: 915, width: 80, height: 23 },
];
const workDir = path.resolve(process.argv[2] || ".");
(async () => {
  const master = path.join(workDir, "2-plank-aligned.png");
  const report = [];
  for (const [file, out, feet] of [
    ["1-squat-aligned.png", "1-squat-fixed.png", false],
    ["3-grounded-feet.png", "3-grounded-fixed.png", true],
  ]) {
    const areas = [
      ...regions,
      ...(feet
        ? [
            {
              name: "plantedToeContacts",
              left: 485,
              top: 887,
              width: 112,
              height: 35,
            },
          ]
        : []),
    ];
    const overlays = [];
    for (const r of areas)
      overlays.push({
        input: await sharp(master)
          .extract({
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
          })
          .toBuffer(),
        left: r.left,
        top: r.top,
      });
    const input = path.join(workDir, file),
      output = path.join(workDir, out);
    await sharp(input).composite(overlays).png().toFile(output);
    const a = await sharp(input).removeAlpha().raw().toBuffer();
    const b = await sharp(output).removeAlpha().raw().toBuffer();
    let outside = 0;
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1536; x++) {
        const k = (y * 1536 + x) * 3;
        if (
          (a[k] !== b[k] || a[k + 1] !== b[k + 1] || a[k + 2] !== b[k + 2]) &&
          !areas.some(
            (r) =>
              x >= r.left &&
              x < r.left + r.width &&
              y >= r.top &&
              y < r.top + r.height
          )
        )
          outside++;
      }
    if (outside)
      throw Error("Changed pixels outside stationary contact regions");
    report.push({
      input: file,
      output: out,
      areas,
      changedPixelsOutsideRegions: outside,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(output))
        .digest("hex"),
    });
    await sharp(output)
      .extract({ left: 475, top: 800, width: 655, height: 155 })
      .resize({ width: 1310 })
      .png()
      .toFile(path.join(workDir, out.replace(".png", "-detail.png")));
  }
  fs.writeFileSync(
    path.join(workDir, "fixed-contact-provenance.json"),
    JSON.stringify(report, null, 2)
  );
})();
