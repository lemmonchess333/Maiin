/**
 * Pre-session chooser capture (PROGRAM-ADAPT-01 — the 393px light+dark
 * visual QA for "Easier today").
 *
 * The chooser now opens on EVERY "Begin Workout" (Easier today is
 * always offered), so the capture drives Program → Begin Workout and
 * shoots the sheet in both themes. The rich-seeded e2e user has an
 * all-lift weekSchedule + a programme, so Begin Workout renders on
 * every weekday CI runs.
 *
 * Rig conventions: fresh context per spec file, short best-effort
 * timeouts, emulator banner hidden.
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

test.describe("easier today screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const BASE = "tropos-coach-marks-dismissed";
      for (const k of [
        BASE,
        `${BASE}:social-find-invite`,
        `${BASE}:extras-pill-v1`,
      ]) {
        try {
          window.localStorage.setItem(k, "1");
        } catch {
          /* storage unavailable — capture just shows the coachmark */
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

  async function shoot(page: Page, name: string) {
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  test("session chooser with Easier today — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await page
      .getByRole("button", { name: /begin workout/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page
      .getByRole("button", { name: /begin workout/i })
      .click({ timeout: 4000 });
    await page
      .getByRole("button", { name: /easier today/i })
      .waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(700);

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await shoot(page, "easier-chooser-light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await shoot(page, "easier-chooser-dark");
  });
});
