/**
 * FellBehindSheet — detrained register capture (Run15 voice packet).
 *
 * The one #1877 surface that shipped without film: when the layoff
 * classifier says `detrained`, the fell-behind sheet must drop the
 * missed-runs scoreboard for the welcome-back register ("It's been a
 * while between runs" + "Rebuild my plan"). Staged by
 * scripts/seed-fellbehind-capture.ts — a race_prep user with the cron's
 * `pendingFellBehindPrompt` set and a 32-day run gap ending 3 days ago,
 * so Home opens the sheet and useProgram's layoff read classifies
 * `detrained` exactly as production would.
 *
 * The spec asserts the REGISTER before shooting: welcome-back copy and
 * the Rebuild primary must both be visible, so a regression to the
 * scoreboard register fails the capture rather than silently filming
 * the wrong sheet.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("fell-behind detrained screenshots", () => {
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
    await signInAsTestUser(page, {
      email: "fellbehind-capture@tropos.test",
      password: "test-password-123",
    });
  });

  async function shootBoth(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${name}-light.png` });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/${name}-dark.png` });
  }

  test("detrained register — light + dark", async ({ page }) => {
    test.setTimeout(120_000);

    // Home mounts the sheet from pendingFellBehindPrompt; the layoff
    // read lands async, so wait for the DETRAINED register specifically
    // (the standard register would show "Realign my plan" instead).
    await expect(page.getByText(/It's been a while between runs/i)).toBeVisible(
      { timeout: 25_000 }
    );
    await expect(
      page.getByRole("button", { name: /rebuild my plan/i })
    ).toBeVisible({ timeout: 10_000 });
    // The scoreboard must NOT be present in this register.
    await expect(page.getByText(/0 of 3 runs/i)).not.toBeVisible();

    await page.waitForTimeout(500);
    await shootBoth(page, "fellbehind-detrained");
  });
});
