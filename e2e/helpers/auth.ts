/**
 * PR P (audit follow-up): authenticated E2E helpers.
 *
 * Drives the real Login form rather than mocking auth state because
 * Firebase persists tokens in localStorage anyway — once the form
 * submits, the AuthProvider hydrates the profile from Firestore
 * automatically. The helper is the same flow a user would take, just
 * scripted.
 *
 * Operator setup (CI or local):
 *   1. Boot the Firebase Auth + Firestore emulators:
 *        firebase emulators:start --only auth,firestore
 *   2. Seed at least one test user with a known email/password and
 *      a hydrated Firestore profile doc at users/{uid}. A minimal
 *      seed script lives at scripts/seed-e2e-user.ts (operator
 *      action: create this script if it doesn't yet exist; see
 *      the PR P notes in the readme for the schema).
 *   3. Export FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST
 *      so the app's Firebase SDK targets the emulator instead of
 *      the production project.
 *   4. Run `npm run test:e2e` — auth.spec.ts will run; other suites
 *      stay green regardless.
 *
 * Without the emulator running, auth.spec.ts skips via the
 * `test.skip(!process.env.E2E_AUTH_EMULATOR)` gate so CI doesn't
 * fall over on the unauthenticated default path.
 */

import { Page, expect } from "@playwright/test";

export const TEST_USER = {
  email: "e2e-test@tropos.test",
  password: "test-password-123",
};

/**
 * Signs in via the real Login form. Times out after 15s waiting for
 * the auth redirect to /. If the form rejects (wrong creds, network
 * error), the redirect never happens and the test fails clearly
 * rather than silently proceeding as anon.
 */
export async function signInAsTestUser(
  page: Page,
  creds: { email: string; password: string } = TEST_USER,
): Promise<void> {
  // Navigate to the root rather than '/login'. Playwright's URL
  // resolution against baseURL replaces the entire path when the
  // argument starts with '/' — so `page.goto('/login')` resolves to
  // `http://localhost:4173/login` and DROPS the `/Maiin/` base path
  // the SPA is mounted under. Going to '/' uses baseURL as-is
  // (`http://localhost:4173/Maiin/`) and the unauthed route
  // catch-all (`path="*"`) renders the same Login form.
  await page.goto("/");
  // Wait for the SPA to finish booting + AuthProvider to resolve.
  // Without this, the form locator races against the React render
  // pass that happens after Firebase emits its initial auth state.
  await page.waitForLoadState("networkidle");
  await page.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
  await page.fill("#login-email", creds.email);
  await page.fill("#login-password", creds.password);
  // Submit by clicking the email submit button (type="submit"). Form
  // onSubmit handler calls signIn() → AuthProvider sets user state →
  // Router redirects authenticated routes off Login.
  await page.locator('button[type="submit"]').first().click();
  // Wait for the SPA root to change off the Login surface. The
  // post-auth URL stays at `/` (we navigated there, not `/login`),
  // so we look for a visible element only present on authenticated
  // routes — the bottom nav rendered by Layout. Bigger timeout
  // because the AuthProvider has to await a Firestore profile read
  // after sign-in, which is slower in the emulator.
  await expect(page.locator("nav").first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Helper to wipe local auth state between tests so the same Playwright
 * worker doesn't bleed signed-in state across spec files. Firebase
 * persists in localStorage and IndexedDB — clear both to be safe.
 */
export async function signOut(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    // Best-effort IDB clear — Firebase v9+ uses IDB for persistence
    // on platforms that support it. If indexedDB isn't available
    // (private mode), the clear silently no-ops.
    if ("indexedDB" in window) {
      indexedDB.databases?.().then((dbs) => {
        for (const db of dbs) {
          if (db.name) indexedDB.deleteDatabase(db.name);
        }
      });
    }
  });
}
