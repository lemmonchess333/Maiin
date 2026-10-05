const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const master = path.join(
    path.resolve(process.argv[2] || "."),
    "1-master.png"
  );
  const data = JSON.parse(
    fs.readFileSync(
      path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json"),
      "utf8"
    )
  );
  const contacts = [
    { left: 391, top: 1146, width: 140, height: 88 },
    { left: 535, top: 1188, width: 165, height: 90 },
    { left: 90, top: 1240, width: 195, height: 110 },
    { left: 290, top: 1190, width: 145, height: 90 },
  ];
  const fixed = await Promise.all(
    contacts.map(async (r) => ({
      input: await sharp(master).extract(r).png().toBuffer(),
      left: r.left,
      top: r.top,
    }))
  );
  const pulley = await sharp(master)
    .extract({ left: 626, top: 115, width: 49, height: 65 })
    .png()
    .toBuffer();
  for (const [i, n] of [1, 2, 3, 4, 3, 2].entries()) {
    const row = data.evidence[n - 1],
      a = row.attachment,
      t = row.pulleyGeometry.tangent;
    const clear = Buffer.from(
      `<svg width="1024" height="1536"><path d="M 627 142 L ${a[0]} ${a[1] - 6}" fill="none" stroke="black" stroke-width="15"/></svg>`
    );
    const cable = Buffer.from(
      `<svg width="1024" height="1536"><path d="M ${t.join(" ")} L ${a.join(" ")}" fill="none" stroke="#636363" stroke-width="3"/><path d="M ${t.join(" ")} L ${a.join(" ")}" fill="none" stroke="#aaaaaa" stroke-width="1"/></svg>`
    );
    await sharp(
      path.join(
        path.resolve(process.argv[2] || "."),
        `equipment-pilot-${n}.png`
      )
    )
      .composite([
        { input: clear },
        { input: pulley, left: 626, top: 115 },
        {
          input: Buffer.from(
            '<svg width="1024" height="1536"><rect x="615" y="119" width="11" height="33" fill="black"/></svg>'
          ),
        },
        { input: cable },
        ...fixed,
      ])
      .png()
      .toFile(
        path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "review-framing.json"),
    JSON.stringify(
      {
        width: 1024,
        height: 1536,
        sequence: [1, 2, 3, 4, 3, 2],
        stationaryContactRegions: contacts,
        fixedPulleyRegion: { left: 626, top: 115, width: 49, height: 65 },
        method:
          "No anatomy transforms. Exact stationary shoe and bench-foot copies; exact fixed machine from generated empty machine template; rigid original plate packet; tangent cable construction.",
      },
      null,
      2
    )
  );
})();
