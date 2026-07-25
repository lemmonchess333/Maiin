/**
 * Food hero — ZERO state over the photo.
 *
 * The hardest legibility case: a day with nothing logged, in "eaten"
 * framing. The centre number is 0 and the progress arc has zero length,
 * so the ring TRACK is the only geometry drawn. Both were tuned for a
 * flat card (10% tint track, 0.4-opacity zero) and effectively vanished
 * over the dark-mode hero photo.
 *
 * Seeds the plain e2e user (NOT seed:rich) so today genuinely has no
 * meals, and forces "eaten" mode via the ring's storage key.
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

test.describe("food zero state", () => {
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
      try {
        // Force the "eaten" framing so the centre value is 0 rather than
        // the full target — the state the user hits on a fresh morning.
        window.localStorage.setItem("tropos.food.calorieRingMode", "eaten");
      } catch {
        /* ignore */
      }
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

  test("zero kcal eaten over the photo — dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(900);
    await page.screenshot({ path: "screenshots/food-zero-dark.png" });
  });

  test("zero kcal eaten — light", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page.waitForTimeout(900);
    await page.screenshot({ path: "screenshots/food-zero-light.png" });
  });
});
