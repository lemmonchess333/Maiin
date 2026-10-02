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
 *   3. Export E2E_AUTH_EMULATOR=1, FIREBASE_AUTH_EMULATOR_HOST,
 *      and FIRESTORE_EMULATOR_HOST. auth.spec.ts requires the exact
 *      localhost hosts used by firebase.json so a stray truthy env var
 *      doesn't accidentally run against the wrong target.
 *   4. Run `npm run test:e2e` — auth.spec.ts will run; other suites
 *      stay green regardless.
 *
 * Without the exact local emulator env, auth.spec.ts skips via its
 * strict gate so CI doesn't fall over on the unauthenticated default
 * path or accidentally point at a non-local Firebase target.
 */

import { type Page, expect } from "@playwright/test";

export const TEST_USER = {
  email: "e2e-test@tropos.test",
  password: "test-password-123",
};

/**
 * A browser that has never signed in opens on the welcome screen, where
 * "Get started" leads to the sign-up form. One that has signed in before
 * opens on the sign-in form, whose "Sign up" switches to it. Either way this
 * returns with the sign-up form showing.
 */
export async function openSignUpForm(page: Page): Promise<void> {
  const getStarted = page.getByRole("button", {
    name: "Get started",
    exact: true,
  });
  const signUp = page.getByRole("button", { name: /sign up/i });
  await expect(getStarted.or(signUp)).toBeVisible({ timeout: 20_000 });
  await ((await getStarted.isVisible()) ? getStarted : signUp).click();
  await page
    .locator("#login-email")
    .waitFor({ state: "visible", timeout: 20_000 });
}

/** The sign-in form, by "I have an account" from the welcome screen. */
export async function openSignInForm(page: Page): Promise<void> {
  const haveAccount = page.getByRole("button", {
    name: "I have an account",
    exact: true,
  });
  const email = page.locator("#login-email");
  await expect(haveAccount.or(email)).toBeVisible({ timeout: 20_000 });
  if (await haveAccount.isVisible()) await haveAccount.click();
  await email.waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Signs in via the real Login form. Times out after 15s waiting for
 * the auth redirect to /. If the form rejects (wrong creds, network
 * error), the redirect never happens and the test fails clearly
 * rather than silently proceeding as anon.
 */
export async function signInAsTestUser(
  page: Page,
  creds: { email: string; password: string } = TEST_USER
): Promise<void> {
  // Collect console + page errors so a sign-in failure can surface
  // what the SPA actually did, not just "locator timeout".
  const consoleLogs: string[] = [];
  page.on("console", (msg) =>
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
  );
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
    await openSignInForm(page);
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
    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "<unavailable>");
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
