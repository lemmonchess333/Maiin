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
      { left: 828, top: 830, width: 170, height: 100 },
      { left: 1030, top: 840, width: 165, height: 125 },
    ],
    crop = { left: 270, top: 0, width: 950, height: 1024 },
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
          "Common crop/padding and exact planted shoe copies. No moving anatomy transformed.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Pin your elbow beside your ribs." },
        { label: "Press", cue: "Push down with a straight wrist." },
        {
          label: "Lockout",
          cue: "Straighten your arm without moving your elbow.",
        },
        { label: "Hold", cue: "Keep your shoulder and torso still." },
        { label: "Return", cue: "Return slowly, keeping the cable taut." },
        { label: "Reset", cue: "Bend your elbow under control." },
      ],
      null,
      2
    )
  );
})();
