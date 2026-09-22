/**
 * Cut a screen recording into the Pro demo loop the offer page plays.
 *
 * The offer page (`ProDemoVideo`) plays whatever `proDemoVideoManifest.ts` lists
 * from `public/pro-demo/`. The recording it wants is the real app doing
 * the thing Pro sells — Food, the camera, a real plate, the result, then
 * Home's target — about ten seconds, recorded on a phone. This script
 * turns that recording into the pair of files the manifest expects:
 *
 *  - crops the status bar (the clock, the carrier, the battery: the
 *    recorder's private details, and not the product) — `--top=<px>`
 *    sets the cut, default 5.6% of the height, the status bar's share
 *    of a modern iPhone screen;
 *  - scales to 720 px wide, keeps ≤30 fps, caps at 15 s, drops audio;
 *  - writes H.264 MP4 (plays everywhere, listed first) and VP9 WebM
 *    (smaller where it plays), and reports their sizes against the
 *    ~2 MB budget the manifest documents.
 *
 * The step it cannot do is the recording. Record on the Pro tier so the
 * camera is live, and keep the demo account's data plain — the frame is
 * a paywall, and every pixel of it is public.
 *
 * Usage: node scripts/cut-pro-demo.mjs <recording.mp4|.mov> [--top=<px>]
 * Needs `ffmpeg` on PATH, or `FFMPEG=/path/to/ffmpeg`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const [input, ...flags] = process.argv.slice(2);
if (!input || !existsSync(input)) {
  console.error(
    "Usage: node scripts/cut-pro-demo.mjs <recording> [--top=<px>]"
  );
  process.exit(2);
}
const topFlag = flags.find((f) => f.startsWith("--top="));
const top = topFlag ? Number(topFlag.slice("--top=".length)) : null;
if (top !== null && !(Number.isInteger(top) && top >= 0)) {
  console.error("--top must be a whole number of pixels");
  process.exit(2);
}

const outDir = resolve("public/pro-demo");
mkdirSync(outDir, { recursive: true });
const BUDGET_BYTES = 2 * 1024 * 1024;
const MAX_SECONDS = 15;

// Crop expression: a fixed cut when given, else the status bar's share.
const cut = top === null ? "round(ih*0.056/2)*2" : String(top);
const filter = [
  `crop=iw:ih-${cut}:0:${cut}`,
  "scale=720:-2:flags=lanczos",
  "fps=min(30\\,source_fps)",
].join(",");

const common = [
  "-y",
  "-i",
  input,
  "-t",
  String(MAX_SECONDS),
  "-an",
  "-vf",
  filter,
];
const targets = [
  {
    file: "scan.mp4",
    args: [
      "-c:v",
      "libx264",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "28",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
    ],
  },
  {
    file: "scan.webm",
    args: [
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "38",
      "-b:v",
      "0",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
    ],
  },
];

let total = 0;
for (const t of targets) {
  const out = resolve(outDir, t.file);
  execFileSync(ffmpeg, [...common, ...t.args, out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const bytes = statSync(out).size;
  total += bytes;
  console.log(`${t.file}: ${(bytes / 1024).toFixed(0)} KB`);
}
console.log(
  `total: ${(total / 1024 / 1024).toFixed(2)} MB (budget ${(BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB)`
);
if (total > BUDGET_BYTES) {
  console.log(
    "over budget — raise the CRFs, or trim the recording, before listing these"
  );
}
console.log(`
Now list them in src/components/paywall/proDemoVideoManifest.ts:

  export const PRO_DEMO_SOURCES: readonly ProDemoSource[] = [
    { path: "pro-demo/scan.mp4", type: "video/mp4" },
    { path: "pro-demo/scan.webm", type: "video/webm" },
  ];
`);
