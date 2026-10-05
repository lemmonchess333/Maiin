const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const source = path.join(
      path.resolve(process.argv[2] || "."),
      "1-master.png"
    ),
    meta = JSON.parse(
      fs.readFileSync(
        path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json")
      )
    ),
    seq = [0, 1, 2, 3, 2, 1],
    results = [];
  for (let i = 0; i < 6; i++) {
    const checks = [];
    for (const r of meta.pieces) {
      const a = await sharp(source).extract(r).removeAlpha().raw().toBuffer(),
        b = await sharp(
          path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
        )
          .extract({
            ...r,
            left: r.left + 24,
            top: r.top - meta.rises[seq[i]] + 64,
          })
          .removeAlpha()
          .raw()
          .toBuffer();
      checks.push({ region: r, identical: a.equals(b) });
    }
    results.push({ frame: i + 1, checks });
  }
  const failures = results.flatMap((r) =>
    r.checks
      .filter((c) => !c.identical)
      .map((c) => ({ frame: r.frame, region: c.region }))
  );
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-check.json"),
    JSON.stringify(
      {
        results,
        failures,
        scope:
          "Exact source pixels of selected rigid equipment rectangles after translation; visual review still covers grip occlusion and mechanics.",
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({ frames: 6, regionsPerFrame: meta.pieces.length, failures })
  );
  if (failures.length) process.exitCode = 1;
})();
