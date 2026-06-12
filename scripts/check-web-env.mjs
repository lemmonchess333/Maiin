#!/usr/bin/env node
/**
 * Web build env guard — fail a PRODUCTION web build when the Firebase client
 * config is missing, instead of silently shipping a site where every sign-in
 * returns `auth/internal-error`.
 *
 * Root cause this prevents: `src/lib/firebase.ts` reads `VITE_FIREBASE_*` and
 * defaults each to `""`. If the GitHub Actions secrets behind those vars are
 * unset, the deploy succeeds but ships a blank Firebase config → blank apiKey →
 * the Identity Toolkit rejects every auth request → "Sign-in is temporarily
 * unavailable" for ALL users. (Sibling of the functions `secrets:check` /
 * "first-deploy secret trap", which only covered Secret Manager secrets.)
 *
 * Skipped for emulator builds (VITE_USE_EMULATORS=true) — those point Firebase
 * at the local emulators and don't need real config.
 *
 * Run in the deploy workflow BEFORE `npm run build`, with the same env block.
 */

// Fatal for auth: without these the client can't talk to Firebase Auth at all.
const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

if (process.env.VITE_USE_EMULATORS === "true") {
  console.log(
    "[check-web-env] Emulator build — skipping Firebase config check."
  );
  process.exit(0);
}

const missing = REQUIRED.filter(
  (k) => !process.env[k] || !process.env[k].trim()
);

if (missing.length > 0) {
  console.error(
    "\n[check-web-env] ✗ Refusing to build — missing Firebase web config:\n" +
      missing.map((k) => `    ${k}`).join("\n") +
      "\n\nThese come from GitHub Actions secrets (Settings → Secrets and " +
      "variables → Actions). Without them the build ships a blank Firebase " +
      "config and EVERY sign-in fails with auth/internal-error.\n" +
      "Set the secret(s), then re-run the deploy.\n"
  );
  process.exit(1);
}

console.log("[check-web-env] ✓ Firebase web config present.");
