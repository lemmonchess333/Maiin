const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const names = [
    "1-master.png",
    "2-early-candidate.png",
    "3-mid-candidate.png",
    "4-peak-candidate.png",
  ];
  const master = path.join(path.resolve(process.argv[2] || "."), names[0]);
  const machine = await sharp(
    path.join(path.resolve(process.argv[2] || "."), "machine-empty.png")
  )
    .extract({ left: 710, top: 0, width: 314, height: 1536 })
    .png()
    .toBuffer();
  // Equipment-only: preserve the actual five-slab packet, its collars and selector pin.
  const packetPoly =
    "784,828 805,823 805,817 823,817 823,827 826,827 826,817 834,817 834,828 853,829 853,822 871,822 871,832 881,835 881,916 784,909";
  const packetFull = await sharp(master)
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from(
          `<svg width="1024" height="1536"><polygon points="${packetPoly}" fill="white"/></svg>`
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
  const packet = await sharp(packetFull)
    .extract({ left: 784, top: 817, width: 98, height: 100 })
    .png()
    .toBuffer();
  // A one-pixel row of unchanged uprights/rails/background, extended only in the equipment region.
  const exit = [627, 128],
    attachments = [
      [585, 191],
      [546, 286],
      [517, 480],
      [498, 581],
    ];
  const centre = [650, 141],
    radius = 24,
    outgoingAngle = 4.84;
  const geometry = attachments.map(([x, y]) => {
    const dx = x - centre[0],
      dy = y - centre[1],
      d = Math.hypot(dx, dy),
      theta = Math.atan2(dy, dx) + Math.acos(radius / d);
    return {
      tangent: [
        centre[0] + radius * Math.cos(theta),
        centre[1] + radius * Math.sin(theta),
      ],
      theta,
      length:
        Math.sqrt(d * d - radius * radius) + radius * (outgoingAngle - theta),
    };
  });
  const lengths = geometry.map((g) => g.length);
  function stackGeometry(rise) {
    const x = 830,
      y = 817 - rise,
      dx = x - 827,
      dy = y - 165,
      d = Math.hypot(dx, dy),
      r = 26,
      theta = Math.atan2(dy, dx) - Math.acos(r / d);
    return {
      attachment: [x, y],
      tangent: [827 + r * Math.cos(theta), 165 + r * Math.sin(theta)],
      length: Math.sqrt(d * d - r * r) + r * (theta + Math.PI / 2),
    };
  }
  const initialStackLength = stackGeometry(0).length;
  const evidence = [];
  for (let i = 0; i < 4; i++) {
    const payout = lengths[i] - lengths[0];
    let lo = 0,
      hi = 600;
    for (let n = 0; n < 40; n++) {
      const mid = (lo + hi) / 2;
      if (initialStackLength - stackGeometry(mid).length < payout) lo = mid;
      else hi = mid;
    }
    const rise = Math.round((lo + hi) / 2),
      stack = stackGeometry(rise);
    const cable = Buffer.from(
      `<svg width="1024" height="1536"><path d="M ${stack.tangent.join(" ")} L ${stack.attachment.join(" ")}" stroke="#727272" stroke-width="3" fill="none"/><path d="M ${stack.tangent.join(" ")} L ${stack.attachment.join(" ")}" stroke="#b0b0b0" stroke-width="1" fill="none"/></svg>`
    );
    await sharp(path.join(path.resolve(process.argv[2] || "."), names[i]))
      .composite([
        { input: machine, left: 710, top: 0 },
        { input: cable },
        { input: packet, left: 784, top: 817 - rise },
      ])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `equipment-pilot-${i + 1}.png`
        )
      );
    evidence.push({
      pose: i + 1,
      source: names[i],
      attachment: attachments[i],
      pulleyGeometry: geometry[i],
      stackGeometry: stack,
      cableLengthIncludingWrap: lengths[i],
      selectedPacketRise: rise,
      cableLengthResidual: payout + stack.length - initialStackLength,
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json"),
    JSON.stringify(
      {
        status:
          "DRAFT: native seams, cable exit assumptions, handle rigidity and mobile sequence still require review. Not release evidence.",
        method:
          "Exact stationary machine copy; equipment-only rail row extension and rigid packet translation. No anatomy transformations.",
        selectedPlateCount: 5,
        stationaryPlateCount: 12,
        packetPoly,
        exit,
        evidence,
      },
      null,
      2
    )
  );
})();
