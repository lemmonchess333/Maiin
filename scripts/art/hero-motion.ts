/**
 * Turn a clip from gemini-video.py into one of Home's hero animations: the
 * drawing's frames, each keyed out of the black backdrop exactly as the
 * still cut-outs are (keying.ts), set in one box so the figure does not
 * jump between frames, and packed into one sprite sheet the hero plays as
 * a flipbook.
 *
 *   npx tsx scripts/art/hero-motion.ts --clip clip.mp4 --id run-easy \
 *     --still form-art/run-easy.webp [--fps 12] [--from 0] [--to 9] \
 *     [--then up.mp4] [--play-fps 12] [--highlight running] [--preview p.mp4]
 *
 * A lift is made in two halves, each between two reviewed form frames
 * (the card's position and the other end of the rep), so the rep reaches
 * the lockout and the full stretch the form guide shows: --clip runs from
 * the card's position to the other end and --then runs back, its first
 * frame (the other end again) dropped. --fps samples the clips and
 * --play-fps plays the loop, so a rep made slowly can play at a lifting
 * pace.
 *
 * Without --to it only lists every frame's likeness to the first (1 is
 * identical), so the loop's end can be chosen where the motion comes back
 * to its start: a stride for a runner, a rep for a lift. The frames from
 * --from up to, not including, --to are the loop.
 *
 * Writes public/form-art/motion/<id>.webp (the sheet, `cols` frames a row)
 * and docs/exercise-art/motion/<id>/frames.json (its layout, the still it
 * animates, and the clip's and sheet's hashes), then regenerates
 * src/lib/heroMotion.data.ts from every frames.json, which is where the
 * hero finds a still's flipbook (heroMotionFor). --preview also writes a
 * review video of the loop on the dark card colour, three times round.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { LONG_SIDE, contentBox, cutOut } from "./keying";
import { RUNNING_CORAL, recolourHighlight } from "./recolour";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CARD = "#17171B";

const { values } = parseArgs({
  options: {
    clip: { type: "string" },
    id: { type: "string" },
    fps: { type: "string", default: "12" },
    from: { type: "string", default: "0" },
    to: { type: "string" },
    highlight: { type: "string" },
    still: { type: "string" },
    preview: { type: "string" },
    then: { type: "string" },
    "play-fps": { type: "string" },
  },
});
if (!values.clip || !values.id) {
  throw new Error("--clip and --id are required");
}
if (!/^[a-z0-9-]+$/.test(values.id)) throw new Error("--id: a-z, 0-9 and -");
const fps = Number(values.fps);
const playFps = Number(values["play-fps"] ?? values.fps);
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** src/lib/heroMotion.data.ts, from every animation's frames.json. */
function writeRegistry() {
  const dir = resolve(ROOT, "docs/exercise-art/motion");
  // Each animation is a folder holding its frames.json; the README beside
  // them is not one.
  const rows = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => JSON.parse(readFileSync(join(dir, id, "frames.json"), "utf8")))
    .map(
      (f) =>
        `  ${JSON.stringify(f.still)}: { src: ${JSON.stringify(f.src)}, ` +
        `still: ${JSON.stringify(f.still)}, frames: ${f.frames}, fps: ${f.fps}, ` +
        `frameWidth: ${f.frameWidth}, frameHeight: ${f.frameHeight}, ` +
        `cols: ${f.cols}, sha256: ${JSON.stringify(f.sha256)} },`
    );
  const file = resolve(ROOT, "src/lib/heroMotion.data.ts");
  const current = readFileSync(file, "utf8");
  const head = current.slice(0, current.indexOf("export const HERO_MOTION"));
  writeFileSync(
    file,
    `${head}export const HERO_MOTION: Readonly<Record<string, HeroMotionSheet>> = {\n${rows.join("\n")}\n};\n`
  );
  execFileSync("npx", ["prettier", "--write", file], { stdio: "ignore" });
}

const work = mkdtempSync(join(tmpdir(), "hero-motion-"));
try {
  const extract = (clip: string, prefix: string) => {
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-i",
      clip,
      "-vf",
      `fps=${fps},format=rgb24`,
      join(work, `${prefix}%04d.png`),
    ]);
    return readdirSync(work)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".png"))
      .sort()
      .map((f) => join(work, f));
  };
  const files = [
    ...extract(values.clip, "a"),
    // The second half starts where the first ended: its first frame is a
    // repeat.
    ...(values.then ? extract(values.then, "b").slice(1) : []),
  ];

  if (values.to === undefined) {
    // Likeness of each frame to the first, on a small grey thumbnail.
    const thumb = (f: string) =>
      sharp(f).greyscale().resize(64, 64, { fit: "fill" }).raw().toBuffer();
    const first = await thumb(files[0]);
    for (let i = 0; i < files.length; i++) {
      const t = await thumb(files[i]);
      let diff = 0;
      for (let p = 0; p < t.length; p++) diff += Math.abs(t[p] - first[p]);
      const likeness = 1 - diff / (t.length * 255);
      console.log(
        `${String(i).padStart(3)}  ${(i / fps).toFixed(2)} s  ${likeness.toFixed(4)}`
      );
    }
    console.log(`\n${files.length} frames at ${fps} fps; choose --to.`);
  } else {
    const from = Number(values.from);
    const to = Number(values.to);
    if (!values.still) throw new Error("--still: the cut-out it animates");
    const loop = files.slice(from, to);
    if (loop.length < 2) throw new Error("the loop needs at least two frames");

    const keyed = [];
    for (const file of loop) {
      const frame = await cutOut(file);
      if (values.highlight === "running")
        recolourHighlight(frame.rgba, RUNNING_CORAL);
      keyed.push(frame);
    }
    const { width, height } = keyed[0];
    // One box round every frame, so the figure stays put between them.
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    for (const frame of keyed) {
      const box = contentBox(frame.rgba, width, height);
      x0 = Math.min(x0, box.left);
      y0 = Math.min(y0, box.top);
      x1 = Math.max(x1, box.left + box.width);
      y1 = Math.max(y1, box.top + box.height);
    }
    const box = { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
    const scale = Math.min(1, LONG_SIDE / Math.max(box.width, box.height));
    const frameWidth = Math.round(box.width * scale);
    const frameHeight = Math.round(box.height * scale);
    const tiles = await Promise.all(
      keyed.map((frame) =>
        sharp(frame.rgba, { raw: { width, height, channels: 4 } })
          .extract(box)
          .resize(frameWidth, frameHeight, { kernel: "lanczos3" })
          .png()
          .toBuffer()
      )
    );

    const cols = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / cols);
    const sheet = await sharp({
      create: {
        width: cols * frameWidth,
        height: rows * frameHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        tiles.map((input, i) => ({
          input,
          left: (i % cols) * frameWidth,
          top: Math.floor(i / cols) * frameHeight,
        }))
      )
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toBuffer();

    const out = `form-art/motion/${values.id}.webp`;
    mkdirSync(resolve(ROOT, "public/form-art/motion"), { recursive: true });
    writeFileSync(resolve(ROOT, "public", out), sheet);
    const docs = resolve(ROOT, "docs/exercise-art/motion", values.id);
    mkdirSync(docs, { recursive: true });
    const layout = {
      src: out,
      still: values.still.replace(/^\//, ""),
      frames: tiles.length,
      fps: playFps,
      frameWidth,
      frameHeight,
      cols,
      clipFrames: [from, to],
      clipSha256: sha256(readFileSync(values.clip)),
      ...(values.then ? { thenSha256: sha256(readFileSync(values.then)) } : {}),
      sha256: sha256(sheet),
    };
    writeFileSync(
      join(docs, "frames.json"),
      JSON.stringify(layout, null, 2) + "\n"
    );
    writeRegistry();
    console.log(
      `${out}: ${tiles.length} frames of ${frameWidth}x${frameHeight}, ` +
        `${cols} a row, ${(sheet.length / 1024).toFixed(0)} KB`
    );

    if (values.preview) {
      // The loop three times round on the dark card, for review.
      const shots = mkdtempSync(join(tmpdir(), "hero-preview-"));
      for (let i = 0; i < tiles.length * 3; i++) {
        await sharp({
          create: {
            width: frameWidth + 40,
            height: frameHeight + 40,
            channels: 4,
            background: CARD,
          },
        })
          .composite([{ input: tiles[i % tiles.length], left: 20, top: 20 }])
          .png()
          .toFile(join(shots, `${String(i).padStart(4, "0")}.png`));
      }
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-framerate",
        String(playFps),
        "-i",
        join(shots, "%04d.png"),
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-pix_fmt",
        "yuv420p",
        values.preview,
      ]);
      rmSync(shots, { recursive: true, force: true });
      console.log(`preview: ${values.preview}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
