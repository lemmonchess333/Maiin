/** Local rig preview: renders each RIG_DEMOS keyframe (+ midpoints) to PNG
 *  via sharp so the figure can be eyeballed without a browser.
 *  Usage: npx tsx scripts/preview-rig.ts [outDir] */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { RIG_DEMOS, renderRigSvg, samplePose } from "../src/lib/demoRig";

const out = resolve(process.argv[2] ?? "/tmp/rig-preview");
mkdirSync(out, { recursive: true });

const BG_DARK = { r: 26, g: 26, b: 31, alpha: 1 }; // #1A1A1F card

async function main() {
  for (const [id, demo] of Object.entries(RIG_DEMOS)) {
    for (const t of [0, 0.5, 1]) {
      const svg = renderRigSvg(samplePose(demo.keyframes, t), demo.tint, demo.equipment);
      await sharp(Buffer.from(svg))
        .resize(360, 450)
        .flatten({ background: BG_DARK })
        .png()
        .toFile(resolve(out, `${id}-${t === 0 ? "top" : t === 1 ? "bottom" : "mid"}.png`));
    }
    console.log(`rendered ${id}`);
  }
}
main();
