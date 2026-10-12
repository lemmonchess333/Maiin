const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  for (let i = 1; i <= 6; i++) {
    const file = path.join(
      path.resolve(process.argv[2] || "."),
      `review-${i}.png`
    );
    const input = await sharp(file)
      .extract({ left: 40, top: 170, width: 900, height: 1060 })
      .png()
      .toBuffer();
    fs.writeFileSync(file, input);
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-crop.json"),
    JSON.stringify(
      {
        left: 40,
        top: 170,
        width: 900,
        height: 1060,
        method:
          "Identical whole-scene removal of empty outer black margins; no resizing or local transforms.",
      },
      null,
      2
    )
  );
})();
