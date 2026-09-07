/**
 * Races plan PR3 captures — the race space event header ("Train for
 * this race" CTA, distance/elevation chips, official-site link, the
 * not-affiliated line) and the run-plan editor's "Choose an upcoming
 * race" picker (Door 2), light + dark at 393px.
 *
 * Same rig conventions as races.screens.capture.spec.ts: shared e2e
 * user, best-effort waits with SHORT timeouts, re-anchor the scroll
 * before each themed shot.
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

test.describe("race event header + door-2 picker screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    // Keep the catalogue fixture upcoming after its real event date passes.
    await page.clock.setFixedTime(new Date("2026-06-01T12:00:00Z"));
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
    });
  }

  async function shootLightDark(page: Page, name: string, anchorText: string) {
    const anchor = page.getByText(anchorText).first();
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

  test("race space event header — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("space/the-big-half");
    await page
      .getByRole("button", { name: /train for this race/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(700);
    await shootLightDark(page, "race-space-header", "Train for this race");
  });

  test("run-plan editor — door-2 picker open, light + dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("settings/run-plan");
    await page
      .getByRole("radio", { name: /race prep/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("radio", { name: /race prep/i }).click();
    await page
      .getByRole("button", { name: /choose an upcoming race/i })
      .waitFor({ state: "visible", timeout: 8000 });
    await page
      .getByRole("button", { name: /choose an upcoming race/i })
      .click();
    await page
      .getByRole("option", { name: /great north run/i })
      .waitFor({ state: "visible", timeout: 8000 });
    await page.waitForTimeout(500);
    await shootLightDark(page, "race-picker", "Choose an upcoming race");
  });
});
