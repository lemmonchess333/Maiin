const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const regions = [
    { left: 340, top: 1100, width: 140, height: 125 },
    { left: 525, top: 1100, width: 110, height: 125 },
    { left: 48, top: 1115, width: 232, height: 90 },
  ];
  const patches = await Promise.all(
    regions.map(async (r) => ({
      input: await sharp(
        path.join(path.resolve(process.argv[2] || "."), "1-master.png")
      )
        .extract(r)
        .png()
        .toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  const files = [
    "1-master.png",
    "2-early-candidate.png",
    "3-mid-candidate.png",
    "4-top-candidate.png",
  ];
  for (const [i, n] of [1, 2, 3, 4, 3, 2].entries())
    await sharp(path.join(path.resolve(process.argv[2] || "."), files[n - 1]))
      .composite(patches)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
  fs.writeFileSync(
    path.join(
      path.resolve(process.argv[2] || "."),
      "fixed-contact-restoration.json"
    ),
    JSON.stringify(
      {
        regions,
        method:
          "Exact stationary shoe/floor contacts and machine-base pixels from master. No moving anatomy transformed.",
        sequence: [1, 2, 3, 4, 3, 2],
      },
      null,
      2
    )
  );
})();
