/**
 * The drawings a Live Activity shows (Wid2 call 1): poses cut from Home's
 * hero flipbooks into the widget extension's asset catalog.
 *
 *   npm run art:live-activity
 *
 * A Live Activity plays no clip, so the card shows one pose and changes it
 * on each update. The poses are frames of the flipbook the hero already
 * plays (public/form-art/motion/<id>.webp, laid out by
 * docs/exercise-art/motion/<id>/frames.json), so the Lock Screen and Home
 * draw the same figure.
 *
 * Writes ios/App/LiveActivities/Assets.xcassets: one image set per pose,
 * named `<id>-pose-<n>`, at 2x and 3x of POSE_HEIGHT_PT. ActivityKit
 * refuses a card whose image is larger than the card, so the height is
 * well inside the Lock Screen card's 160 pt; `liveActivityArt.test.ts`
 * holds the sizes and the names the app sends.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  LIVE_ACTIVITY_POSES,
  POSE_HEIGHT_PT,
  poseAssetName,
  type LiveActivityArtId,
} from "../../src/lib/liveActivityArt";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CATALOG = resolve(ROOT, "ios/App/LiveActivities/Assets.xcassets");
const SCALES = [2, 3] as const;

interface Frames {
  src: string;
  frames: number;
  frameWidth: number;
  frameHeight: number;
  cols: number;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

rmSync(CATALOG, { recursive: true, force: true });
mkdirSync(CATALOG, { recursive: true });
writeFileSync(
  resolve(CATALOG, "Contents.json"),
  json({ info: { author: "xcode", version: 1 } })
);

const ids = Object.keys(LIVE_ACTIVITY_POSES) as LiveActivityArtId[];
for (const id of ids) {
  const frameIndexes = LIVE_ACTIVITY_POSES[id];
  const layout = JSON.parse(
    readFileSync(
      resolve(ROOT, "docs/exercise-art/motion", id, "frames.json"),
      "utf8"
    )
  ) as Frames;
  const sheet = resolve(ROOT, "public", layout.src);
  for (const [pose, frame] of frameIndexes.entries()) {
    if (frame >= layout.frames)
      throw new Error(`${id}: frame ${frame} of ${layout.frames}`);
    const name = poseAssetName(id, pose);
    const dir = resolve(CATALOG, `${name}.imageset`);
    mkdirSync(dir, { recursive: true });
    const cut = await sharp(sheet)
      .extract({
        left: (frame % layout.cols) * layout.frameWidth,
        top: Math.floor(frame / layout.cols) * layout.frameHeight,
        width: layout.frameWidth,
        height: layout.frameHeight,
      })
      .png()
      .toBuffer();
    for (const scale of SCALES) {
      const height = POSE_HEIGHT_PT * scale;
      const width = Math.round(
        (height * layout.frameWidth) / layout.frameHeight
      );
      const png = await sharp(cut)
        .resize(width, height, { kernel: "lanczos3" })
        .png({ compressionLevel: 9, palette: false })
        .toBuffer();
      writeFileSync(resolve(dir, `${name}@${scale}x.png`), png);
    }
    writeFileSync(
      resolve(dir, "Contents.json"),
      json({
        images: SCALES.map((scale) => ({
          filename: `${name}@${scale}x.png`,
          idiom: "universal",
          scale: `${scale}x`,
        })),
        info: { author: "xcode", version: 1 },
      })
    );
    console.log(`${name}: frame ${frame} of ${id}`);
  }
}
