/**
 * Circle-create dedup capture (Cal-fix). Tapping a goal in the Circles
 * cold-start opens the "Start a circle" sheet with that goal shown as a
 * compact confirmed header + a name field — instead of re-showing the
 * whole goal picker. Light + dark.
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

test.describe("circle create dedup", () => {
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

  test("cold-start goal → compact create sheet — light + dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    // Cold-start goal button (shows only for a 0-circle user).
    const goal = page.getByRole("button", { name: /strength block/i }).first();
    await goal.waitFor({ state: "visible", timeout: 15000 }).catch(() => {
      console.log("[capture] cold-start goal not visible (user has circles?)");
    });
    await goal.click({ timeout: 5000 }).catch(() => {});
    // Wait for the create sheet's name field to confirm it opened.
    await page
      .getByLabel(/circle name/i)
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() => console.log("[capture] create sheet name field not found"));
    await page.waitForTimeout(500);
    await shootLightDark(page, "circle-create-compact");
  });
});
