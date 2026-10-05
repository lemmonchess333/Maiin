const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const files = [
      "1-master.png",
      "2-without-outgoing.png",
      "3-without-outgoing.png",
    ],
    handles = [
      [616, 562],
      [810, 410],
      [825, 333],
    ],
    top = { x: 271, y: 66, r: 25 },
    low = { x: 321, y: 800, r: 25 },
    master = path.join(path.resolve(process.argv[2] || "."), "1-master.png"),
    connectorLength = 36;
  const wrap = (h) => {
    const dx = h[0] - low.x,
      dy = h[1] - low.y,
      d = Math.hypot(dx, dy),
      angle = Math.atan2(dy, dx) + Math.acos(low.r / d),
      t = [low.x + low.r * Math.cos(angle), low.y + low.r * Math.sin(angle)],
      length = Math.sqrt(d * d - low.r * low.r),
      u = [(h[0] - t[0]) / length, (h[1] - t[1]) / length];
    return {
      angle,
      t,
      u,
      q: [h[0] - connectorLength * u[0], h[1] - connectorLength * u[1]],
      free: length - connectorLength,
      arc: low.r * (Math.PI - angle),
    };
  };
  const stats = handles.map(wrap),
    reference = stats[0].free + stats[0].arc,
    rows = [];
  const tower = await sharp(master)
      .extract({ left: 70, top: 0, width: 330, height: 1024 })
      .png()
      .toBuffer(),
    selectedSource = { left: 187, top: 458, width: 105, height: 78 },
    stack = await sharp(master).extract(selectedSource).png().toBuffer(),
    profile = await sharp(master)
      .extract({ left: 187, top: 200, width: 105, height: 1 })
      .resize(105, 455, { fit: "fill", kernel: "nearest" })
      .png()
      .toBuffer();
  for (let i = 0; i < 3; i++) {
    const s = stats[i],
      rise = Math.round(s.free + s.arc - reference),
      stackTop = 458 - rise,
      cap = 448 - rise,
      h = handles[i],
      q = s.q,
      t = s.t;
    let base = await sharp(
      path.join(path.resolve(process.argv[2] || "."), files[i])
    )
      .composite([
        { input: tower, left: 70, top: 0 },
        { input: profile, left: 187, top: 130 },
      ])
      .png()
      .toBuffer();
    const erase = Buffer.from(
      `<svg width="1536" height="1024"><rect x="253" y="30" width="67" height="76" fill="black"/><rect x="294" y="103" width="35" height="663" fill="black"/><rect x="297" y="767" width="60" height="68" fill="black"/><path d="M337 781L399 734 ${i === 0 ? "M337 781L578 592L610 567" : ""}" stroke="black" stroke-width="17" fill="none"/></svg>`
    );
    base = await sharp(base)
      .composite([
        { input: erase },
        {
          input: Buffer.from(
            '<svg width="1536" height="1024"><rect x="300" y="720" width="110" height="53" fill="black"/><rect x="265" y="87" width="5" height="43" fill="#bbb"/></svg>'
          ),
        },
      ])
      .png()
      .toBuffer();
    const d = `M246 ${cap}V66 A25 25 0 0 1 296 66V800 A25 25 0 0 0 ${t[0]} ${t[1]}L${q[0]} ${q[1]}`;
    const svg = Buffer.from(
      `<svg width="1536" height="1024"><defs><linearGradient id="metal"><stop stop-color="#383838"/><stop offset=".45" stop-color="#999"/><stop offset="1" stop-color="#444"/></linearGradient></defs><rect x="254" y="29" width="27" height="38" fill="url(#metal)"/><rect x="315" y="803" width="14" height="49" fill="url(#metal)" stroke="#999"/><circle cx="271" cy="66" r="23" fill="url(#metal)" stroke="#aaa"/><circle cx="271" cy="66" r="5" fill="#444" stroke="#bbb"/><circle cx="321" cy="800" r="23" fill="url(#metal)" stroke="#aaa"/><circle cx="321" cy="800" r="5" fill="#444" stroke="#bbb"/><path d="${d}" stroke="#303030" stroke-width="5" fill="none"/><path d="${d}" stroke="#aaa" stroke-width="2" fill="none"/><g transform="matrix(${s.u[0]} ${s.u[1]} ${-s.u[1]} ${s.u[0]} ${q[0]} ${q[1]})"><rect x="0" y="-4" width="36" height="8" rx="4" fill="#222" stroke="#ccc" stroke-width="2"/><path d="M27 -4L31 4" stroke="#888" stroke-width="2"/></g><rect x="242" y="${cap}" width="8" height="12" fill="url(#metal)" stroke="#999"/></svg>`
    );
    await sharp(base)
      .composite([{ input: svg }, { input: stack, left: 187, top: stackTop }])
      .png()
      .toFile(
        path.join(
          path.resolve(process.argv[2] || "."),
          `routing-pilot-${i + 1}.png`
        )
      );
    rows.push({
      pose: i + 1,
      handle: h,
      attachment: q,
      connectorLength,
      lowTangent: t,
      lowWrapRadians: Math.PI - s.angle,
      freeCable: s.free,
      lowArc: s.arc,
      selectedRise: rise,
      selectedTop: stackTop,
      totalVariableLength: cap - top.y + s.arc + s.free,
      conservationError: s.free + s.arc - reference - rise,
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
        unselectedCount: 13,
        selectedSource,
        rows,
        scope:
          "New explicitly constructed coplanar circular-pulley layout. Constant36px connector; tangent+wrap+stack path conserved within0.5px. Not a calibrated3D interpretation of generated perspective. Native pilot review required; no moving anatomy transformed.",
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(rows));
})();
