const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = [
      "1-master.png",
      "2-without-outgoing.png",
      "3-without-outgoing.png",
    ],
    attach = [
      [895, 535],
      [879, 369],
      [889, 292],
    ],
    top = { x: 486, y: 89, r: 26 },
    low = { x: 538, y: 810, r: 26 },
    master = path.join(path.resolve(process.argv[2] || "."), "1-master.png");
  const wrap = (q) => {
    const dx = q[0] - low.x,
      dy = q[1] - low.y,
      d = Math.hypot(dx, dy),
      angle = Math.atan2(dy, dx) + Math.acos(low.r / d);
    return {
      angle,
      tangent: [
        low.x + low.r * Math.cos(angle),
        low.y + low.r * Math.sin(angle),
      ],
      free: Math.sqrt(d * d - low.r * low.r),
      arc: low.r * (Math.PI - angle),
    };
  };
  const stats = attach.map(wrap),
    reference = stats[0].free + stats[0].arc,
    rows = [];
  const tower = await sharp(master)
      .extract({ left: 300, top: 0, width: 355, height: 1024 })
      .png()
      .toBuffer(),
    stack = await sharp(master)
      .extract({ left: 405, top: 559, width: 100, height: 76 })
      .png()
      .toBuffer(),
    stem = await sharp(master)
      .extract({ left: 455, top: 531, width: 12, height: 28 })
      .png()
      .toBuffer(),
    profile = await sharp(master)
      .extract({ left: 405, top: 200, width: 125, height: 1 })
      .resize(125, 555, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
  for (let i = 0; i < 3; i++) {
    const rise = Math.round(stats[i].free + stats[i].arc - reference),
      cap = 531 - rise,
      stackTop = 559 - rise,
      stackBottom = 635 - rise,
      q = attach[i],
      t = stats[i].tangent;
    let base = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[i])
    )
      .composite([
        { input: tower, left: 300, top: 0 },
        { input: profile, left: 405, top: 120 },
      ])
      .png()
      .toBuffer();
    const erase = Buffer.from(
      `<svg width="1536" height="1024"><path d="M530 115 L574 781 M580 805 L655 742 ${i === 0 ? "M580 805 L895 535" : ""}" stroke="black" stroke-width="10" fill="none"/><rect x="530" y="125" width="125" height="645" fill="black"/><rect x="453" y="56" width="26" height="64" fill="black"/><rect x="474" y="60" width="56" height="63" fill="black"/><rect x="525" y="65" width="11" height="60" fill="black"/><rect x="456" y="${stackBottom}" width="10" height="${675 - stackBottom}" fill="black"/><rect x="520" y="773" width="70" height="104" fill="black"/></svg>`
    );
    base = await sharp(base)
      .composite([{ input: erase }])
      .png()
      .toBuffer();
    const defs =
      '<defs><linearGradient id="metal"><stop stop-color="#333"/><stop offset=".45" stop-color="#929292"/><stop offset="1" stop-color="#454545"/></linearGradient><linearGradient id="rail"><stop stop-color="#555"/><stop offset=".5" stop-color="#eee"/><stop offset="1" stop-color="#777"/></linearGradient></defs>';
    const equipment = Buffer.from(
      `<svg width="1536" height="1024">${defs}<rect x="493" y="60" width="30" height="64" fill="url(#metal)"/><rect x="481" y="120" width="4" height="555" fill="url(#rail)"/><rect x="530" y="816" width="16" height="63" fill="url(#metal)" stroke="#999"/><circle cx="486" cy="89" r="24" fill="url(#metal)" stroke="#aaa" stroke-width="1.5"/><circle cx="486" cy="89" r="5" fill="#444" stroke="#bbb"/><circle cx="538" cy="810" r="24" fill="url(#metal)" stroke="#aaa" stroke-width="1.5"/><circle cx="538" cy="810" r="5" fill="#444" stroke="#bbb"/><path d="M460 ${cap} V89 A26 26 0 0 1 512 89 V810 A26 26 0 0 0 ${t[0]} ${t[1]} L${q[0]} ${q[1]}" stroke="#303030" stroke-width="5" fill="none"/><path d="M460 ${cap} V89 A26 26 0 0 1 512 89 V810 A26 26 0 0 0 ${t[0]} ${t[1]} L${q[0]} ${q[1]}" stroke="#aaa" stroke-width="2" fill="none"/></svg>`
    );
    await sharp(base)
      .composite([
        { input: equipment },
        { input: stack, left: 405, top: stackTop },
        { input: stem, left: 455, top: cap },
      ])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `routing-pilot-${i + 1}.png`
        )
      );
    rows.push({
      pose: i + 1,
      attachment: q,
      lowTangent: t,
      lowWrapRadians: Math.PI - stats[i].angle,
      freeCable: stats[i].free,
      lowArc: stats[i].arc,
      selectedRise: rise,
      selectedTop: stackTop,
      totalVariableLength: cap - top.y + stats[i].arc + stats[i].free,
      conservationError: stats[i].free + stats[i].arc - reference - rise,
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "routing-pilot.json"),
    JSON.stringify(
      {
        files,
        top,
        low,
        selectedCount: 4,
        unselectedCount: 10,
        selectedSource: { left: 405, top: 559, width: 100, height: 76 },
        rows,
        scope:
          "New explicitly constructed coplanar circular-pulley illustration, not a calibrated3D interpretation of original generated pulleys. Tangent+wrap+stack path conserved within0.5px. Native pilot review required; no anatomy transformed.",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(rows));
})();
