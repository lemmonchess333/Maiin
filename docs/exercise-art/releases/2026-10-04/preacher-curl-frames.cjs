const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = ["equipment-1.png", "equipment-2.png", "equipment-3.png"],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 225, top: 1150, width: 175, height: 185 },
      { left: 620, top: 1150, width: 180, height: 185 },
      { left: 470, top: 1200, width: 85, height: 100 },
    ],
    crop = { left: 0, top: 0, width: 1024, height: 1360 },
    padding = { top: 0, bottom: 0, left: 48, right: 48, background: "#000" };
  const overlays = await Promise.all(
    contacts.map(async (r) => {
      const raw = await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[0])
      )
        .extract(r)
        .ensureAlpha()
        .raw()
        .toBuffer();
      for (let y = 0; y < 25; y++)
        for (let x = 0; x < r.width; x++)
          raw[(y * r.width + x) * 4 + 3] = Math.round((255 * y) / 25);
      return {
        input: await sharp(raw, {
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
        contactTopFadePixels: 25,
        crop,
        padding,
        scope:
          "Stationary shoe/base contact copies with upper fade; common crop and margins only. No moving anatomy transformations.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Support upper arms; keep your elbows soft." },
        { label: "Curl", cue: "Curl upward with upper arms against pad." },
        { label: "Top", cue: "Bring bar toward shoulders without shrugging." },
        { label: "Hold", cue: "Hold briefly with wrists straight." },
        { label: "Lower", cue: "Lower slowly, keeping upper arms supported." },
        { label: "Return", cue: "Stop just short of locking your elbows." },
      ],
      null,
      2
    )
  );
})();
