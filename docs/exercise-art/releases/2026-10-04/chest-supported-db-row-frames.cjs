const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const crop = { left: 260, top: 0, width: 1100, height: 980 };
  const regions = [
    { left: 930, top: 680, width: 180, height: 115 },
    { left: 1150, top: 725, width: 195, height: 145 },
  ];
  const overlays = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), "3-recovered.png")
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  const evidence = [];
  for (const [i, n] of [1, 2, 3, 3, 2, 1].entries()) {
    const full = await sharp(
      path.join(path.resolve(process.argv[2] || "."), `${n}-bench-pilot.png`)
    )
      .composite(overlays)
      .png()
      .toBuffer();
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
          const k = (y * info.width + x) * info.channels;
          if (Math.max(data[k], data[k + 1], data[k + 2]) > 25) outside++;
        }
    if (outside) throw Error("Visible crop exclusion " + outside);
    await sharp(full)
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
          "Common crop without scaling; equipment pilot plus exact stationary planted-shoe source copies. Not yet release approved.",
      },
      null,
      2
    )
  );
})();
