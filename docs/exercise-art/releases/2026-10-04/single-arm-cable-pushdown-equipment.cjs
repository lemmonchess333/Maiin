const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = ["1-master.png", "2-clean.png", "3-without-outgoing.png"],
    handles = [
      [783, 362],
      [800, 431],
      [910, 520],
    ],
    pulley = { x: 635, y: 65, r: 25 },
    connector = 36;
  const stats = handles.map((h) => {
    let dx = h[0] - 635,
      dy = h[1] - 65,
      d = Math.hypot(dx, dy),
      a = Math.atan2(dy, dx) - Math.acos(25 / d),
      t = [635 + 25 * Math.cos(a), 65 + 25 * Math.sin(a)],
      length = Math.sqrt(d * d - 625),
      u = [(h[0] - t[0]) / length, (h[1] - t[1]) / length];
    return {
      h,
      a,
      t,
      u,
      q: [h[0] - 36 * u[0], h[1] - 36 * u[1]],
      free: length - 36,
      arc: 25 * (a + Math.PI / 2),
    };
  });
  const master = path.join(path.resolve(process.argv[2] || "."), files[0]),
    tower = await sharp(master)
      .extract({ left: 300, top: 0, width: 460, height: 1024 })
      .png()
      .toBuffer(),
    selectedSource = { left: 448, top: 530, width: 100, height: 76 },
    stack = await sharp(master).extract(selectedSource).png().toBuffer(),
    profile = await sharp(master)
      .extract({ left: 448, top: 180, width: 100, height: 1 })
      .resize(100, 615, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer(),
    rows = [];
  for (let i = 0; i < 3; i++) {
    const s = stats[i],
      rise = Math.round(s.free + s.arc - stats[0].free - stats[0].arc),
      stackTop = 530 - rise,
      cap = stackTop - 12;
    let base = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[i])
    )
      .composite([
        { input: tower, left: 300, top: 0 },
        { input: profile, left: 448, top: 40 },
      ])
      .png()
      .toBuffer();
    const erase = Buffer.from(
      `<svg width="1536" height="1024"><rect x="608" y="32" width="67" height="67" fill="black"/><path d="M663 81L762 315L783 358 ${i === 1 ? "M663 81L778 380L800 427" : ""}" stroke="black" stroke-width="19" fill="none"/></svg>`
    );
    base = await sharp(base)
      .composite([{ input: erase }])
      .png()
      .toBuffer();
    const d = `M500 ${cap}V65 A25 25 0 0 1 525 40H635 A25 25 0 0 1 ${s.t[0]} ${s.t[1]}L${s.q[0]} ${s.q[1]}`;
    const svg = Buffer.from(
      `<svg width="1536" height="1024"><defs><linearGradient id="m"><stop stop-color="#444"/><stop offset=".5" stop-color="#aaa"/><stop offset="1" stop-color="#555"/></linearGradient></defs><path d="M525 30V65M635 27V65" stroke="#888" stroke-width="12"/><circle cx="525" cy="65" r="23" fill="url(#m)" stroke="#bbb"/><circle cx="635" cy="65" r="23" fill="url(#m)" stroke="#bbb"/><circle cx="525" cy="65" r="5" fill="#444"/><circle cx="635" cy="65" r="5" fill="#444"/><path d="${d}" stroke="#333" stroke-width="5" fill="none"/><path d="${d}" stroke="#aaa" stroke-width="2" fill="none"/><g transform="matrix(${s.u[0]} ${s.u[1]} ${-s.u[1]} ${s.u[0]} ${s.q[0]} ${s.q[1]})"><rect x="0" y="-4" width="36" height="8" rx="4" fill="#222" stroke="#ccc" stroke-width="2"/></g><rect x="496" y="${cap}" width="8" height="12" fill="url(#m)" stroke="#aaa"/></svg>`
    );
    await sharp(base)
      .composite([{ input: svg }, { input: stack, left: 448, top: stackTop }])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `routing-pilot-${i + 1}.png`
        )
      );
    rows.push({
      pose: i + 1,
      handle: s.h,
      tangent: s.t,
      connectorLength: connector,
      freeCable: s.free,
      arc: s.arc,
      selectedRise: rise,
      selectedTop: stackTop,
      conservationError: s.free + s.arc - stats[0].free - stats[0].arc - rise,
    });
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "routing-pilot.json"),
    JSON.stringify(
      {
        files,
        pulley,
        selectedSource,
        rows,
        scope:
          "New explicitly coplanar two-fixed-pulley 1:1 routing; constant connector, tangent+wrap+stack travel conserved within 0.5px. Not a calibrated 3D measurement. Anatomy never transformed. Native review pending.",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(rows));
})();
