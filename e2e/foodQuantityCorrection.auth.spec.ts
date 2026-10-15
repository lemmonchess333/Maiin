import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { openSignInForm, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";

test.describe("food quantity correction", () => {
  test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
  test.setTimeout(90_000);

  for (const text of ["50g milk", "xylophone"]) {
    test(`${text} stays editable and its correction saves the measured amount`, async ({
      page,
      context,
    }) => {
      const { auth, db } = emulatorAdmin();
      const baseline = await auth.getUserByEmail(TEST_USER.email);
      const seed = (await db.doc(`users/${baseline.uid}`).get()).data();
      expect(seed?.onboardingComplete).toBe(true);
      const email = `food-correction-${randomUUID()}@tropos.test`;
      const user = await auth.createUser({
        email,
        password: TEST_USER.password,
        emailVerified: true,
      });
      const profile = db.doc(`users/${user.uid}`);
      const meals = profile.collection("meals");
      try {
        await profile.set({
          ...seed,
          uid: user.uid,
          email,
          subscriptionTier: "free",
          aiAnalysisEnabled: false,
        });
        await page.addInitScript(() =>
          document.addEventListener("DOMContentLoaded", () => {
            const style = document.createElement("style");
            style.textContent =
              ".firebase-emulator-warning{display:none!important}";
            document.head.append(style);
          })
        );
        await page.goto("./");
        await openSignInForm(page);
        await page.locator("#login-email").fill(email);
        await page.locator("#login-password").fill(TEST_USER.password);
        await page.locator('button[type="submit"]').first().click();
        const nav = page.getByRole("navigation", {
          name: "Main navigation",
          exact: true,
        });
        await expect(nav).toBeVisible({ timeout: 20_000 });
        await nav.getByRole("link", { name: "Food", exact: true }).click();
        const input = page.getByRole("textbox", {
          name: "What did you eat",
          exact: true,
        });
        await input.fill(text);
        await page
          .getByRole("button", { name: "Log meal", exact: true })
          .click();
        const warning = page
          .locator("[data-sonner-toast]")
          .filter({ hasText: /Nothing logged/ });
        await expect(warning).toBeVisible();
        expect((await meals.get()).size).toBe(0);
        await expect(input).toHaveValue(text);
        // Real browsers restore focus on leaving the toast. A DOM simulator
        // does not reproduce that handoff, so exercise the actual action.
        await warning
          .getByRole("button", { name: "Edit description", exact: true })
          .click();
        await expect(input).toBeFocused();
        await input.fill("120ml milk");
        await page
          .getByRole("button", { name: "Log meal", exact: true })
          .click();
        await expect
          .poll(async () => (await meals.get()).size, { timeout: 20_000 })
          .toBe(1);
        expect((await meals.get()).docs[0].data()).toMatchObject({
          confidence: "nl-parse",
          totalCalories: 75,
          totalProtein: 4,
          totalCarbs: 6,
          totalFat: 4,
          items: [
            {
              name: "120ml milk",
              portionSize: "120ml",
              calories: 75,
              protein: 4,
              carbs: 6,
              fat: 4,
            },
          ],
        });
        await expect(input).toHaveValue("");
      } finally {
        await context.close();
        try {
          await db.recursiveDelete(profile);
        } finally {
          await auth.deleteUser(user.uid);
        }
      }
    });
  }
});
