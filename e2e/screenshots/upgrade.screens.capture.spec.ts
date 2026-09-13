/**
 * The Pro offer page (`/upgrade`) — the first screen a new account sees
 * after onboarding, and the one surface the funnel work of 2026-09-13
 * reshaped end to end with no frame in the capture channel. Both beats,
 * both themes: the offer (headline, preview rail, "No payment due
 * today", Continue / Continue with Free) and the plans (picker, trial
 * timeline, the trial CTA).
 *
 * Same rig as review.screens.capture.spec.ts. Entered as `from=onboarding`
 * so the copy is the one a new account reads; the seeded e2e user is on
 * the free tier with no trial taken, so the offer beat is the
 * trial-eligible one. Reduced motion is requested so the preview rail's
 * scan loop renders its settled state (the recipe gives reduced motion
 * the result, no loop) and the frame is the same on every run.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";

test.use({ viewport: { width: 393, height: 852 } });

test.describe("pro offer page screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await suppressCoachmarks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    await page.waitForTimeout(400);
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
      fullPage: true,
    });
  }

  async function shootLightDark(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(400);
    await shoot(page, `${name}-light`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(400);
    await shoot(page, `${name}-dark`);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("offer and plans — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    // Relative (no leading slash) — a leading '/' escapes the /Maiin/
    // baseURL and lands on the server's base-path error page.
    await page.goto("upgrade?from=onboarding");
    await page
      .getByRole("heading", { name: /log a meal from a photo/i })
      .waitFor({ timeout: 15_000 });
    await shootLightDark(page, "upgrade-offer");

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByRole("heading", { name: /choose your plan/i })
      .waitFor({ timeout: 10_000 });
    await shootLightDark(page, "upgrade-plans");
  });
});
