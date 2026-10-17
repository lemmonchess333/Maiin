const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = [
      "1-recovered.png",
      "2-recovered.png",
      "3-recovered.png",
      "4-guided-candidate.png",
    ],
    seq = [1, 2, 3, 4, 3, 2],
    crop = { left: 250, top: 230, width: 520, height: 1240 },
    contacts = [
      { left: 345, top: 1320, width: 165, height: 95 },
      { left: 510, top: 1340, width: 145, height: 110 },
    ];
  const overlays = await Promise.all(
    contacts.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[0])
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  for (let i = 0; i < 6; i++) {
    const b = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[seq[i] - 1])
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
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        crop,
        contacts,
        sequence: seq,
        files,
        scope:
          "Common crop and stationary shoe source copies only, no moving anatomy edits.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Set", cue: "Hold light dumbbells in front of thighs." },
        { label: "Row", cue: "Lead with elbows, keeping weights below them." },
        {
          label: "Rotate",
          cue: "Rotate upward, keeping elbows at shoulder height.",
        },
        { label: "Press", cue: "Press overhead without arching your back." },
        {
          label: "Lower",
          cue: "Lower slowly until your forearms are upright.",
        },
        {
          label: "Reverse",
          cue: "Rotate down, then lower toward your thighs.",
        },
      ],
      null,
      2
    )
  );
})();
