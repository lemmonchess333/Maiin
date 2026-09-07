/**
 * LiftReturnSheet capture.
 *
 * The run side's welcome-back has been filmed since Run15; the lift side
 * shipped without a frame because no seed staged a lifter with a gap —
 * every fixture the rig had was either training recently or had no
 * workout documents at all, which is why the sheet correctly greets
 * nobody in the other captures. `scripts/seed-liftreturn-capture.ts`
 * stages the one user it should greet.
 *
 * The spec asserts the REGISTER before shooting. Both the detrained line
 * and the two choices must be present, so a regression that silently
 * dropped a choice, or swapped the detrained copy for the ordinary gap
 * wording, fails the capture rather than filming the wrong sheet — the
 * mistake the fell-behind spec was written to prevent on its own surface.
 *
 * It also asserts the sheet does NOT mutate: only two controls, and
 * neither promises a plan change. That is the locked
 * navigation-not-mutation rule, checked where a reviewer can see it.
 *
 * Reading its row in the capture diff report: this is a bottom sheet, the
 * frame family that changes between runs with no code change because the
 * shot can land partway through the open animation. The waits below are
 * the guard — the copy must be VISIBLE, which needs the sheet painted,
 * and the shot is animation-disabled after a settle — so a large delta
 * here is worth opening rather than dismissing as sheet churn.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("lift return screenshots", () => {
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
      email: "liftreturn-capture@tropos.test",
      password: "test-password-123",
    });
  });

  async function shootBoth(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(300);
    // Decode before each shutter, not once: the theme swap repaints, and
    // an image that decoded under the other theme is not evidence this
    // one has painted.
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
    });
  }

  test("welcome back after a lift layoff — light + dark", async ({ page }) => {
    test.setTimeout(120_000);

    // The workout read lands async, so wait on the gap line itself. The
    // seed stages 24 days, which is past the sheet's 14-day switch from
    // days to weeks — filming the branch a returning lifter actually sees.
    await expect(page.getByText(/It's been about 3 weeks/i)).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      page.getByText(/starting a little lighter is the usual way back/i)
    ).toBeVisible({ timeout: 10_000 });

    // Two ways out and no third: the sheet routes or dismisses, so a
    // control that did anything else would be the mutation this surface
    // is not allowed to make. Scoped to the sheet — Home behind it has
    // buttons of its own, and a page-wide count would drift with Home.
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button")).toHaveCount(2);
    await expect(
      sheet.getByRole("button", { name: /pick up where i left off/i })
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /start easier/i })
    ).toBeVisible();

    // No scolding, in the register a returning lifter is most exposed to.
    // Also sheet-scoped: Home legitimately shows streak copy, and a
    // page-wide locator would be asserting about the wrong surface.
    await expect(sheet.getByText(/streak/i)).toHaveCount(0);
    await expect(sheet.getByText(/missed/i)).toHaveCount(0);

    await page.waitForTimeout(500);
    await shootBoth(page, "lift-return");
  });
});
