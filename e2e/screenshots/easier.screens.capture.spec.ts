/**
 * Pre-session chooser capture (PROGRAM-ADAPT-01 — the 393px light+dark
 * visual QA for "Easier today").
 *
 * The chooser now opens on EVERY "Start workout" (Easier today is
 * always offered), so the capture drives Program → Start workout and
 * shoots the sheet in both themes. The rich-seeded e2e user has an
 * all-lift weekSchedule + a programme, so Start workout renders on
 * every weekday CI runs.
 *
 * Rig conventions: fresh context per spec file, short best-effort
 * timeouts, emulator banner hidden.
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

test.describe("easier today screenshots", () => {
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
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
      fullPage: true,
    });
  }

  test("session chooser with Easier today — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    // The chooser opens from "Short on time?", NOT from Start workout.
    // This spec waited on Start workout until 2026-08-10, which stopped
    // being that path on 2026-08-05 ("begin means begin" — the every-tap
    // interstitial was removed as too much choice; see the header comment
    // in ExpressSessionSheet.tsx). Nobody noticed because the whole
    // capture job was aborting earlier, at the seed step.
    await page
      .getByRole("button", { name: /short on time/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByRole("button", { name: /short on time/i })
      .click({ timeout: 4000 });
    await page
      .getByRole("button", { name: /easier today/i })
      .waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(700);

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(400);
    await shoot(page, "easier-chooser-light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, "easier-chooser-dark");
  });
});
