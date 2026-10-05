const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = [
      "routing-pilot-1.png",
      "routing-pilot-2.png",
      "routing-pilot-3.png",
    ],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 830, top: 840, width: 155, height: 105 },
      { left: 985, top: 865, width: 140, height: 115 },
    ],
    crop = { left: 280, top: 0, width: 880, height: 1024 },
    padding = { left: 0, right: 0, top: 32, bottom: 0, background: "#000" };
  const overlays = await Promise.all(
    contacts.map(async (r) => {
      const data = await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[0])
      )
        .extract(r)
        .ensureAlpha()
        .raw()
        .toBuffer();
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < r.width; x++)
          data[(y * r.width + x) * 4 + 3] = Math.round((255 * y) / 20);
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
        contactTopFadePixels: 20,
        crop,
        padding,
        scope:
          "Common crop/padding and exact planted-shoe copies; no moving anatomy transformations.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Grip underhand; keep tension in the cable." },
        { label: "Curl", cue: "Curl upward with elbows at your sides." },
        { label: "Top", cue: "Bring the bar toward your shoulders." },
        { label: "Hold", cue: "Hold briefly without leaning or shrugging." },
        { label: "Lower", cue: "Lower slowly, keeping your elbows still." },
        { label: "Return", cue: "Return with the cable still taut." },
      ],
      null,
      2
    )
  );
})();
