/**
 * Water size-picker capture (Water "B" ml model). Shows the Home water
 * tile (now reading in litres) and the size sheet opened from it —
 * Glass / Bottle / Large presets + custom input. Light + dark.
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

test.describe("water size picker", () => {
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

  async function shootLightDark(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("water tile + size sheet — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("");
    await page
      .getByRole("button", { name: /add a glass/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    // Dismiss a possible badge-earned seal.
    for (let i = 0; i < 8; i++) {
      const open = await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false);
      if (!open) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(350);
    }

    // Home with the water tile (litre reading).
    await shootLightDark(page, "water-home");

    // Open the size sheet from the water card body.
    await page
      .getByRole("button", { name: /choose a container size/i })
      .first()
      .click({ timeout: 5000 })
      .catch(() => console.log("[capture] water body button not found"));
    await page.waitForTimeout(700);
    await shootLightDark(page, "water-sheet");
  });
});
