/**
 * Reorder-into-overflow capture. The Lift header no longer carries a
 * permanent ↑↓ reorder icon — the resting header is just the overflow (…).
 * "Reorder exercises" now lives in the overflow menu with the other plan
 * edits, and entering it surfaces a "Done" exit in the header. Dark.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("reorder into overflow", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await suppressCoachmarks(page);
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

  test("header has no reorder icon; overflow offers Reorder — dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page
      .getByRole("heading", { name: /^train$/i })
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => console.log("[capture] Train heading not found"));
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(400);
    // Resting Lift header — should show NO ↑↓ reorder icon.
    await page.screenshot({
      animations: "disabled",
      path: "screenshots/reorder-header-rest-dark.png",
    });
    // Open the overflow menu — should list "Reorder exercises".
    await page
      .getByRole("button", { name: /more options/i })
      .click({ timeout: 5000 })
      .catch(() => console.log("[capture] overflow button not clickable"));
    await page
      .getByText(/reorder exercises/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => console.log("[capture] Reorder row not found"));
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: "screenshots/reorder-overflow-dark.png",
    });
  });
});
