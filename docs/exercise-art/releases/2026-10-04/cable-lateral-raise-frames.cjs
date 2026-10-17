const fs = require("node:fs"),
  path = require("node:path"),
  sharp = require("sharp");
(async () => {
  const files = [
    "1-master.png",
    "2-early-candidate.png",
    "3-mid-candidate.png",
    "4-top-candidate.png",
  ];
  const seq = [1, 2, 3, 4, 3, 2];
  for (let i = 0; i < 6; i++)
    fs.copyFileSync(
      path.join(path.resolve(process.argv[2] || "."), files[seq[i] - 1]),
      path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
    );
  const thumbs = await Promise.all(
    seq.map(async (n, i) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), files[n - 1])
      )
        .resize({ width: 256 })
        .png()
        .toBuffer(),
      left: (i % 3) * 256,
      top: Math.floor(i / 3) * 384,
    }))
  );
  await sharp({
    create: { width: 768, height: 768, channels: 3, background: "#000" },
  })
    .composite(thumbs)
    .png()
    .toFile(
      path.join(path.resolve(process.argv[2] || "."), "contact-sheet.png")
    );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "rows.json"),
    JSON.stringify(
      [
        { label: "Tension", cue: "Stand tall with the cable taut." },
        {
          label: "Initiate",
          cue: "Raise your arm without bending your elbow.",
        },
        { label: "Raise", cue: "Keep your torso still as you lift." },
        {
          label: "Shoulder height",
          cue: "Stop at shoulder height without shrugging.",
        },
        { label: "Lower", cue: "Lower slowly with your elbow angle fixed." },
        { label: "Control", cue: "Maintain tension as your arm returns." },
      ],
      null,
      2
    )
  );
})();
