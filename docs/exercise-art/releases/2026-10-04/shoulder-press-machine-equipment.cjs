const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const master = path.join(
      path.resolve(process.argv[2] || "."),
      "1-clean-rail-master.png"
    ),
    W = 977,
    H = 1609;
  const files = [
      "1-clean-rail-master.png",
      "2-clean-early-candidate.png",
      "3-clean-mid-candidate.png",
      "4-clean-top-candidate.png",
    ],
    rises = [0, 48, 137, 295];
  const strips = [];
  for (const x of [90, 793]) {
    const base = await sharp(master)
      .extract({ left: x, top: 0, width: 94, height: 1500 })
      .png()
      .toBuffer();
    const rail = await sharp(master)
      .extract({ left: x, top: 650, width: 94, height: 1 })
      .resize({ width: 94, height: 1105, fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
    strips.push({
      input: await sharp(base)
        .composite([{ input: rail, left: 0, top: 95 }])
        .png()
        .toBuffer(),
      left: x,
      top: 0,
    });
  }
  const paths = [
    "M124 423 Q126 420 132 421 L168 421 Q179 423 181 430 L181 479 L171 490 L171 552 Q170 574 161 578 L117 578 Q105 577 104 551 L96 551 Q91 549 91 537 L92 526 Q93 516 97 514 L105 514 L106 501 L124 480 Z",
    "M796 423 Q798 420 809 421 L844 421 Q852 422 853 429 L853 480 L869 499 L872 514 L879 514 Q884 520 884 536 Q884 548 878 551 L872 551 Q872 577 861 578 L817 578 Q806 577 805 552 L805 490 L796 480 Z",
    "M154 518 L211 518 L211 550 L156 550 Q147 544 148 534 Q148 524 154 518 Z",
    "M282 518 L310 518 Q316 514 323 516 Q329 521 329 534 Q329 546 323 550 L314 550 L310 548 L282 548 Z",
    "M649 534 Q649 521 655 516 L664 516 L668 518 L696 518 L696 548 L667 548 Q660 552 655 550 Q649 547 649 534 Z",
    "M766 518 L820 518 Q829 524 829 534 Q829 546 821 550 L766 550 Z",
  ];
  const pieces = [];
  for (const d of paths) {
    const mask = Buffer.from(
      `<svg width="${W}" height="${H}"><path d="${d}" fill="white"/></svg>`
    );
    pieces.push(
      await sharp(master)
        .ensureAlpha()
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer()
    );
  }
  for (let i = 0; i < 4; i++) {
    const overlays = [...strips];
    if (i === 1)
      for (const r of [
        { left: 184, top: 220, width: 609, height: 95 },
        { left: 184, top: 315, width: 125, height: 85 },
        { left: 668, top: 315, width: 125, height: 85 },
        { left: 184, top: 400, width: 29, height: 77 },
        { left: 764, top: 400, width: 29, height: 77 },
      ])
        overlays.push({
          input: await sharp(master).extract(r).png().toBuffer(),
          left: r.left,
          top: r.top,
        });
    for (const p of pieces)
      overlays.push({
        input: await sharp(p)
          .extract({ left: 0, top: rises[i], width: W, height: H - rises[i] })
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
      });
    await sharp(path.join(path.resolve(process.argv[2] || "."), files[i]))
      .composite(overlays)
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `equipment-v2-${i + 1}.png`
        )
      );
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-v2.json"),
    JSON.stringify(
      {
        files,
        rises,
        paths,
        method:
          "Stationary straight rail profiles constructed from one master row. Original rigid equipment alpha silhouettes translated vertically; no moving anatomy transformations. Early bridge copied only in unoccluded fixed regions. Candidate, pending review.",
      },
      null,
      2
    )
  );
})();
