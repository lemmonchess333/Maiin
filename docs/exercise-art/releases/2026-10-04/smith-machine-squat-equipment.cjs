const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = ["1-master.png", "2-clean.png", "3-clean.png"],
    drops = [0, 150, 350],
    master = path.join(path.resolve(process.argv[2] || "."), files[0]),
    strips = [];
  for (const r of [
    { left: 0, top: 0, width: 280, height: 1536 },
    { left: 765, top: 0, width: 259, height: 1536 },
  ]) {
    const b = await sharp(master).extract(r).png().toBuffer(),
      profile = await sharp(master)
        .extract({ left: r.left, top: 200, width: r.width, height: 1 })
        .resize(r.width, 900, { fit: "fill", kernel: "nearest" })
        .ensureAlpha()
        .raw()
        .toBuffer();
    for (let y = 0; y < 900; y++)
      for (let x = 0; x < r.width; x++)
        profile[(y * r.width + x) * 4 + 3] = Math.round(
          255 * Math.min(1, y / 20, (899 - y) / 20)
        );
    const faded = await sharp(profile, {
      raw: { width: r.width, height: 900, channels: 4 },
    })
      .png()
      .toBuffer();
    strips.push({
      input: await sharp(b)
        .composite([{ input: faded, left: 0, top: 280 }])
        .png()
        .toBuffer(),
      left: r.left,
      top: 0,
    });
  }
  const pieces = [
    { left: 49, top: 331, width: 227, height: 216 },
    { left: 765, top: 311, width: 213, height: 238 },
    { left: 276, top: 430, width: 27, height: 20 },
    { left: 726, top: 430, width: 39, height: 20 },
  ];
  const fixedPosts = [];
  for (const r of [
    { left: 180, width: 57 },
    { left: 819, width: 30 },
  ]) {
    const data = await sharp(master)
      .extract({ ...r, top: 200, height: 1 })
      .resize(r.width, 900, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let y = 0; y < 900; y++)
      for (let x = 0; x < r.width; x++)
        data[(y * r.width + x) * 4 + 3] = Math.round(
          255 * Math.min(1, y / 20, (899 - y) / 20)
        );
    fixedPosts.push({
      input: await sharp(data, {
        raw: { width: r.width, height: 900, channels: 4 },
      })
        .png()
        .toBuffer(),
      left: r.left,
      top: 280,
    });
  }
  const parts = await Promise.all(
    pieces.map(async (r) => ({
      input: await sharp(master).extract(r).png().toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  for (let i = 0; i < 3; i++)
    await sharp(path.join(path.resolve(process.argv[2] || "."), files[i]))
      .composite([
        ...strips,
        ...parts.map((p) => ({ ...p, top: p.top + drops[i] })),
        ...fixedPosts,
      ])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `equipment-pilot-${i + 1}.png`
        )
      );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json"),
    JSON.stringify(
      {
        files,
        drops,
        pieces,
        scope:
          "Exact source plates/carriages/sleeves translated together; fixed unobstructed frame strips and rail profile restored. Central shaft remains native behind hands/neck to preserve anatomy occlusion. Native grip and shaft alignment review required; no anatomy transformed.",
      },
      null,
      2
    )
  );
})();
