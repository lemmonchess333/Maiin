const workDir = require("node:path").resolve(process.argv[2] || ".");
const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
const files = [
  "1-push-grips-candidate.png",
  "2-push-color-candidate.png",
  "3-push-travel-candidate.png",
  "4-rope-scene-candidate.png",
  "5-rope-draw-candidate.png",
  "6-rope-travel-candidate.png",
];
(async () => {
  const report = [];
  for (let i = 0; i < 6; i++) {
    const src = path.join(workDir, files[i]);
    let out = await sharp(src).png().toBuffer();
    const boxes = [];
    if (i >= 3) {
      const shift = [0, -73, -121][i - 3];
      for (const q of [
        { x: 1033 + shift, w: 27, oldY: 454, newY: 401 },
        { x: 1058 + shift, w: 29, oldY: 473, newY: 450 },
      ]) {
        const cap = await sharp(src)
          .extract({ left: q.x, top: q.oldY, width: q.w, height: 9 })
          .png()
          .toBuffer();
        const shaft = await sharp(src)
          .extract({ left: q.x, top: 520, width: q.w, height: q.oldY - q.newY })
          .png()
          .toBuffer();
        out = await sharp(out)
          .composite([
            { input: shaft, left: q.x, top: q.newY + 9 },
            { input: cap, left: q.x, top: q.newY },
          ])
          .png()
          .toBuffer();
        boxes.push({
          left: q.x,
          top: q.newY,
          width: q.w,
          height: q.oldY - q.newY + 9,
        });
      }
    }
    if (i > 0) {
      const dx = [0, 43, 81, 0, -75, -123][i];
      const plate = await sharp(path.join(workDir, files[0]))
        .extract({ left: 1110, top: 640, width: 192, height: 127 })
        .png()
        .toBuffer();
      out = await sharp(out)
        .composite([{ input: plate, left: 1110 + dx, top: 640 }])
        .png()
        .toBuffer();
      boxes.push({ left: 1110 + dx, top: 640, width: 192, height: 127 });
    }
    const raw0 = await sharp(src).removeAlpha().raw().toBuffer(),
      raw1 = await sharp(out).removeAlpha().raw().toBuffer();
    let outside = 0,
      changed = 0;
    for (let y = 0; y < 1024; y++)
      for (let x = 0; x < 1536; x++) {
        let k = (y * 1536 + x) * 3;
        if (
          raw0[k] !== raw1[k] ||
          raw0[k + 1] !== raw1[k + 1] ||
          raw0[k + 2] !== raw1[k + 2]
        ) {
          changed++;
          if (
            !boxes.some(
              (b) =>
                x >= b.left &&
                x < b.left + b.width &&
                y >= b.top &&
                y < b.top + b.height
            )
          )
            outside++;
        }
      }
    if (outside) throw Error("Changes outside equipment repair");
    fs.writeFileSync(path.join(workDir, `review-${i + 1}.png`), out);
    report.push({
      frame: i + 1,
      source: files[i],
      equipmentBoxes: boxes,
      changedPixels: changed,
      changedOutsideEquipment: outside,
    });
  }
  fs.writeFileSync(
    path.join(workDir, "equipment-repair-report.json"),
    JSON.stringify(report, null, 2)
  );
})();
