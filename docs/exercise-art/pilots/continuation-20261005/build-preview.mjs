import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const batch = "docs/exercise-art/pilots/continuation-20261005";
const manifest = JSON.parse(readFileSync(`${batch}/MANIFEST.json`, "utf8"));
const selected = manifest.completeDraftSets.find(
  (set) => set.exerciseId === "bulgarian-split"
);
if (!selected || selected.frames.length !== 6) {
  throw new Error("Expected the selected six-frame Bulgarian draft");
}
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
for (const [index, frame] of selected.frames.entries()) {
  if (
    frame.frame !== index + 1 ||
    hash(readFileSync(frame.path)) !== frame.sha256
  ) {
    throw new Error(`Selected frame ${index + 1} changed`);
  }
}

const output = `${batch}/bulgarian-split-preview.gif`;
const result = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    "5/6",
    "-start_number",
    "1",
    "-i",
    path.join(batch, "bulgarian-split/frames/%d.png"),
    "-frames:v",
    "6",
    "-filter_complex",
    "[0:v]scale=768:512:flags=lanczos,split[a][b];[b]palettegen=stats_mode=full[p];[a][p]paletteuse=dither=sierra2_4a",
    "-loop",
    "0",
    output,
  ],
  { stdio: "inherit" }
);
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`ffmpeg exited ${result.status}`);

writeFileSync(
  `${batch}/preview.json`,
  JSON.stringify(
    {
      kind: "standalone sequence preview",
      releaseApproved: false,
      actualPlayerEvidence: false,
      description:
        "Six selected PNGs shown in order at 1.2 seconds per frame, then looped 6-to-1. This downscaled GIF is not mobile light/dark, reduced-motion, loading or app-player evidence. Native selected PNGs remain unchanged.",
      dimensions: [768, 512],
      frameDurationMs: 1200,
      file: output,
      sha256: hash(readFileSync(output)),
      sourceFrames: selected.frames.map(({ frame, path, sha256 }) => ({
        frame,
        path,
        sha256,
      })),
    },
    null,
    2
  ) + "\n"
);
console.log(`Created ${output}`);
