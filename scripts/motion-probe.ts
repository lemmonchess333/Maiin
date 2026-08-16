/**
 * Temporal-continuity probe for the demo rig.
 *
 * Renders 24 frames per demo and pixelmatches consecutive pairs. A
 * smooth eased animation yields a smooth bell of per-step deltas
 * peaking mid-rep; a POP — an IK branch flip, a sleeve width jump, a
 * draw-order swap — shows as an outlier against its neighbours. Run
 * after any bodyRig/bodySideData/bodyModelData change:
 *
 *   npx tsx scripts/motion-probe.ts
 *
 * A `<-- SPIKE` flag (max > 3x median AND > 400 px) is the signal to
 * go look at those two frames. Baseline 2026-08-15 (pass 28): all 14
 * demos spike-free; maxima 1.3-1.6x median, all at mid-rep steps.
 */
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { renderBodyDemo, BODY_DEMOS } from "../src/lib/bodyRig";

const W = 240;
const STEPS = 24;

async function frames(id: string, vb: string): Promise<PNG[]> {
  const [x, y, w, h] = vb.split(/\s+/).map(Number);
  const H = Math.round((W * h) / w);
  const out: PNG[] = [];
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);
    const svg = renderBodyDemo(id, t).replace(
      /^<svg[^>]*>/,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${W}" height="${H}"><rect x="${x - 50}" y="${y - 50}" width="${w + 100}" height="${h + 100}" fill="#121214"/>`
    );
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    out.push(PNG.sync.read(buf));
  }
  return out;
}

async function main() {
  let spikes = 0;
  for (const id of Object.keys(BODY_DEMOS)) {
    const demo = BODY_DEMOS[id];
    const vb =
      demo.viewBox ??
      (demo.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244");
    const fs = await frames(id, vb);
    const deltas: number[] = [];
    for (let i = 1; i < fs.length; i++) {
      deltas.push(
        pixelmatch(
          fs[i - 1].data,
          fs[i].data,
          undefined,
          fs[i].width,
          fs[i].height,
          {
            threshold: 0.1,
          }
        )
      );
    }
    const sorted = [...deltas].sort((p, q) => p - q);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const max = Math.max(...deltas);
    const argmax = deltas.indexOf(max);
    const spike = max > median * 3 && max > 400;
    if (spike) spikes++;
    console.log(
      `${id.padEnd(22)} median ${String(median).padStart(5)}  max ${String(max).padStart(5)} @ step ${argmax}->${argmax + 1}${spike ? "  <-- SPIKE" : ""}`
    );
  }
  if (spikes > 0) {
    console.error(
      `\n${spikes} demo(s) show a temporal spike — inspect those frame pairs.`
    );
    process.exit(1);
  }
  console.log("\nAll demos temporally smooth.");
}
main();
