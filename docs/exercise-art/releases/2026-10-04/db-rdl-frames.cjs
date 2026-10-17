const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = ["1-master.png", "2-middle.png", "3-bottom.png"],
    shifts = [0, 64, 32],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 275, top: 1310, width: 230, height: 80 },
      { left: 480, top: 1350, width: 200, height: 100 },
    ],
    master = path.join(path.resolve(process.argv[2] || "."), files[0]),
    copies = [];
  for (const r of contacts) {
    const data = await sharp(master).extract(r).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < r.width; x++)
        data[(y * r.width + x) * 4 + 3] = Math.round((255 * y) / 20);
    copies.push({
      input: await sharp(data, {
        raw: { width: r.width, height: r.height, channels: 4 },
      })
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    });
  }
  for (let i = 0; i < 3; i++) {
    const moved = await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[i])
      )
        .extend({
          top: shifts[i],
          bottom: 0,
          left: 0,
          right: 0,
          background: "#000",
        })
        .png()
        .toBuffer(),
      normalized = await sharp(moved)
        .extract({ left: 0, top: 0, width: 1024, height: 1536 })
        .composite(copies)
        .png()
        .toBuffer();
    await sharp(normalized)
      .extract({ left: 140, top: 0, width: 700, height: 1472 })
      .extend({ left: 24, right: 24, top: 32, bottom: 0, background: "#000" })
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `pose-${i + 1}.png`)
      );
  }
  for (let i = 0; i < 6; i++)
    fs.copyFileSync(
      path.join(
        path.resolve(process.argv[2] || "."),
        `pose-${sequence[i]}.png`
      ),
      path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
    );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        files,
        wholeSceneY: shifts,
        evidence:
          "Sole bottoms master1379/1438;middle1315/1374;bottom1347/1406. Equal32/64px shifts in both independent soles.",
        sequence,
        contacts,
        contactTopFade: 20,
        crop: { left: 140, top: 0, width: 700, height: 1472 },
        padding: { left: 24, right: 24, top: 32, bottom: 0 },
        scope:
          "Whole-scene translation/crop plus authorized stationary shoe copies only; no moving anatomy transformation.",
      },
      null,
      2
    )
  );
  const rows = [
    ["Set", "Stand tall with softly bent knees."],
    ["Hinge", "Push your hips back with straight arms."],
    ["Stretch", "Lower the dumbbells close to your shins."],
    ["Hold", "Keep your back straight and heels planted."],
    ["Rise", "Drive your hips forward to rise."],
    ["Stand", "Stand tall without leaning back."],
  ].map(([label, cue]) => ({ label, cue }));
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(rows, null, 2)
  );
})();
