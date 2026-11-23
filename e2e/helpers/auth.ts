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
import { SAVE_PLAN, SETUP } from "../../src/test/journeyScreens";
import type { OnboardingDraft } from "../../src/lib/onboardingDraft";
/* The draft's key, owner and version from the one module of the draft's
   that reads no `import.meta.env`, which Playwright's Node has none of. */
import {
  DRAFT_VERSION,
  SIGNED_OUT_DRAFT_KEY,
  SIGNED_OUT_OWNER,
} from "../../src/lib/signedOutDraft";
import { emulatorAdmin } from "./realCallables";

export const TEST_USER = {
  email: "e2e-test@tropos.test",
  password: "test-password-123",
};

/**
 * Signed out, the welcome's "Get started" opens setup's first question
 * before any account (A6): the account is made at setup's end, on Save
 * your plan. Just after an account is deleted the app opens on the
 * sign-in form, whose own "Get started" does the same.
 */
export async function openSetup(page: Page): Promise<void> {
  const getStarted = page
    .getByRole("button", { name: "Get started", exact: true })
    .first();
  await expect(getStarted).toBeVisible({ timeout: 20_000 });
  await getStarted.click();
  await page
    .getByRole("button", { name: /build muscle/i })
    .waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * The draft a person leaves at setup's review, signed out: every answer
 * given and the health-details agreement made. Planted on the phone's own
 * key, as `saveSignedOutDraft` stores it (`onboardingDraft.test.ts` holds
 * the planted form to what the app reads).
 */
export const SIGNED_OUT_REVIEW: OnboardingDraft = {
  step: 7,
  primaryGoal: "strength",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "female",
  birthYearText: "1994",
  heightCm: 168,
  weightKg: 64,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
  goalConfirmed: true,
  runConfirmed: true,
  equipmentConfirmed: true,
  experienceConfirmed: true,
  bodyAnswered: true,
  displayName: "Save tester",
  trainingActivity: "lifting",
  healthConsentVersion: 1,
};

/** Signed out, straight to Save your plan: setup's answers planted at its
 *  review, then its Continue. Picked up cold, the answers ask for the
 *  agreement to store health details again, which this gives, and then
 *  return to the review. For a spec about the screen itself. */
export async function openSaveYourPlan(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, record]) => localStorage.setItem(key, record),
    [
      SIGNED_OUT_DRAFT_KEY,
      JSON.stringify({
        v: DRAFT_VERSION,
        uid: SIGNED_OUT_OWNER,
        savedAt: Date.now(),
        draft: SIGNED_OUT_REVIEW,
      }),
    ] as const
  );
  // The emulator's banner sits over the bottom buttons on a small phone.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none !important}";
      document.head.appendChild(style);
    });
  });
  await page.goto("setup");
  await page
    .getByRole("button", { name: SETUP.agreeHealth, exact: true })
    .click({ timeout: 20_000 });
  await page
    .getByRole("button", { name: SETUP.saveNext, exact: true })
    .click({ timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
  ).toBeVisible({ timeout: 20_000 });
}

/**
 * Save your plan with an email address, once setup's review has had its
 * Start my plan: the email form makes the account, and the app goes on to
 * build the plan from the answers given signed out.
 */
export async function saveYourPlanWithEmail(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await expect(
    page.getByRole("heading", { name: SAVE_PLAN.heading, level: 1 })
  ).toBeVisible({ timeout: 20_000 });
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page
    .getByRole("button", { name: SAVE_PLAN.create, exact: true })
    .click({ timeout: 8_000 });
}

/**
 * A new account that has no plan yet, signed in on the welcome's Sign in
 * and left on setup's first question: the state a Google or Apple account
 * with no plan reaches. For a spec that needs an account before setup, to
 * seed it or set it up its own way; since A6 the app's email accounts are
 * made at setup's end. Made here as the emulator's admin, verified, with
 * the profile documents the app writes at sign-up. Returns its uid.
 */
export async function newAccountAtSetup(
  page: Page,
  email: string,
  password: string
): Promise<string> {
  const { auth, db, Timestamp } = emulatorAdmin();
  const { uid } = await auth.createUser({
    email,
    password,
    emailVerified: true,
  });
  await db.doc(`users/${uid}`).set({
    uid,
    displayName: "",
    athleteType: "Lifter",
    onboardingComplete: false,
    subscriptionTier: "free",
    createdAt: Timestamp.now(),
  });
  await db.doc(`users/${uid}/public/profile`).set({
    uid,
    displayName: null,
    photoURL: null,
    photoStoragePath: null,
    athleteType: "Lifter",
    currentStreak: 0,
    longestStreak: 0,
    createdAt: Timestamp.now(),
  });
  await page.goto("/");
  await openSignInForm(page);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.locator('button[type="submit"]').first().click();
  await page
    .getByRole("button", { name: /build muscle/i })
    .waitFor({ state: "visible", timeout: 30_000 });
  return uid;
}

/** The sign-in form, by "Sign in" from the welcome screen. The form's own
 *  submit button is "Sign in" too, so the email field decides which screen
 *  is open: an account just deleted or an email just changed opens on the
 *  form. */
export async function openSignInForm(page: Page): Promise<void> {
  const welcomeSignIn = page.getByRole("button", {
    name: "Sign in",
    exact: true,
  });
  const email = page.locator("#login-email");
  await expect(welcomeSignIn.or(email).first()).toBeVisible({
    timeout: 20_000,
  });
  if (!(await email.isVisible())) await welcomeSignIn.first().click();
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
