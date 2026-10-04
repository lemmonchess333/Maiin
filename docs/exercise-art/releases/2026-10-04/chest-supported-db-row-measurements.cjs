const sharp = require("sharp"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const { data, info } = await sharp(
      path.join(path.resolve(process.argv[2] || "."), `review-${i}.png`)
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    function edge(l, t, r, b, threshold = 35) {
      let bottom = -1,
        pts = [],
        left = r,
        right = l;
      for (let y = t; y < b; y++)
        for (let x = l; x < r; x++) {
          const k = (y * info.width + x) * info.channels;
          if (Math.min(data[k], data[k + 1], data[k + 2]) > threshold) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            if (y > bottom) {
              bottom = y;
              pts = [];
            }
            if (y === bottom) pts.push(x);
          }
        }
      if (!pts.length) throw Error("Missing contact");
      return { anchor: { x: pts[0], y: bottom }, width: right - left + 1 };
    }
    function shoe(l, t, r, b) {
      const w = r - l,
        h = b - t,
        seen = new Uint8Array(w * h);
      let best = [];
      for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
          const p = yy * w + xx,
            k = ((yy + t) * info.width + xx + l) * info.channels;
          if (seen[p] || Math.min(data[k], data[k + 1], data[k + 2]) <= 80)
            continue;
          const q = [p];
          seen[p] = 1;
          for (let j = 0; j < q.length; j++) {
            const v = q[j],
              x = v % w,
              y = Math.floor(v / w);
            for (const [nx, ny] of [
              [x - 1, y],
              [x + 1, y],
              [x, y - 1],
              [x, y + 1],
            ]) {
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const z = ny * w + nx,
                ki = ((ny + t) * info.width + nx + l) * info.channels;
              if (
                !seen[z] &&
                Math.min(data[ki], data[ki + 1], data[ki + 2]) > 80
              ) {
                seen[z] = 1;
                q.push(z);
              }
            }
          }
          if (q.length > best.length) best = q;
        }
      let left = r,
        right = l,
        bottom = -1,
        bx = -1;
      for (const p of best) {
        const x = (p % w) + l,
          y = Math.floor(p / w) + t;
        left = Math.min(left, x);
        right = Math.max(right, x);
        if (y > bottom || (y === bottom && x < bx)) {
          bottom = y;
          bx = x;
        }
      }
      if (!best.length) throw Error("Missing shoe component");
      return { anchor: { x: bx, y: bottom }, width: right - left + 1 };
    }
    const front = edge(175, 885, 270, 960),
      rear = edge(700, 830, 800, 905),
      far = shoe(670, 680, 850, 805),
      near = shoe(890, 725, 1085, 870);
    rows.push({
      frame: i,
      anchors: {
        frontBenchContact: front.anchor,
        rearBenchContact: rear.anchor,
        farSole: far.anchor,
        nearSole: near.anchor,
      },
      invariantDimensions: {
        benchSupportSpan: Math.hypot(
          rear.anchor.x - front.anchor.x,
          rear.anchor.y - front.anchor.y
        ),
        farShoeWidth: far.width,
        nearShoeWidth: near.width,
      },
    });
  }
  for (const row of rows.slice(1)) {
    for (const k of Object.keys(rows[0].anchors))
      if (
        Math.hypot(
          row.anchors[k].x - rows[0].anchors[k].x,
          row.anchors[k].y - rows[0].anchors[k].y
        ) > 1
      )
        throw Error("Anchor drift " + k);
    for (const k of Object.keys(rows[0].invariantDimensions))
      if (
        Math.abs(
          row.invariantDimensions[k] / rows[0].invariantDimensions[k] - 1
        ) > 0.01
      )
        throw Error("Dimension drift " + k);
  }
  fs.writeFileSync(
    path.join(path.resolve(process.argv[2] || "."), "final-measurements.json"),
    JSON.stringify(rows, null, 2)
  );
  console.log(JSON.stringify(rows));
})();
