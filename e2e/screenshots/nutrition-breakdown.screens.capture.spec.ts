/**
 * Nutrition breakdown sheet capture — now surfaces fiber / sugar / sodium
 * under an "Other nutrients" section (fiber = goal, sugar + sodium =
 * limits). Opens via the Food hero's "View nutrition breakdown" affordance.
 * Light + dark.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("nutrition breakdown micros", () => {
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

  async function dismissSeal(page: Page) {
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(8, 8).catch(() => {});
      await page.waitForTimeout(150);
    }
    const nice = page.getByRole("button", { name: /^nice$/i });
    if (await nice.isVisible().catch(() => false)) {
      await nice.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  test("Other nutrients section — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page
      .getByRole("button", { name: /view nutrition breakdown/i })
      .click({ timeout: 10000 })
      .catch(() => console.log("[capture] breakdown affordance not clickable"));
    await page
      .getByText(/other nutrients/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => console.log("[capture] Other nutrients section not found"));
    await page.waitForTimeout(400);
    // Scroll the sheet so fiber + sugar + sodium are all in frame.
    await page
      .getByText(/other nutrients/i)
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(300);
    // Light
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: "screenshots/nutrition-breakdown-light.png",
    });
    // Dark
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: "screenshots/nutrition-breakdown-dark.png" });
  });
});
