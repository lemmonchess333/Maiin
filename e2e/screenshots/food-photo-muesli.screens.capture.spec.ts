/**
 * Food-hero ambient-photo capture. The muesli-bowl flat-lay renders behind
 * the calorie ring in DARK MODE ONLY; light mode keeps the brand-purple
 * halo (a photo behind the light card washes out muddy). Captures both
 * themes so the split stays honest: light = clean halo, dark = photo hero.
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

test.describe("food photo muesli", () => {
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

  test("calorie hero with muesli photo — light", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: "screenshots/food-muesli-light.png" });
  });

  test("calorie hero with muesli photo — dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(900);
    await page.screenshot({ path: "screenshots/food-muesli-dark.png" });
  });
});
