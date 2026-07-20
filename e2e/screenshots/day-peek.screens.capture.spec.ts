/**
 * Calendar day-peek capture (Cal-A). Shows the week strip with its new
 * lift/run legend, then a day-peek opened on a NON-today day rendering
 * the planned session by name (lift dayName + run template name) rather
 * than a generic "Lift + Run day / Run scheduled". Light + dark.
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

test.describe("calendar day peek", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const BASE = "tropos-coach-marks-dismissed";
      for (const k of [BASE, `${BASE}:extras-pill-v1`]) {
        try {
          window.localStorage.setItem(k, "1");
        } catch {
          /* storage unavailable */
        }
      }
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

  test("week strip legend + day peek — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    // Badge-earned seal (not role=dialog): backdrop tap breaks the seal
    // → reveal; the reveal has a "Nice" button. Tap backdrop to break,
    // click Nice to dismiss, then a couple more backdrop taps as belt +
    // braces. Top-left corner never holds an interactive element.
    const nice = page.getByRole("button", { name: /^nice$/i });
    for (let i = 0; i < 10; i++) {
      if (await nice.isVisible().catch(() => false)) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(500);
    }
    await nice.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);

    // Strip with legend (no peek open yet).
    await shootLightDark(page, "day-peek-strip");

    // Open a peek on a non-today weekday cell (aria-label "Weekday, Month D").
    const dayCells = page.getByRole("button", { name: /day, \w+ \d+/i });
    const count = await dayCells.count().catch(() => 0);
    if (count >= 5) {
      await dayCells
        .nth(4)
        .click({ timeout: 4000 })
        .catch(() => {});
    } else if (count > 0) {
      await dayCells
        .last()
        .click({ timeout: 4000 })
        .catch(() => {});
    }
    await page.waitForTimeout(600);
    await shootLightDark(page, "day-peek-open");
  });
});
