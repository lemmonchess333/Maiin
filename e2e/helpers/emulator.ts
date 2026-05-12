/**
 * Strict emulator-gate helper shared by Playwright auth.spec.ts and
 * scripts/seed-e2e-user.ts. Single source of truth so the two
 * surfaces can't drift — a stricter check in one and a lax check
 * in the other is exactly how this suite kept silently skipping in
 * CI for hours during the previous session.
 *
 * What this gates on:
 *   - E2E_AUTH_EMULATOR === "1"            (operator opt-in flag)
 *   - FIREBASE_AUTH_EMULATOR_HOST          matches firebase.json
 *   - FIRESTORE_EMULATOR_HOST              matches firebase.json
 *
 * Hostname normalisation: `localhost:9099` and `127.0.0.1:9099` are
 * treated as equivalent, since firebase.json defaults to 127.0.0.1
 * but developers commonly export the env var as `localhost`. Without
 * this normalisation the spec silently skipped and CI looked green.
 *
 * Read firebase.json via fs.readFileSync rather than JSON import
 * because neither tsconfig.app.json nor tsconfig.node.json enables
 * `resolveJsonModule`. The shape `{ emulators: { auth: { port }, firestore: { port } } }`
 * doesn't carry a `host` field today; both default to 127.0.0.1
 * per the Firebase CLI docs.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface EmulatorEntry {
  host?: string;
  port?: number;
}

interface FirebaseJson {
  emulators?: {
    auth?: EmulatorEntry;
    firestore?: EmulatorEntry;
  };
}

// __dirname isn't defined in ESM. Resolve relative to this file's
// URL so the helper works whether Playwright loads it via tsx
// (ESM) or whatever loader future infra picks up.
const __filenameLocal = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filenameLocal);

const firebaseJsonPath = join(__dirnameLocal, "..", "..", "firebase.json");
const firebaseJson = JSON.parse(
  readFileSync(firebaseJsonPath, "utf8"),
) as FirebaseJson;

const authEmu = firebaseJson.emulators?.auth ?? {};
const firestoreEmu = firebaseJson.emulators?.firestore ?? {};

export const EXPECTED_AUTH_HOST = `${authEmu.host ?? "127.0.0.1"}:${authEmu.port ?? 9099}`;
export const EXPECTED_FIRESTORE_HOST = `${firestoreEmu.host ?? "127.0.0.1"}:${firestoreEmu.port ?? 8080}`;

function normalizeHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  // Treat `localhost:9099` and `127.0.0.1:9099` as equivalent.
  return host.replace(/^localhost:/, "127.0.0.1:");
}

export const emulatorActive =
  process.env.E2E_AUTH_EMULATOR === "1" &&
  normalizeHost(process.env.FIREBASE_AUTH_EMULATOR_HOST) === EXPECTED_AUTH_HOST &&
  normalizeHost(process.env.FIRESTORE_EMULATOR_HOST) === EXPECTED_FIRESTORE_HOST;

/**
 * Fail-loud variant for seed scripts. Silent skip is dangerous in
 * a script that mutates auth/firestore state — a misconfigured env
 * looking like success would leave the suite running against a
 * non-local target.
 */
export function assertEmulatorEnvOrExit(): void {
  if (emulatorActive) return;

  console.error(
    `[emulator] Refusing to run.\n` +
      `  Expected E2E_AUTH_EMULATOR=1\n` +
      `  Expected FIREBASE_AUTH_EMULATOR_HOST=${EXPECTED_AUTH_HOST}\n` +
      `  Expected FIRESTORE_EMULATOR_HOST=${EXPECTED_FIRESTORE_HOST}\n` +
      `  Received E2E_AUTH_EMULATOR=${process.env.E2E_AUTH_EMULATOR ?? "<unset>"}\n` +
      `  Received FIREBASE_AUTH_EMULATOR_HOST=${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "<unset>"}\n` +
      `  Received FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST ?? "<unset>"}\n` +
      `  Boot emulators first via:\n` +
      `    firebase emulators:start --only auth,firestore`,
  );

  process.exit(1);
}
