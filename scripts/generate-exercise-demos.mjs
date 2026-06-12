#!/usr/bin/env node
/**
 * Exercise visual-demo generator — D-LIFT-20 pilot. OPERATOR-RUN, NOT CI.
 *
 * Generates a consistent "coach" start + finish keyframe per lift via Google's
 * Nano Banana (Gemini 2.5 Flash Image), for QA + manual commit. See
 * docs/exercise-demo-pilot.md for the full workflow and the hard rule:
 *
 *   A WRONG demo is worse than none. Every frame MUST be eyeballed against the
 *   exercise's instructions before its `media` is wired into exercises.ts.
 *   This script only PRODUCES candidates; a human gates them.
 *
 * Usage:
 *   GEMINI_API_KEY=… node scripts/generate-exercise-demos.mjs --limit 30
 *
 * Output:
 *   public/exercise-demos/<id>/{start,finish}.<ext>  + manifest.json
 *
 * Requires Node 18+ (global fetch). No npm deps.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "public/exercise-demos");
const MODEL = "gemini-2.5-flash-image"; // "Nano Banana"
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Curated pilot set — the big compounds + most-used accessories. Keep ≤ ~30;
// scale only after the first batch passes QA.
const TOP_LIFTS = [
  "bench-press",
  "incline-db-press",
  "overhead-press",
  "db-shoulder-press",
  "barbell-row",
  "db-row",
  "lat-pulldown",
  "pull-ups",
  "squat",
  "front-squat",
  "leg-press",
  "romanian-deadlift",
  "deadlift",
  "hip-thrust",
  "bulgarian-split",
  "barbell-curl",
  "db-curl",
  "hammer-curl",
  "rope-tricep-pushdown",
  "overhead-extension",
  "lateral-raise",
  "calf-raise",
];

// Same figure + framing every time → a consistent demo set, not 30 strangers.
const COACH_STYLE =
  "Clean minimal fitness illustration of the SAME athletic male coach every " +
  "time: short dark hair, fitted grey t-shirt and black shorts, neutral light-" +
  "grey studio background, side three-quarter camera angle, soft flat lighting, " +
  "full body in frame, no text or watermark. Anatomically correct joints and grip.";

function exerciseInfo(id, src) {
  // Tolerant block parse: name + instructions for one entry. Operator skeleton —
  // falls back to the id if the block can't be read.
  const block = src.split(`id: "${id}"`)[1]?.split(/\n  \{/)[0] ?? "";
  const name = block.match(/name:\s*"([^"]+)"/)?.[1] ?? id;
  const instructions = [...block.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => s.length > 25) // crude: instruction sentences, not field values
    .slice(0, 5);
  return { name, instructions };
}

async function generate(prompt, baseImage) {
  const parts = [{ text: prompt }];
  if (baseImage)
    parts.push({
      inlineData: { mimeType: baseImage.mime, data: baseImage.data },
    });
  const res = await fetch(`${API}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const json = await res.json();
  const img = json.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData
  )?.inlineData;
  if (!img) throw new Error("no image in response");
  return { mime: img.mimeType, data: img.data };
}

const ext = (mime) =>
  mime.includes("webp") ? "webp" : mime.includes("jpeg") ? "jpg" : "png";

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Set GEMINI_API_KEY. This script is operator-run, never CI.");
    process.exit(1);
  }
  const limit = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 30;
  const src = readFileSync(resolve(ROOT, "src/lib/exercises.ts"), "utf8");
  const manifest = {};

  for (const id of TOP_LIFTS.slice(0, limit)) {
    const { name, instructions } = exerciseInfo(id, src);
    const cue = instructions.length ? ` Form: ${instructions.join(" ")}` : "";
    console.log(`→ ${id} (${name})`);
    try {
      const start = await generate(
        `${COACH_STYLE} The coach is at the START position of a ${name}.${cue}`
      );
      // Edit the start frame into the finish → keeps the same figure.
      const finish = await generate(
        `Keep this exact coach, style and framing. Now show the FINISH/end ` +
          `position of a ${name}.${cue}`,
        start
      );
      const dir = resolve(OUT_DIR, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, `start.${ext(start.mime)}`),
        Buffer.from(start.data, "base64")
      );
      writeFileSync(
        resolve(dir, `finish.${ext(finish.mime)}`),
        Buffer.from(finish.data, "base64")
      );
      manifest[id] = [
        `exercise-demos/${id}/start.${ext(start.mime)}`,
        `exercise-demos/${id}/finish.${ext(finish.mime)}`,
      ];
    } catch (e) {
      console.error(`  ✗ ${id}: ${e.message}`);
    }
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log(
    `\nDone. QA every frame in ${OUT_DIR} against the instructions, delete/regen ` +
      `bad ones, then wire the reviewed ids' media into src/lib/exercises.ts.`
  );
}

main();
