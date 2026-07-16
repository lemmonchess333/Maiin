/** Local body-demo preview: renders each BODY_DEMOS at the five rig
 *  acceptance samples (t = 0/.25/.5/.75/1) to PNG via sharp for
 *  browserless visual QA, plus a deterministic manifest.json so a
 *  review can be tied to the exact frames it approved.
 *  Usage: npx tsx scripts/preview-rig.ts [outDir] */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
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

// Mirror the in-app effort curve across the five acceptance samples:
// soft at the top, loading through the eccentric, full drive
// mid-concentric, easing into the finish — so the preview shows the
// highlight breathing, not just the pose.
const SAMPLES: ReadonlyArray<readonly [t: number, effort: number]> = [
  [0, 0.5],
  [0.25, 0.75],
  [0.5, 1],
  [0.75, 0.9],
  [1, 0.8],
];

type ManifestFrame = { t: number; effort: number; file: string };

async function main() {
  const manifest: Record<string, ManifestFrame[]> = {};
  for (const id of Object.keys(BODY_DEMOS).sort()) {
    const frames: ManifestFrame[] = [];
    for (const [t, effort] of SAMPLES) {
      const svg = renderBodyDemo(id, t, effort);
      const file = `${id}-t${String(Math.round(t * 100)).padStart(3, "0")}.png`;
      await sharp(Buffer.from(svg), { density: 300 })
        .resize(240, 450, { fit: "contain", background: BG })
        .flatten({ background: BG })
        .png()
        .toFile(resolve(out, file));
      frames.push({ t, effort, file });
    }
    manifest[id] = frames;
    console.log(`rendered ${id} (${frames.length} frames)`);
  }
  // Deterministic (sorted ids, fixed sample order, no timestamps) so two
  // runs against the same source produce identical manifests — a review
  // can reference the manifest as the thing it approved.
  writeFileSync(
    resolve(out, "manifest.json"),
    JSON.stringify({ samples: SAMPLES, demos: manifest }, null, 2)
  );
  console.log(`manifest.json → ${out}`);
}
main();
