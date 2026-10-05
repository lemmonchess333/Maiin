const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const seq = [1, 2, 3, 4, 3, 2],
    master = path.join(
      path.resolve(process.argv[2] || "."),
      "equipment-pilot-1.png"
    ),
    contacts = [
      { left: 150, top: 1220, width: 190, height: 145 },
      { left: 520, top: 1230, width: 150, height: 180 },
      { left: 415, top: 1230, width: 130, height: 70 },
    ];
  const overlays = await Promise.all(
    contacts.map(async (r) => {
      const mask = Buffer.from(
        `<svg width="${r.width}" height="${r.height}"><defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset="0.16" stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#a)"/></svg>`
      );
      return {
        input: await sharp(master)
          .extract(r)
          .ensureAlpha()
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toBuffer(),
        left: r.left,
        top: r.top,
      };
    })
  );
  for (let i = 0; i < 6; i++) {
    const b = await sharp(
      path.join(
        path.resolve(process.argv[2] || "."),
        `equipment-pilot-${seq[i]}.png`
      )
    )
      .composite(overlays)
      .png()
      .toBuffer();
    await sharp(b)
      .extract({ left: 0, top: 0, width: 1024, height: 1430 })
      .extend({ left: 24, right: 24, top: 0, bottom: 0, background: "#000" })
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        crop: { left: 0, top: 0, width: 1024, height: 1430 },
        padding: { left: 24, right: 24 },
        width: 1072,
        height: 1430,
        contacts,
        sequence: seq,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Brace with the bar near your collarbone." },
        { label: "Initiate", cue: "Press upward with your back supported." },
        { label: "Press", cue: "Keep both wrists above your elbows." },
        { label: "Extend", cue: "Straighten your arms without shrugging." },
        { label: "Lower", cue: "Lower the bar slowly under control." },
        {
          label: "Return",
          cue: "Return toward your collarbone without bouncing.",
        },
      ],
      null,
      2
    )
  );
})();
