/**
 * The verify rig's fixed configuration: the emulator project, the seed
 * chain and the build's environment. Kept apart from `rig.ts`, which
 * starts processes, so tests can read these without side effects.
 *
 * Each value is a copy of something CI already runs, and is pinned to it:
 * - `SEED_CHAIN` to the capture job's seeds in `emulator-tests.yml` and
 *   `app-screenshots.yml` (`src/lib/__tests__/captureSeedChain.test.ts`),
 *   because the feature map's anchors are the ones those specs wait on,
 *   against that data;
 * - `BUILD_ENV` to the capture job's build step (`rigConfig.test.ts`),
 *   so the rig serves the bundle the capture specs assert against.
 */

/** The emulators' project. A `demo-` project never reaches a real one. */
export const PROJECT = "demo-tropos";

/** The emulator hosts, as `firebase.json` and `e2e/helpers/emulator.ts`
 *  expect them. */
export const AUTH_HOST = "127.0.0.1:9099";
export const FIRESTORE_HOST = "127.0.0.1:8080";

/** The firebase-tools release CI installs; used through npx when no
 *  `firebase` is on PATH. */
export const FIREBASE_TOOLS = "firebase-tools@15.34.0";

/** What the seed scripts need to write to the emulator, and nothing else. */
export const SEED_ENV = {
  E2E_AUTH_EMULATOR: "1",
  GCLOUD_PROJECT: PROJECT,
  FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
  FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
} as const;

/** The capture job's seeds, in its order. */
export const SEED_CHAIN = [
  "seed:e2e",
  "seed:rich",
  "seed:circles",
  "seed:experience",
  "seed:fellbehind",
  "seed:liftreturn",
  "seed:season",
] as const;

/** The capture job's build environment (`npm run build:e2e`). The
 *  VITE_FIREBASE_* values are placeholders: only the project id has to
 *  match the emulator's. */
export const BUILD_ENV = {
  VITE_USE_EMULATORS: "true",
  VITE_FIREBASE_API_KEY: "emulator-dummy-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-tropos.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-tropos",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-tropos.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  VITE_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000000000",
} as const;

/** The seeded account (`scripts/seed-e2e-user.ts`, `e2e/helpers/auth.ts`). */
export const TEST_EMAIL = "e2e-test@tropos.test";
export const TEST_PASSWORD = "test-password-123";

/** The app's base path (`vite.config.ts`). */
export const BASE_PATH = "/Maiin/";

/** iPhone 14 portrait, the audits' and the capture specs' viewport. */
export const VIEWPORT = { width: 393, height: 852 } as const;
