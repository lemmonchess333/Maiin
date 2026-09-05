#!/usr/bin/env node
/**
 * Dist-size ratchet — run after `npm run build`.
 *
 * `chunkSizeWarningLimit: 1100` in vite.config.ts is a raised WARNING, not a
 * budget: nothing fails when a chunk grows. This does. Every emitted JS
 * chunk is keyed by its name with the content hash stripped
 * (`maplibre-CD43ZB1R.js` → `maplibre`) and compared against
 * `dist-size.baseline.json`:
 *
 *   - a chunk more than GROWTH_TOLERANCE above its baseline fails (small
 *     chunks get an absolute allowance instead — a 200-byte icon chunk
 *     moving 5% is noise, a 400 kB vendor chunk moving 5% is not);
 *   - a NEW chunk at or above LARGE_CHUNK fails (name it deliberately);
 *     smaller new chunks are listed and pass — every lazy component is its
 *     own chunk here, and adding one is normal;
 *   - the TOTAL more than GROWTH_TOLERANCE above baseline fails;
 *   - shrinkage never fails, and is reported so the baseline can be lowered.
 *
 * Bumping the baseline is allowed — in the same PR as the growth, with the
 * reason in the PR body. `node scripts/check-dist-size.mjs --update`
 * rewrites the baseline from the current dist.
 */
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = resolve(root, "dist/assets");
const baselinePath = resolve(root, "scripts/dist-size.baseline.json");
const GROWTH_TOLERANCE = 0.05;
/** Below this, growth is judged against SMALL_ALLOWANCE bytes, not a percentage. */
const LARGE_CHUNK = 20 * 1024;
const SMALL_ALLOWANCE = 2 * 1024;

if (!existsSync(assetsDir)) {
  console.error(
    `check-dist-size: ${assetsDir} not found — run \`npm run build\` first.`
  );
  process.exit(2);
}

/** chunk name → bytes, hash stripped; same-name chunks (rare) are summed. */
const sizes = {};
for (const file of readdirSync(assetsDir)) {
  if (!file.endsWith(".js")) continue;
  const name = file.replace(/-[A-Za-z0-9_-]{8}\.js$/, "").replace(/\.js$/, "");
  sizes[name] = (sizes[name] ?? 0) + statSync(resolve(assetsDir, file)).size;
}
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
const sorted = Object.fromEntries(
  Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b))
);

if (process.argv.includes("--update")) {
  writeFileSync(
    baselinePath,
    JSON.stringify(
      { tolerance: GROWTH_TOLERANCE, total, chunks: sorted },
      null,
      2
    ) + "\n"
  );
  console.log(
    `check-dist-size: baseline written (${Object.keys(sorted).length} chunks, ${kb(total)} total).`
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const failures = [];
const shrunk = [];
const added = [];
for (const [name, bytes] of Object.entries(sorted)) {
  const base = baseline.chunks[name];
  if (base == null) {
    if (bytes >= LARGE_CHUNK)
      failures.push(
        `${name}: new ${kb(bytes)} chunk — add it to scripts/dist-size.baseline.json deliberately`
      );
    else added.push(`${name}: new ${kb(bytes)} chunk`);
    continue;
  }
  const growth = (bytes - base) / base;
  const allowed = Math.max(base * GROWTH_TOLERANCE, SMALL_ALLOWANCE);
  if (bytes - base > allowed) {
    failures.push(
      `${name}: ${kb(base)} → ${kb(bytes)} (+${(growth * 100).toFixed(1)}%, allowed +${kb(allowed)})`
    );
  } else if (growth < -GROWTH_TOLERANCE && base >= LARGE_CHUNK) {
    shrunk.push(
      `${name}: ${kb(base)} → ${kb(bytes)} (${(growth * 100).toFixed(1)}%)`
    );
  }
}
for (const name of Object.keys(baseline.chunks)) {
  if (!(name in sorted))
    shrunk.push(
      `${name}: gone (was ${kb(baseline.chunks[name])}) — remove it from the baseline`
    );
}

if (total - baseline.total > baseline.total * GROWTH_TOLERANCE) {
  failures.push(
    `total: ${kb(baseline.total)} → ${kb(total)} (+${(((total - baseline.total) / baseline.total) * 100).toFixed(1)}%, tolerance ${GROWTH_TOLERANCE * 100}%)`
  );
}
console.log(
  `check-dist-size: ${Object.keys(sorted).length} chunks, ${kb(total)} total (baseline ${kb(baseline.total)}).`
);
if (added.length)
  console.log(
    `  new small chunks (add to the baseline when convenient):\n    ${added.join("\n    ")}`
  );
if (shrunk.length)
  console.log(
    `  smaller than baseline (lower it to lock in):\n    ${shrunk.join("\n    ")}`
  );
if (failures.length) {
  console.error(
    `check-dist-size: FAIL\n    ${failures.join("\n    ")}\n  If the growth is intended, run \`node scripts/check-dist-size.mjs --update\` in the same PR and say why in its body.`
  );
  process.exit(1);
}
console.log("check-dist-size: OK");

function kb(n) {
  return `${(n / 1024).toFixed(1)} kB`;
}
