const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = ["1-master.png", "2-mid-candidate.png", "3-top-candidate.png"],
    rise = [0, 300, 387],
    regions = [
      { left: 0, top: 630, width: 210, height: 250 },
      { left: 810, top: 630, width: 214, height: 250 },
      { left: 210, top: 736, width: 44, height: 34 },
      { left: 774, top: 736, width: 36, height: 34 },
    ];
  const pieces = await Promise.all(
    regions.map((r) =>
      sharp(path.join(path.resolve(process.argv[2] || "."), files[0]))
        .extract(r)
        .png()
        .toBuffer()
    )
  );
  for (let i = 0; i < 3; i++)
    await sharp(path.join(path.resolve(process.argv[2] || "."), files[i]))
      .composite(
        regions.map((r, j) => ({
          input: pieces[j],
          left: r.left,
          top: r.top - rise[i],
        }))
      )
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `equipment-${i + 1}.png`
        )
      );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-framing.json"),
    JSON.stringify(
      {
        files,
        rise,
        regions,
        scope:
          "Exact master plate/collar/exposed shaft regions translated vertically; no hand or anatomy copies. Original bar centres752,452,365.",
      },
      null,
      2
    )
  );
})();
