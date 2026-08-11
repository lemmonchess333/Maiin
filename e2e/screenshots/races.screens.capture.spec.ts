/**
 * Races & Events directory capture (races plan PR2 — the 393px
 * light+dark visual QA for the new directory section).
 *
 * Signs in as the shared e2e user and opens Social → Together, where
 * CommunityView renders the FULL SpacesDirectory: interest carousel +
 * the new Races & Events row (race cards with RACE chip, race date +
 * city, soonest first). Same rig conventions as
 * home.screens.capture.spec.ts: mobile viewport, best-effort waits
 * with SHORT timeouts, one spec file = fresh browser context.
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

test.describe("races & events directory screenshots", () => {
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

  async function shoot(page: Page, name: string) {
    await page.screenshot({ path: `screenshots/${name}.png` });
  }

  /* Re-anchor on the races row before every shot — late-settling
     sections above (the Circles selector) can reflow the page between
     theme flips and silently scroll the target out of frame. */
  async function shootLightDark(page: Page, name: string) {
    const anchor = page.getByText("Races & Events");
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shoot(page, `${name}-light`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shoot(page, `${name}-dark`);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("together tab — races & events row, light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });

    // The full directory's second row is the surface under review.
    const racesLabel = page.getByText("Races & Events");
    await racesLabel.waitFor({ state: "visible", timeout: 15000 });
    await racesLabel.scrollIntoViewIfNeeded();
    // First race card (soonest, The Big Half) settles once its photo
    // + date line paint.
    await page
      .getByText(/6 Sep 2026/)
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() =>
        console.log("[capture] race date line not visible — capturing as-is")
      );
    await page.waitForTimeout(900);
    await shootLightDark(page, "races-directory");
  });
});
