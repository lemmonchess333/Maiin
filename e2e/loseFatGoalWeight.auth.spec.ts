import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openSignUpForm } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin, routeRealCallables } from "./helpers/realCallables";
import { verifySignupEmail } from "./helpers/verifySignupEmail";

/**
 * Lose fat with a goal weight, from sign-up to Settings → Nutrition.
 *
 * The unit tests pin each piece: setup commits the goal weight and a
 * negative weekly rate, the goal-weight plan applies the deficit, the
 * profile sanitizer keeps both fields, and the Nutrition section shows a
 * pace and a goal. Nothing followed one account through all of them. Here
 * "Start my plan" runs the real `completeOnboarding` handler, as the
 * journeys do, so what Settings reads is what production writes.
 */

/** A whole number from a figure on screen ("2,145 kcal" → 2145). */
const figure = (text: string | null) => Number((text ?? "").replace(/\D/g, ""));

/** The value beside a label in Settings' calorie chain. */
async function chainValue(page: Page, label: string) {
  const row = page
    .locator("#calorie-targets div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();
  return figure(await row.locator("span").last().textContent());
}

test.describe("lose fat with a goal weight", () => {
  test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
  test.use({ viewport: { width: 393, height: 852 } });
  test.setTimeout(120_000);

  test("the plan's target is under maintenance, and Nutrition shows the goal and pace", async ({
    page,
  }) => {
    await routeRealCallables(page, ["completeOnboarding"]);
    await page.addInitScript(() =>
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none!important}";
        document.head.append(style);
      })
    );
    const email = `lose-fat-${randomUUID()}@tropos.test`;
    const { auth, db } = emulatorAdmin();
    try {
      await page.goto("./");
      await openSignUpForm(page);
      await page.fill("#login-email", email);
      await page.fill("#login-password", "test-password-123");
      await page.getByRole("button", { name: /create account/i }).click();
      await verifySignupEmail(page, email);

      // Setup: Lose fat, a lifting plan with the defaults, 80 kg now.
      const next = () =>
        page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: /^Lose fat/ }).click();
      await next();
      await next();
      await page.getByRole("button", { name: /Full gym/ }).click();
      await page.getByRole("button", { name: /New to lifting/ }).click();
      await next();
      await page.getByRole("button", { name: "None", exact: true }).click();
      await next();
      await page
        .getByRole("textbox", { name: "Weight (kg)", exact: true })
        .fill("80");
      await page
        .getByRole("textbox", { name: "Height (cm)", exact: true })
        .fill("178");
      await page.getByRole("radio", { name: /^25/ }).click();
      // The goal: 70 kg, at 0.25 kg a week.
      await page.locator("#onboarding-goal-weight").fill("70");
      await page
        .getByRole("radiogroup", { name: "Weekly pace" })
        .getByRole("radio", { name: "0.25 kg", exact: true })
        .click();
      await expect(
        page.getByText("Lose about 0.25 kg a week.", { exact: true })
      ).toBeVisible();
      await next();

      // The review: the daily target, for that pace.
      const review = page.getByRole("region", { name: "Your daily target" });
      await expect(review).toContainText("To lose about 0.25 kg a week.");
      const reviewTarget = figure(
        await review.locator("p", { hasText: /kcal$/ }).textContent()
      );
      expect(reviewTarget).toBeGreaterThan(1000);
      await page
        .getByRole("button", { name: "Start my plan", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: /your plan is ready/i })
      ).toBeVisible({ timeout: 30_000 });

      // What completeOnboarding wrote.
      const { uid } = await auth.getUserByEmail(email);
      const saved = (await db.doc(`users/${uid}`).get()).data();
      expect(saved?.onboardingComplete).toBe(true);
      expect(saved?.goalWeightKg).toBe(70);
      expect(saved?.weeklyRateKg).toBe(-0.25);

      await page
        .getByRole("button", { name: "Continue with Free", exact: true })
        .click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation", exact: true })
      ).toBeVisible({ timeout: 20_000 });
      await page.goto("settings/nutrition");

      // The goal and the pace.
      const goal = page
        .locator("p", { hasText: /^kg target$/ })
        .locator("xpath=preceding-sibling::p[1]");
      await expect(goal).toHaveText("70.0", { timeout: 20_000 });
      await expect(
        page
          .getByRole("radiogroup", { name: "Weekly pace" })
          .getByRole("radio", { checked: true })
      ).toContainText("Relaxed");
      await expect(page.getByText(/^Losing → Cut$/)).toBeVisible();

      // The target, under maintenance, and the same one the review showed.
      const maintenance = await chainValue(page, "Base TDEE");
      const target = await chainValue(page, "Daily target");
      expect(maintenance).toBeGreaterThan(1000);
      expect(target).toBeLessThan(maintenance);
      expect(target).toBe(reviewTarget);
      expect(await chainValue(page, "Cut offset")).toBe(maintenance - target);
    } finally {
      const user = await auth.getUserByEmail(email).catch(() => null);
      if (user) {
        await db.recursiveDelete(db.doc(`users/${user.uid}`));
        await auth.deleteUser(user.uid);
      }
    }
  });
});
