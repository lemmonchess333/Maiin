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
  // Collect console + page errors so a sign-in failure can surface
  // what the SPA actually did, not just "locator timeout".
  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[pageerror] ${err.message}`));

  // Navigate to the root rather than '/login'. Playwright's URL
  // resolution against baseURL replaces the entire path when the
  // argument starts with '/' — so `page.goto('/login')` resolves to
  // `http://localhost:4173/login` and DROPS the `/Maiin/` base path
  // the SPA is mounted under. Going to '/' uses baseURL as-is and
  // the unauthed route catch-all (`path="*"`) renders the same
  // Login form.
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  try {
    await page.locator("#login-email").waitFor({ state: "visible", timeout: 20_000 });
  } catch (err) {
    // Dump page content + console history so the next CI failure
    // shows what's actually rendered. Without this we just see
    // "locator timeout" with no signal about whether the SPA
    // booted, errored, or is stuck on a loading screen.
    const html = await page.content().catch(() => "<unavailable>");
    const url = page.url();
    console.error("─── signInAsTestUser failed; page state ───");
    console.error("URL:", url);
    console.error("Console history:\n" + consoleLogs.join("\n"));
    console.error("Body HTML (first 2000 chars):\n" + html.slice(0, 2000));
    console.error("─── end page state ───");
    throw err;
  }
  await page.fill("#login-email", creds.email);
  await page.fill("#login-password", creds.password);
  // Submit by clicking the email submit button (type="submit"). Form
  // onSubmit handler calls signIn() → AuthProvider sets user state →
  // Router redirects authenticated routes off Login.
  await page.locator('button[type="submit"]').first().click();
  // Bottom-nav is only rendered under the authed Layout, so it's a
  // real success signal. Generous timeout because AuthProvider
  // awaits a Firestore profile read after sign-in.
  try {
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 20_000 });
  } catch (err) {
    // Dump post-submit state — was the user routed to Onboarding?
    // Stuck on Login with an error banner? Stuck on a spinner?
    // Without this dump the failure mode is opaque.
    const html = await page.content().catch(() => "<unavailable>");
    const url = page.url();
    // Pull the visible text out so the rendered surface is
    // recognisable in the CI log without grepping HTML.
    const bodyText = await page.locator("body").innerText().catch(() => "<unavailable>");
    console.error("─── post-submit nav check failed; page state ───");
    console.error("URL:", url);
    console.error("Console history:\n" + consoleLogs.join("\n"));
    console.error("Body text (first 1500 chars):\n" + bodyText.slice(0, 1500));
    console.error("Body HTML (first 2000 chars):\n" + html.slice(0, 2000));
    console.error("─── end post-submit state ───");
    throw err;
  }
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
