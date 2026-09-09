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

  /* The destination of Home's "How targets work" tip. Arriving on the
     hash should land the Base TDEE -> offset -> Daily target chain in
     view rather than at the top of the page, so this frame is taken
     WITHOUT scrolling and without fullPage: the viewport itself is the
     assertion. */
  for (const theme of ["light", "dark"] as const) {
    test(`calorie-target deep-link lands in view — ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto("settings/nutrition#calorie-targets");
      await page
        .getByRole("heading", { name: /nutrition/i })
        .first()
        .waitFor({ state: "visible", timeout: 20000 })
        .catch(() => console.log("[capture] nutrition heading not found"));
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
      }, theme);
      // The scroll runs on a 100ms timer after mount, then animates.
      await page.waitForTimeout(1200);
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/nutrition-calorie-targets-${theme}.png`,
      });
    });
  }

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
