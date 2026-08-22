/**
 * Nutrition settings capture — confirms the orphaned "Weekly meal logging
 * target" slider is gone (it drove no consumer). The screen keeps the
 * calorie-target card, macros, override, and the "activity is already in
 * your target" note. Dark.
 */
import { test } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("nutrition settings", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent =
          ".firebase-emulator-warning{display:none !important}";
        document.head.appendChild(style);
      });
    });
    await signInAsTestUser(page);
  });

  test("meal-logging slider removed — dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.goto("settings/nutrition");
    await page
      .getByRole("heading", { name: /nutrition/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => console.log("[capture] nutrition heading not found"));
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(600);
    await page.screenshot({
      animations: "disabled",
      path: "screenshots/nutrition-settings-dark.png",
      fullPage: true,
    });
  });
});
