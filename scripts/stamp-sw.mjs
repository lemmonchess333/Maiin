/**
 * Stamp the built service worker with a per-deploy build id.
 *
 * WHY: browsers only fire the SW update cycle (installing → activated →
 * register-sw's "New version available" toast) when the BYTES of sw.js
 * change. public/sw.js is a static hand-written file whose only churn was a
 * manual CACHE_NAME bump ("tropos-vN") — so deploys that didn't touch sw.js
 * produced NO update event and NO refresh toast, and a long-lived session
 * (SPA routing + iOS resume-from-memory) could run days-old code without
 * ever being told. Stamping every build makes each deploy byte-different,
 * so foregrounding the app detects the update and the toast fires.
 *
 * Runs as part of `npm run build` / `build:hosting` (after vite build).
 * Fails soft: a missing dist/sw.js or placeholder logs a warning but never
 * breaks the build (unit-test builds etc.).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SW_PATH = "dist/sw.js";
const PLACEHOLDER = "__TROPOS_BUILD__";

function buildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return `local-${Date.now()}`;
  }
}

if (!existsSync(SW_PATH)) {
  console.warn(`[stamp-sw] ${SW_PATH} not found — skipping`);
  process.exit(0);
}

const src = readFileSync(SW_PATH, "utf8");
if (!src.includes(PLACEHOLDER)) {
  console.warn(`[stamp-sw] placeholder ${PLACEHOLDER} missing — skipping`);
  process.exit(0);
}

const id = buildId();
writeFileSync(SW_PATH, src.replaceAll(PLACEHOLDER, id));
console.log(`[stamp-sw] stamped ${SW_PATH} with build ${id}`);
