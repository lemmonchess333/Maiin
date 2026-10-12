const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const benchPoly =
    "738,530 806,537 812,589 932,803 1057,842 1057,895 523,955 282,905 282,815 622,784 678,660 722,530";
  const foregroundPoly =
    "568,517 675,517 675,627 699,638 716,663 714,693 704,715 669,724 648,708 568,714";
  async function masked(src, poly) {
    const mask = Buffer.from(
      `<svg width="1536" height="1024"><polygon points="${poly}" fill="white"/></svg>`
    );
    return sharp(src)
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  }
  const bench = await masked(
    path.join(path.resolve(process.argv[2] || "."), "2-pad-cleaned.png"),
    benchPoly
  );
  const foot = await sharp(
    path.join(path.resolve(process.argv[2] || "."), "2-pad-cleaned.png")
  )
    .extract({ left: 430, top: 875, width: 105, height: 85 })
    .png()
    .toBuffer();
  const names = ["1-pad-cleaned.png", "2-pad-cleaned.png", "3-recovered.png"];
  for (let i = 1; i <= 3; i++) {
    const src = path.join(path.resolve(process.argv[2] || "."), names[i - 1]),
      overlays = [{ input: bench }, { input: foot, left: 430, top: 875 }];
    if (i === 1) overlays.push({ input: await masked(src, foregroundPoly) });
    await sharp(src)
      .composite(overlays)
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `${i}-bench-pilot.png`)
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "bench-pilot.json"),
    JSON.stringify(
      {
        reference: "2-pad-cleaned.png",
        benchPoly,
        foregroundPoly,
        method:
          "Equipment-only lower metalwork master-copy polygon and front-foot rectangle (430,875,105,85); no brightness filtering, no pad-tip overlay; original foreground arm/weight pixels restored without transformation in start pose. Pilot requires native join and occlusion inspection before use.",
      },
      null,
      2
    )
  );
})();
