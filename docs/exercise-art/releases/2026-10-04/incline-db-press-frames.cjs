const fs = require("node:fs"),
  path = require("node:path"),
  sharp = require("sharp"),
  crypto = require("node:crypto");
(async () => {
  const sources = [1, 2, 3, 4, 3, 2].map((n) => `${n}-polished.png`);
  const regions = [
    { left: 330, top: 675, width: 320, height: 140 },
    { left: 665, top: 795, width: 165, height: 90 },
    { left: 830, top: 790, width: 175, height: 135 },
    { left: 1030, top: 737, width: 200, height: 115 },
  ];
  const crop = { left: 315, top: 30, width: 930, height: 925 };
  const overlays = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), sources[0])
      )
        .extract(r)
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  const evidence = [];
  for (let i = 0; i < 6; i++) {
    const raw = fs.readFileSync(
      path.join(path.resolve(process.argv[2] || "."), sources[i])
    );
    const full = await sharp(raw).composite(overlays).png().toBuffer();
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
          const k = (y * info.width + x) * 3;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 25) outside++;
        }
    if (outside) throw Error("Visible pixels clipped: " + outside);
    await sharp(full)
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `full-review-${i + 1}.png`
        )
      );
    await sharp(full)
      .extract(crop)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
    evidence.push({
      frame: i + 1,
      source: sources[i],
      sourceSha256: crypto.createHash("sha256").update(raw).digest("hex"),
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
          "Exact master-copy stationary bench supports and planted shoe contact regions; no moving arm anatomy touched. Common crop without scale changes.",
        evidence,
      },
      null,
      2
    )
  );
})();
