const fs = require("node:fs"),
  path = require("node:path"),
  sharp = require("sharp");
(async () => {
  const files = ["1-master.png", "2-drive.png", "3-extend.png"],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 385, top: 345, width: 110, height: 85 },
      { left: 620, top: 848, width: 155, height: 82 },
    ],
    crop = { left: 110, top: 0, width: 1040, height: 960 },
    padding = { left: 24, right: 24, top: 32, bottom: 24 },
    copies = [];
  for (const r of contacts)
    copies.push({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[0])
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    });
  for (let i = 0; i < 3; i++) {
    const fixed = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[i])
    )
      .flatten({ background: "#000" })
      .composite(copies)
      .png()
      .toBuffer();
    await sharp(fixed)
      .extract(crop)
      .extend({ ...padding, background: "#000" })
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
        sequence,
        contacts,
        crop,
        padding,
        scope:
          "Common crop/padding and authorized stationary hand/handle and supporting shoe copies only. Moving anatomy and equipment not transformed.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        ["Set", "Brace and grip the frame for balance."],
        ["Drive", "Move your working leg straight back."],
        ["Extend", "Squeeze your glute without arching your back."],
        ["Squeeze", "Keep your pelvis still at full extension."],
        ["Return", "Bring your leg forward under control."],
        ["Reset", "Keep cable tension before the next repetition."],
      ].map(([label, cue]) => ({ label, cue })),
      null,
      2
    )
  );
})();
