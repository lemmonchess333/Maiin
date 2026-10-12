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
      { left: 665, top: 870, width: 145, height: 110 },
      { left: 850, top: 845, width: 160, height: 100 },
    ],
    crop = { left: 50, top: 0, width: 990, height: 1024 },
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
        { label: "Set", cue: "Stagger your stance; face away from pulley." },
        { label: "Curl", cue: "Curl with your elbow behind your torso." },
        { label: "Top", cue: "Bring your hand toward your shoulder." },
        { label: "Hold", cue: "Hold briefly without leaning or shrugging." },
        { label: "Lower", cue: "Lower slowly, keeping your upper arm still." },
        { label: "Return", cue: "Return with the cable still taut." },
      ],
      null,
      2
    )
  );
})();
