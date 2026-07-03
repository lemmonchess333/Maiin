/**
 * Weekly Review capture (Rev1 PR1 — design-review channel).
 *
 * Same rig as home.screens.capture.spec.ts: runs in CI against the
 * emulator (auth-emulator project), commits PNGs to the app-screenshots
 * branch. Captures the /review page for the rich-seeded user, light +
 * dark. The quiet-week and thin-first-week states need dedicated seed
 * users — noted in the Rev1 lock as follow-up captures.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({ viewport: { width: 393, height: 852 } });

test.describe("weekly review screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  async function shoot(page: Page, name: string) {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  test("weekly review — light + dark", async ({ page }) => {
    await page.goto("/review");
    // Let the fetch-on-open assembly settle (spinner → content).
    await page
      .getByText("Weekly Review", { exact: true })
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await shoot(page, "weekly-review-light");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await shoot(page, "weekly-review-dark");

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  });
});
