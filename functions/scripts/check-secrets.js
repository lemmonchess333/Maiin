#!/usr/bin/env node
/**
 * secrets:check — the authoritative pre-deploy secret list for `functions/`.
 *
 * A `firebase deploy` that references a secret bound via `runWith({ secrets })`
 * which hasn't been provisioned in Secret Manager FAILS the whole deploy (the
 * safety gate — CLAUDE.md / LAUNCH_TODO #2). The hand-maintained command list in
 * LAUNCH_TODO can drift from what the code actually binds (it did:
 * BILLING_PREVIOUS_HMAC_SECRET is bound on restoreApplePurchases but was only
 * mentioned as "rotation only"). This script reads the source as the single
 * source of truth: every secret in a `runWith({ secrets: [...] })` array must be
 * provisioned, full stop.
 *
 * Output: the exact `firebase functions:secrets:set` commands to run before the
 * first/any functions deploy. Run from `functions/`: `npm run secrets:check`.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/** All .js under functions/, excluding node_modules + __tests__ + scripts. */
function jsFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (["node_modules", "__tests__", "scripts"].includes(name)) continue;
      out.push(...jsFiles(full));
    } else if (name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const files = jsFiles(ROOT);

// 1. Map each `const VAR = defineSecret("NAME")` → { VAR: "NAME" }.
//    `\s` spans newlines, so the multi-line defineSecret(...) form is matched.
const constToName = new Map();
const defineRe =
  /const\s+([A-Za-z_$][\w$]*)\s*=\s*defineSecret\(\s*["']([^"']+)["']/g;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(defineRe)) constToName.set(m[1], m[2]);
}

// 2. Collect every const referenced inside a `runWith({ secrets: [...] })`.
//    These are the secrets that MUST be provisioned or the deploy fails.
const boundConsts = new Set();
const secretsArrayRe = /secrets:\s*\[([\s\S]*?)\]/g;
const fileForSecret = new Map(); // secret name → set of files that bind it
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(secretsArrayRe)) {
    for (const idM of m[1].matchAll(/[A-Za-z_$][\w$]*/g)) {
      const v = idM[0];
      if (!constToName.has(v)) continue;
      boundConsts.add(v);
      const name = constToName.get(v);
      if (!fileForSecret.has(name)) fileForSecret.set(name, new Set());
      fileForSecret.get(name).add(path.basename(file));
    }
  }
}

const boundNames = [...boundConsts].map((v) => constToName.get(v)).sort();
const definedNames = [...constToName.values()].sort();
const definedButUnbound = definedNames.filter((n) => !boundNames.includes(n));

console.log("Secrets BOUND via runWith({ secrets }) — provision ALL of these");
console.log("before the first functions deploy (or the deploy FAILS):\n");
for (const name of boundNames) {
  console.log(
    `  firebase functions:secrets:set ${name}   # bound in: ${[
      ...fileForSecret.get(name),
    ].join(", ")}`
  );
}
console.log(`\n  → ${boundNames.length} bound secret(s).`);

if (definedButUnbound.length) {
  console.log(
    "\nDefined but NOT bound on any function (do NOT need provisioning for deploy):"
  );
  for (const n of definedButUnbound) console.log(`  - ${n}`);
}

console.log(
  "\nVerify what's already set:  firebase functions:secrets:access <NAME>"
);
console.log(
  "Non-secret config (e.g. ADMIN_UIDS, STRIPE_PRICE_ID_*) are plain env vars,"
);
console.log("not Secret Manager — set via functions/.env or --set-env-vars.");
