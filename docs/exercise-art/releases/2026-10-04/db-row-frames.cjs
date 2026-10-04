const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  const names = [
    "1-master.png",
    "2-early-candidate.png",
    "3-late-row-candidate.png",
    "4-top-candidate.png",
  ];
  const regions = [
    { left: 15, top: 965, width: 235, height: 115 },
    { left: 825, top: 1060, width: 190, height: 130 },
    { left: 415, top: 1040, width: 250, height: 145 },
  ];
  const overlays = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), names[0])
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  const crop = { left: 5, top: 105, width: 1014, height: 1090 };
  const evidence = [];
  for (const [i, n] of [0, 1, 2, 3, 2, 1].entries()) {
    const src = path.join(path.resolve(process.argv[2] || "."), names[n]),
      full = await sharp(src).composite(overlays).png().toBuffer();
    const { data, info } = await sharp(full)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let outside = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (
          x < crop.left ||
          x >= crop.left + crop.width ||
          y < crop.top ||
          y >= crop.top + crop.height
        ) {
          let k = (y * info.width + x) * info.channels;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 25) outside++;
        }
    if (outside) throw Error("Visible pixels clipped " + outside);
    await sharp(full)
      .extract(crop)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
    evidence.push({
      frame: i + 1,
      source: names[n],
      sourceSha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(src))
        .digest("hex"),
      outsideVisiblePixels: outside,
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        crop,
        regions,
        method:
          "Common crop, no scaling. Exact stationary bench floor-support and planted shoe contact copies from exercise master. No moving anatomy modified.",
        evidence,
      },
      null,
      2
    )
  );
})();
