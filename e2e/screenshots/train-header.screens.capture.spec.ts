/**
 * Train header sport-tint capture (Option A). The whole header zone
 * (sport accent tile + "Train" title + subtitle + Lift/Run toggle) picks
 * up the active mode's colour — purple on Lift, coral on Run — so the
 * switch reads as the page changing mode, not a lone coloured pill on
 * grey. Captures Lift + Run, light + dark.
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

test.describe("train header sport-tint", () => {
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
    // The seeded rich user can pop a BadgeEarnedModal seal that isn't a
    // role=dialog — backdrop-tap then click "Nice" if present.
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

  async function shootLightDark(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("Lift + Run header tint — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page
      .getByRole("heading", { name: /^train$/i })
      .waitFor({ state: "visible", timeout: 15000 })
      .catch(() => console.log("[capture] Train heading not found"));
    await page.waitForTimeout(400);
    // Lift is the default tab.
    await shootLightDark(page, "train-header-lift");
    // Switch to Run.
    await page
      .getByRole("radio", { name: /run/i })
      .click({ timeout: 5000 })
      .catch(() => console.log("[capture] Run toggle not clickable"));
    await page.waitForTimeout(500);
    await shootLightDark(page, "train-header-run");
  });
});
