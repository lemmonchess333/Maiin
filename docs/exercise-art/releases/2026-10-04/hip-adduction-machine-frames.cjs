const fs = require("node:fs"),
  path = require("node:path"),
  sharp = require("sharp");
(async () => {
  const files = ["1-master.png", "2-middle-clean.png", "3-closed.png"],
    sequence = [1, 2, 3, 3, 2, 1],
    contacts = [
      { left: 300, top: 275, width: 80, height: 90 },
      { left: 780, top: 275, width: 90, height: 90 },
      { left: 320, top: 245, width: 50, height: 30 },
      { left: 810, top: 245, width: 50, height: 30 },
    ],
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
      .extract({ left: 170, top: 0, width: 1170, height: 1024 })
      .extend({ left: 24, right: 24, top: 32, bottom: 24, background: "#000" })
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
        crop: { left: 170, top: 0, width: 1170, height: 1024 },
        padding: { left: 24, right: 24, top: 32, bottom: 24 },
        scope:
          "Common crop/padding and authorized stationary grip-contact copies only; no moving anatomy or equipment transformations.",
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        ["Wide", "Keep your back against the pad."],
        ["Close", "Squeeze your knees inward under control."],
        ["Squeeze", "Bring the pads together without bouncing."],
        ["Hold", "Hold the squeeze with your core braced."],
        ["Open", "Return slowly to the wide position."],
        ["Reset", "Keep tension before the next repetition."],
      ].map(([label, cue]) => ({ label, cue })),
      null,
      2
    )
  );
})();
