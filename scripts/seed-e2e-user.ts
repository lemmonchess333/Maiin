#!/usr/bin/env node
/**
 * E2E test-user seed script — runs against the Firebase Auth + Firestore
 * emulators to provision the user that auth.spec.ts (PR P) signs in as.
 *
 * Why this script exists:
 *   PR P's auth.spec.ts drives the real Login form with hardcoded
 *   creds (e2e-test@tropos.test / test-password-123) and waits for
 *   the post-auth redirect off /login. Without a seeded user in the
 *   emulator, the form submit rejects ("user-not-found") and every
 *   test fails. This script idempotently creates the user + a
 *   hydrated Firestore profile so the authenticated routes have
 *   real data to render.
 *
 * Idempotent:
 *   - Auth user: createUser on first run; getUserByEmail + ignore
 *     on subsequent runs.
 *   - Firestore profile: set(..., {merge: true}) so re-runs don't
 *     wipe local edits.
 *
 * Operator setup:
 *   1. Boot the emulators:
 *        firebase emulators:start --only auth,firestore
 *   2. Export the emulator hosts so firebase-admin targets them
 *      instead of production:
 *        export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *        export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   3. Run this script:
 *        npm run seed:e2e
 *   4. Verify in the emulator UI (http://127.0.0.1:4000) that:
 *        - Auth shows e2e-test@tropos.test
 *        - Firestore has users/{uid} populated
 *   5. Run the gated E2E suite:
 *        E2E_AUTH_EMULATOR=1 npm run test:e2e -- auth.spec.ts
 *
 * Safety:
 *   Refuses to run when neither emulator env var is set. This script
 *   provisions a known-credential user with a known password —
 *   running it against a production Auth project would be a backdoor.
 *   The check below fails fast if either emulator host is missing
 *   so a fat-finger doesn't seed prod.
 */

/* firebase-admin v13 uses CJS `export = admin` for the namespace
   entrypoint. Under tsx's ESM mode, `import * as admin from
   "firebase-admin"` returns a wrapper namespace where `admin.apps`
   is undefined; the modular `firebase-admin/app` / `firebase-admin/auth`
   / `firebase-admin/firestore` entry points are pure ESM and resolve
   cleanly. Use those. */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";

// Single source of truth for "is this an emulator session?". The
// helper reads firebase.json so the expected hosts stay in lockstep
// with the emulator config and the auth.spec.ts gate. Bails the
// process loudly on misconfiguration (silent skip on a seed script
// would create a known-credential user against the wrong target).
assertEmulatorEnvOrExit();

const TEST_USER = {
  email: "e2e-test@tropos.test",
  password: "test-password-123",
  displayName: "E2E Tester",
} as const;

const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";

if (!getApps().length) {
  // No credentials needed against the emulator — projectId alone is
  // sufficient. firebase-admin honours the *_EMULATOR_HOST env vars
  // automatically when initialised this way.
  initializeApp({ projectId: PROJECT_ID });
}

const auth = getAuth();
const db = getFirestore();

async function ensureUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(TEST_USER.email);
    console.log(`[seed-e2e-user] User exists: ${existing.uid}`);
    return existing.uid;
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  const created = await auth.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    displayName: TEST_USER.displayName,
    emailVerified: true,
  });
  console.log(`[seed-e2e-user] Created user: ${created.uid}`);
  return created.uid;
}

async function ensureProfile(uid: string): Promise<void> {
  // Profile shape mirrors createDefaultProfile() in src/lib/auth.tsx
  // with `onboardingComplete: true` so the AuthProvider routes the
  // E2E user straight onto Home rather than into Onboarding. Adding
  // a new required UserProfile field? Add it here too or the
  // authenticated routes will hydrate with defaults and the spec
  // may behave differently from a real signup flow.
  const profile = {
    uid,
    displayName: TEST_USER.displayName,
    email: TEST_USER.email,
    photoURL: null,
    athleteType: "Lifter",
    weightKg: 70,
    heightCm: 170,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 10,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    darkMode: false,
    onboardingComplete: true,
    subscriptionTier: "free",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    adjustCaloriesForTraining: true,
    program: { goal: "recomp", startWeight: 70, currentPhase: "base" },
    targetCalories: 2200,
    targetProtein: 160,
    targetCarbs: 250,
    targetFat: 60,
  };
  await db.collection("users").doc(uid).set(profile, { merge: true });
  // Public mirror — cross-user readable projection (PR G architecture).
  // Kept in sync with PUBLIC_MIRRORED_FIELDS in auth.tsx.
  await db
    .collection("users")
    .doc(uid)
    .collection("public")
    .doc("profile")
    .set(
      {
        uid,
        displayName: TEST_USER.displayName,
        displayNameLower: TEST_USER.displayName.toLowerCase(),
        photoURL: null,
        athleteType: "Lifter",
        currentStreak: 0,
        longestStreak: 0,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`[seed-e2e-user] Profile written for ${uid}`);
}

async function main() {
  const uid = await ensureUser();
  await ensureProfile(uid);
  console.log(`[seed-e2e-user] Done. Login as ${TEST_USER.email} with the shared E2E password.`);
}

main().catch((err) => {
  console.error("[seed-e2e-user] Failed:", err);
  process.exit(1);
});
