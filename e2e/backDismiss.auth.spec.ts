/**
 * Back-to-dismiss (WEB) E2E — the real-browser proof the unit tests can't give
 * (jsdom won't faithfully replay popstate). Validates that the browser BACK
 * affordance closes an open overlay instead of navigating the route away.
 *
 * Runs in the auth-emulator project (filename contains `auth.spec.ts`), gated on
 * the Firebase emulator like the other journey specs.
 *
 * First cut covers the core case (open overlay → back closes it, URL unchanged).
 * The navigate-from-overlay case (#6) is a follow-up once this is green in CI.
 */
import { test, expect } from "@playwright/test";
import { signInAsTestUser, signOut } from "./helpers/auth";
import {
  emulatorActive,
  EXPECTED_AUTH_HOST,
  EXPECTED_FIRESTORE_HOST,
} from "./helpers/emulator";

test.describe("back-to-dismiss (web)", () => {
  test.skip(
    !emulatorActive,
    `Requires E2E_AUTH_EMULATOR=1 with FIREBASE_AUTH_EMULATOR_HOST=${EXPECTED_AUTH_HOST} and FIRESTORE_EMULATOR_HOST=${EXPECTED_FIRESTORE_HOST}`
  );

  test.beforeEach(async ({ page, context }) => {
    // The scan overlay opens the camera; grant so getUserMedia doesn't prompt.
    // (It may still fail without a device — the overlay stays open regardless.)
    await context.grantPermissions(["camera"]).catch(() => {});
    await signInAsTestUser(page);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("browser back closes an open overlay instead of leaving the page", async ({
    page,
  }) => {
    await page.goto("food");
    await expect(page.locator("h1", { hasText: "Food" })).toBeVisible();
    const urlBefore = page.url();

    // Open an overlay from the Food composer's scan control.
    await page.getByLabel(/Scan your meal|Unlock unlimited scans/).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    // Browser back must dismiss the overlay, NOT navigate off the Food tab.
    await page.goBack();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("h1", { hasText: "Food" })).toBeVisible();
  });
});
