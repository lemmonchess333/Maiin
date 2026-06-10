#!/usr/bin/env node
/**
 * Pre-deploy Secret Manager checklist for Cloud Functions.
 *
 * Statically enumerates every secret the functions actually bind via
 * `defineSecret("NAME")` (firebase-functions/params). This is the
 * authoritative list an operator MUST provision in Secret Manager
 * before a `functions/` deploy — per the safety gate documented in
 * CLAUDE.md + docs/LAUNCH_TODO.md: a deploy that references a bound
 * secret which isn't provisioned FAILS. Better to learn the full list
 * from source in one command than to grep by hand or discover a missing
 * secret mid-deploy.
 *
 * Read-only static analysis — no gcloud, no network, no Firebase login.
 * Run it anywhere:
 *
 *   node scripts/check-required-secrets.mjs        # or: npm run secrets:check
 *
 * It prints the deduped secret list (with declaring files) and the exact
 * `firebase functions:secrets:set` commands to provision them. Then
 * verify what's already set with:
 *
 *   firebase functions:secrets:access <NAME>   # (errors if unset)
 *
 * Exit code: 0 when ≥1 secret found, 1 if none (a likely sign the parse
 * broke or the secret-binding convention changed — fail loud, don't
 * silently report "nothing to provision").
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "functions",
);

/** Recursively collect functions/ .js files, skipping node_modules + tests. */
function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

// `defineSecret("NAME")` / `defineSecret('NAME')` — the only way a secret
// becomes a deploy-time requirement in firebase-functions v7.
const DEFINE_SECRET_RE = /defineSecret\(\s*["']([^"']+)["']\s*\)/g;

// Secrets that are conditional, not always-required — flagged so the
// operator doesn't provision them needlessly. Heuristic by name; extend
// if the convention grows.
const ROTATION_ONLY = new Set(["BILLING_PREVIOUS_HMAC_SECRET"]);

const files = collectJsFiles(FUNCTIONS_DIR);
const secrets = new Map(); // name -> Set<relative file>

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = file.slice(file.indexOf("functions/"));
  let m;
  while ((m = DEFINE_SECRET_RE.exec(src)) !== null) {
    const name = m[1];
    if (!secrets.has(name)) secrets.set(name, new Set());
    secrets.get(name).add(rel);
  }
}

const names = [...secrets.keys()].sort();
const required = names.filter((n) => !ROTATION_ONLY.has(n));
const rotationOnly = names.filter((n) => ROTATION_ONLY.has(n));

console.log(
  `\nSecret Manager secrets bound by functions/ (defineSecret) — ${names.length} total:\n`,
);
for (const name of required) {
  console.log(`  • ${name}`);
  console.log(`      declared in: ${[...secrets.get(name)].join(", ")}`);
}
if (rotationOnly.length > 0) {
  console.log(`\n  Rotation-only (provision ONLY during a key rotation):`);
  for (const name of rotationOnly) {
    console.log(`  • ${name}`);
    console.log(`      declared in: ${[...secrets.get(name)].join(", ")}`);
  }
}

console.log(`\nProvision the always-required set before deploying:\n`);
for (const name of required) {
  console.log(`  firebase functions:secrets:set ${name}`);
}
console.log(
  `\nThen confirm each is set (errors if missing):\n` +
    required.map((n) => `  firebase functions:secrets:access ${n}`).join("\n") +
    `\n`,
);

if (names.length === 0) {
  console.error(
    "No defineSecret(...) calls found — the parse may be broken or the " +
      "secret-binding convention changed. Investigate before trusting this list.",
  );
  process.exit(1);
}
