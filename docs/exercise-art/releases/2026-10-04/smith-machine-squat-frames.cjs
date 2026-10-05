const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = [
      "equipment-pilot-1.png",
      "equipment-pilot-2.png",
      "equipment-pilot-3.png",
    ],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 305, top: 1280, width: 180, height: 60 },
      { left: 490, top: 1320, width: 165, height: 60 },
    ],
    crop = { left: 0, top: 0, width: 1024, height: 1472 },
    padding = { left: 24, right: 24, top: 24, bottom: 0, background: "#000" };
  const overlays = await Promise.all(
    contacts.map(async (r) => {
      const data = await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[0])
      )
        .extract(r)
        .ensureAlpha()
        .raw()
        .toBuffer();
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < r.width; x++)
          data[(y * r.width + x) * 4 + 3] = Math.round((255 * y) / 10);
      return {
        input: await sharp(data, {
          raw: { width: r.width, height: r.height, channels: 4 },
        })
          .png()
          .toBuffer(),
        left: r.left,
        top: r.top,
      };
    })
  );
  for (let i = 0; i < 6; i++) {
    const b = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[sequence[i] - 1])
    )
      .composite(overlays)
      .png()
      .toBuffer();
    await sharp(b)
      .extract(crop)
      .extend(padding)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        files,
        sequence,
        contacts,
        contactTopFadePixels: 10,
        crop,
        padding,
        scope:
          "Common crop/padding and planted shoe contact copies. Moving anatomy never transformed.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Rest the bar across your upper traps." },
        { label: "Lower", cue: "Bend your knees with heels planted." },
        { label: "Bottom", cue: "Lower until your thighs reach parallel." },
        { label: "Hold", cue: "Stay braced with knees tracking your toes." },
        { label: "Rise", cue: "Drive upward through your whole foot." },
        { label: "Stand", cue: "Stand tall without locking your knees." },
      ],
      null,
      2
    )
  );
})();
