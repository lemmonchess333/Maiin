/** Local body-demo preview: renders each BODY_DEMOS at t=0/0.5/1 to PNG via
 *  sharp for browserless visual QA. Usage: npx tsx scripts/preview-rig.ts [outDir] */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  BODY_DEMOS,
  renderBodyDemo,
  __unlockSideDemosForPreview,
} from "../src/lib/bodyRig";

// Contact sheets must show DORMANT side demos too — that's how they get
// judged for re-enablement.
__unlockSideDemosForPreview();

const out = resolve(process.argv[2] ?? "/tmp/rig-preview");
mkdirSync(out, { recursive: true });
const BG = { r: 26, g: 26, b: 31, alpha: 1 };

async function main() {
  for (const id of Object.keys(BODY_DEMOS)) {
    // Mirror the in-app effort curve: soft at the top, loading at the
    // bottom, full drive mid-concentric — so the preview shows the
    // highlight breathing, not just the pose.
    for (const [t, effort] of [
      [0, 0.5],
      [0.5, 1],
      [1, 0.8],
    ] as const) {
      const svg = renderBodyDemo(id, t, effort);
      await sharp(Buffer.from(svg), { density: 300 })
        .resize(240, 450, { fit: "contain", background: BG })
        .flatten({ background: BG })
        .png()
        .toFile(
          resolve(
            out,
            `${id}-${t === 0 ? "top" : t === 1 ? "bottom" : "mid"}.png`
          )
        );
    }
    console.log(`rendered ${id}`);
  }
}
main();
