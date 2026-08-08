/**
 * Coachmark first-use contract (pre-launch QA backlog, tooltip-primitive
 * section) — the dismissal matrix that was parked as a manual device
 * check: appears on first use, dismisses via outside tap / Escape / the
 * 6s auto-timer, and STAYS dismissed across reloads.
 *
 * Drives the one LIVE Coachmark wire-up: `social-find-invite` on
 * PeopleView's "Share invite link" button, shown to users following
 * nobody. (The other wire-up this spec originally targeted — the
 * HybridWeekRail extras pill — turned out to be unreachable: the rail
 * was orphaned by the 2b4e07b8 day-navigation unification and is
 * deleted in the same change that added this spec.)
 *
 * Fixture: a brand-new account per test, minted through the real signup
 * form, with `onboardingComplete` patched via the emulator's rules-free
 * REST surface so the app routes to the full shell. A fresh account
 * follows nobody (`isNewUser`), and a fresh browser context has clean
 * localStorage — so the coachmark shows naturally, no key manipulation,
 * and no dependency on (or mutation of) the shared seed fixtures, whose
 * rich user deliberately carries a follow edge that suppresses this
 * card's coachmark.
 */
import { test, expect, type Page } from "@playwright/test";
import { emulatorActive } from "./helpers/emulator";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const KEY = "tropos-coach-marks-dismissed:social-find-invite";
const MARK_TEXT = /Share your profile link to get started/i;

test.use({
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

/** Look up a user's uid in the emulator by email (project-scoped admin
 *  query — Bearer owner bypasses auth in the emulator). */
async function uidByEmail(email: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/demo-tropos/accounts:query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: "{}",
    }
  );
  if (!res.ok) {
    throw new Error(`auth emulator query failed: ${await res.text()}`);
  }
  const { userInfo } = (await res.json()) as {
    userInfo?: { localId: string; email?: string }[];
  };
  const localId = userInfo?.find((u) => u.email === email)?.localId;
  if (!localId) throw new Error(`user ${email} not found in auth emulator`);
  return localId;
}

/** Mark the account onboarding-complete via the Firestore emulator's
 *  rules-free REST surface, so the app routes to the full shell. */
async function completeOnboardingDirect(uid: string): Promise<void> {
  const res = await fetch(
    `http://${FS_HOST}/v1/projects/demo-tropos/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=displayName`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer owner",
      },
      body: JSON.stringify({
        fields: {
          onboardingComplete: { booleanValue: true },
          displayName: { stringValue: "Coachmark Tester" },
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`firestore emulator patch failed: ${await res.text()}`);
  }
}

/** Mint a fresh signed-in account (0 follows, clean localStorage) and
 *  open Social → People with the coachmark showing. */
async function openPeopleAsFreshUser(page: Page): Promise<void> {
  const email = `coachmark-${Date.now()}-${Math.floor(Math.random() * 1e6)}@tropos.test`;
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /sign up/i })
    .click({ timeout: 20_000 });
  await page.fill("#login-email", email);
  await page.fill("#login-password", "test-password-123");
  await page
    .getByRole("button", { name: /create account/i })
    .click({ timeout: 8000 });
  // Onboarding step 0 confirms the account exists + profile doc is live.
  await page
    .getByRole("button", { name: /build muscle/i })
    .waitFor({ state: "visible", timeout: 30_000 });

  await completeOnboardingDirect(await uidByEmail(email));

  await page.goto("social");
  await page
    .getByRole("button", { name: /find people/i })
    .click({ timeout: 25_000 });
  await expect(page.getByText(MARK_TEXT)).toBeVisible({ timeout: 20_000 });
}

async function dismissalPersisted(page: Page): Promise<void> {
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), KEY)
  ).toBeTruthy();
}

test.describe("social-find-invite coachmark first-use contract", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test("outside tap dismisses, and the dismissal survives a reload", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openPeopleAsFreshUser(page);

    // Tap well away from both the coachmark and its anchor.
    await page.mouse.click(8, 300);
    await expect(page.getByText(MARK_TEXT)).not.toBeVisible({ timeout: 5000 });
    await dismissalPersisted(page);

    // Full reload → reopen People → still gone.
    await page.reload();
    await page
      .getByRole("button", { name: /find people/i })
      .click({ timeout: 25_000 });
    await expect(
      page.getByRole("button", { name: /share invite link/i })
    ).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    await expect(page.getByText(MARK_TEXT)).not.toBeVisible();
  });

  test("Escape dismisses", async ({ page }) => {
    test.setTimeout(180_000);
    await openPeopleAsFreshUser(page);
    await page.keyboard.press("Escape");
    await expect(page.getByText(MARK_TEXT)).not.toBeVisible({ timeout: 5000 });
    await dismissalPersisted(page);
  });

  test("auto-dismisses after the 6s timer", async ({ page }) => {
    test.setTimeout(180_000);
    await openPeopleAsFreshUser(page);
    // Default autoDismissMs is 6000 — allow slack, and assert the key
    // was written by the TIMER (no interaction happened).
    await expect(page.getByText(MARK_TEXT)).not.toBeVisible({
      timeout: 8000,
    });
    await dismissalPersisted(page);
  });
});
