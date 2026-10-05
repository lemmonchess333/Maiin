const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const master = path.join(
      path.resolve(process.argv[2] || "."),
      "1-master.png"
    ),
    top = path.join(
      path.resolve(process.argv[2] || "."),
      "4-extended-candidate.png"
    ),
    files = [
      "1-master.png",
      "2-early-candidate.png",
      "3-mid-candidate.png",
      "4-extended-candidate.png",
    ],
    rises = [0, 140, 260, 317],
    pad = 64;
  const strips = [];
  for (const r of [
    { left: 0, top: 0, width: 231, height: 1100 },
    { left: 800, top: 0, width: 224, height: 1100 },
  ]) {
    const base = await sharp(master).extract(r).png().toBuffer();
    const clear = await sharp(top)
      .extract({ left: r.left, top: 300, width: r.width, height: 310 })
      .png()
      .toBuffer();
    strips.push({
      input: await sharp(base)
        .composite([{ input: clear, left: 0, top: 300 }])
        .png()
        .toBuffer(),
      left: r.left,
      top: pad,
    });
    const extra = await sharp(master)
      .extract({ left: r.left, top: 0, width: r.width, height: 1 })
      .resize({ width: r.width, height: pad, fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
    strips.push({ input: extra, left: r.left, top: 0 });
  }
  for (const [x, width] of [
    [116, 46],
    [162, 38],
    [858, 56],
    [809, 32],
  ]) {
    const height = 1040 + pad;
    const profile = await sharp(master)
      .extract({ left: x, top: 600, width, height: 1 })
      .resize({ width, height, fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
    const mask = Buffer.from(
      `<svg width="${width}" height="${height}"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="0.82" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#fade)"/></svg>`
    );
    strips.push({
      input: await sharp(profile)
        .ensureAlpha()
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer(),
      left: x,
      top: 0,
    });
  }
  const pieces = [
    { left: 0, top: 340, width: 116, height: 245 },
    { left: 895, top: 340, width: 129, height: 245 },
    { left: 161, top: 375, width: 44, height: 150 },
    { left: 809, top: 378, width: 45, height: 151 },
    { left: 165, top: 314, width: 11, height: 63 },
    { left: 194, top: 449, width: 82, height: 23 },
    { left: 335, top: 451, width: 342, height: 20 },
    { left: 746, top: 451, width: 65, height: 21 },
  ];
  const sourcePieces = await Promise.all(
    pieces.map(async (r) => ({
      input: await sharp(master).extract(r).png().toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  for (let i = 0; i < 4; i++) {
    const body = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[i])
    )
      .extend({ top: pad, bottom: 0, left: 0, right: 0, background: "#000" })
      .png()
      .toBuffer();
    await sharp(body)
      .composite([
        ...strips,
        ...sourcePieces.map((r) => ({ ...r, top: r.top - rises[i] + pad })),
      ])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `equipment-pilot-${i + 1}.png`
        )
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json"),
    JSON.stringify(
      {
        files,
        rises,
        paddingTop: pad,
        pieces,
        scope:
          "Rigid equipment source translation and fixed unobstructed rack regions only. Common padding; no anatomy transforms. PILOT pending visual inspection.",
      },
      null,
      2
    )
  );
})();
