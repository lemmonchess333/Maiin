const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const crop = { left: 95, top: 25, width: 1070, height: 1180 },
    evidence = [];
  const regions = [
    { left: 100, top: 150, width: 110, height: 150 },
    { left: 1040, top: 150, width: 110, height: 150 },
  ];
  const overlays = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), "1-recovered.png")
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  for (const [i, n] of [1, 2, 3, 4, 3, 2].entries()) {
    const src = path.join(
        path.resolve(process.argv[2] || "."),
        `${n}-recovered.png`
      ),
      { data, info } = await sharp(src)
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
          const k = (y * info.width + x) * info.channels;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 25) outside++;
        }
    if (outside) throw Error("Visible crop exclusion " + outside);
    const fixed = await sharp(src).composite(overlays).png().toBuffer();
    await sharp(fixed)
      .extract(crop)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
    evidence.push({ frame: i + 1, pose: n, outsideVisiblePixels: outside });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        crop,
        regions,
        evidence,
        method:
          "Identical crop of four generated poses; exact master-copy end support rectangles only, far outside athlete and grips. No scaling or anatomy transformation.",
      },
      null,
      2
    )
  );
})();
