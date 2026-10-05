const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const template = await sharp(
    path.join(path.resolve(process.argv[2] || "."), "1-master.png")
  )
    .extract({ left: 790, top: 840, width: 85, height: 64 })
    .removeAlpha()
    .raw()
    .toBuffer();
  const input = JSON.parse(
      fs.readFileSync(
        path.join(path.resolve(process.argv[2] || "."), "equipment-pilot.json"),
        "utf8"
      )
    ),
    results = [];
  for (const [i, n] of [1, 2, 3, 4, 3, 2].entries()) {
    const { data, info } = await sharp(
      path.join(path.resolve(process.argv[2] || "."), `review-${i + 1}.png`)
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let match = -1;
    for (let top = 300; top <= 840; top++) {
      let ok = true;
      for (let y = 0; y < 64 && ok; y++) {
        const p = ((top + y) * info.width + 790) * 3;
        if (
          !data
            .subarray(p, p + 85 * 3)
            .equals(template.subarray(y * 85 * 3, (y + 1) * 85 * 3))
        )
          ok = false;
      }
      if (ok) {
        match = top;
        break;
      }
    }
    if (match < 0) throw Error("Rigid packet template absent in " + (i + 1));
    const row = input.evidence[n - 1],
      measuredRise = 840 - match;
    if (measuredRise !== row.selectedPacketRise)
      throw Error("Packet placement differs");
    const [tx, ty] = row.pulleyGeometry.tangent,
      [ax, ay] = row.attachment,
      samples = [];
    for (let k = 0; k < 9; k++) {
      const y = Math.round(ty + (ay - ty) * (0.35 + k * 0.0625)),
        expectedX = tx + ((ax - tx) * (y - ty)) / (ay - ty);
      let sum = 0,
        weighted = 0;
      for (
        let x = Math.floor(expectedX) - 4;
        x <= Math.ceil(expectedX) + 4;
        x++
      ) {
        const p = (y * info.width + x) * 3,
          v = Math.min(data[p], data[p + 1], data[p + 2]);
        if (v > 35) {
          sum += v;
          weighted += v * (x + 0.5);
        }
      }
      if (!sum) throw Error("Cable absent");
      const observedX = weighted / sum;
      samples.push({ y, expectedX, observedX, error: observedX - expectedX });
    }
    const maxCableCentreError = Math.max(
      ...samples.map((s) => Math.abs(s.error))
    );
    if (maxCableCentreError > 1)
      throw Error("Cable centre mismatch " + maxCableCentreError);
    if (Math.abs(row.cableLengthResidual) > 1)
      throw Error("Cable length conservation exceeds pixel tolerance");
    results.push({
      frame: i + 1,
      measuredPacketRise: measuredRise,
      rigidPacketInteriorExact: true,
      maxCableCentreError,
      cableLengthResidual: row.cableLengthResidual,
      samples,
    });
  }
  fs.writeFileSync(
    path.join(
      path.resolve(process.argv[2] || "."),
      "mechanics-verification.json"
    ),
    JSON.stringify(
      {
        method:
          "Independent final-pixel search for exact original packet interior; nine luminance-centroid cable checks per image; conservation of both tangent lengths and changing wrap arcs. Pulley circles and carabiner endpoints are manually selected visible landmarks; tolerances are image-space, not a calibrated real-world machine.",
        results,
      },
      null,
      2
    )
  );
  console.log(
    results.map(
      ({
        frame,
        measuredPacketRise,
        maxCableCentreError,
        cableLengthResidual,
      }) => ({
        frame,
        measuredPacketRise,
        maxCableCentreError,
        cableLengthResidual,
      })
    )
  );
})();
