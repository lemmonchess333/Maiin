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

  /* `animations: "disabled"` is load-bearing here, not tidiness.
     The theme is switched below by toggling the `dark` class and shooting
     straight after, and the SegmentedControl's options carry
     `motion-safe:transition-colors` — so the frame caught them at the START
     of that colour transition, still holding the LIGHT muted-foreground.
     `weekly-review-dark.png` showed the check-in's three options at 2.96:1
     against their track while every other muted string on the same frame
     sat at 5.51:1, and the component was innocent: identical markup on
     Social measured correctly. A design review reading that frame chases a
     contrast bug that does not exist in the app.

     Playwright fast-forwards finite transitions to completion under this
     option, so the colour lands on its end state. Every capture spec now
     passes it — see `captureAnimationsFrozen.test.ts`. */
  async function shoot(page: Page, name: string) {
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
      fullPage: true,
    });
  }

  test("weekly review — light + dark", async ({ page }) => {
    // Relative (no leading slash) — a leading '/' escapes the /Maiin/
    // baseURL and lands on the server's base-path error page.
    await page.goto("review");
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
