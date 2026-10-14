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

    // Open an overlay from the Food composer's Scan button. It opens the
    // scanner for every account; a free one lands on its Barcode tab.
    await page.getByRole("button", { name: "Scan a meal" }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    // Browser back must dismiss the overlay, NOT navigate off the Food tab.
    await page.goBack();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).toBe(urlBefore);
    await expect(page.locator("h1", { hasText: "Food" })).toBeVisible();
  });

  test("a sheet that hands off to the next still closes on back, and the page stays", async ({
    page,
  }) => {
    // Circles' template chooser closes as its form opens. The chooser's
    // close used to call back() before the form's sentinel was pushed, and
    // the browser ran the back first, onto Social's own entry: back then
    // left Social, and starting a Circle took the person Home.
    await page.goto("/");
    await page.getByRole("link", { name: "Social" }).first().click();
    await expect(page).toHaveURL(/\/social/);
    await page.getByRole("radio", { name: "Together" }).click();
    await page.getByRole("button", { name: "Start a circle" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Strength Block/ })
      .click();
    const name = page.getByRole("textbox", { name: "Circle name" });
    await expect(name).toBeVisible();
    const urlBefore = page.url();

    await page.goBack();

    await expect(name).toBeHidden();
    expect(page.url()).toBe(urlBefore);
    await expect(
      page.getByRole("button", { name: "Start a circle" })
    ).toBeVisible();
  });
});
