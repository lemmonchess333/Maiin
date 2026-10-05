const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const seq = [1, 2, 3, 4, 3, 2],
    crop = { left: 40, top: 15, width: 900, height: 1500 },
    contacts = [
      { left: 240, top: 1350, width: 155, height: 155 },
      { left: 585, top: 1350, width: 155, height: 155 },
      { left: 445, top: 1300, width: 90, height: 95 },
    ];
  const master = path.join(
      path.resolve(process.argv[2] || "."),
      "equipment-v2-1.png"
    ),
    overlays = await Promise.all(
      contacts.map(async (r) => ({
        input: await sharp(master).extract(r).png().toBuffer(),
        left: r.left,
        top: r.top,
      }))
    );
  for (let i = 0; i < 6; i++) {
    const b = await sharp(
      path.join(
        path.resolve(process.argv[2] || "."),
        `equipment-v2-${seq[i]}.png`
      )
    )
      .composite(overlays)
      .png()
      .toBuffer();
    await sharp(b)
      .extract(crop)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-crop.json"),
    JSON.stringify(crop, null, 2)
  );
  fs.writeFileSync(
    path.join(
      path.resolve(process.argv[2] || "."),
      "fixed-contact-restoration.json"
    ),
    JSON.stringify(
      {
        source: "equipment-v2-1.png",
        regions: contacts,
        scope:
          "Exact stationary shoes and machine front base only; no moving anatomy",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Brace with your back against the pad." },
        { label: "Initiate", cue: "Press both handles upward together." },
        { label: "Press", cue: "Keep your wrists stacked over your elbows." },
        { label: "Extend", cue: "Extend your arms without shrugging." },
        { label: "Lower", cue: "Bend your elbows slowly under control." },
        {
          label: "Return",
          cue: "Lower toward shoulder height without bouncing.",
        },
      ],
      null,
      2
    )
  );
})();
