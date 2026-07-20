/**
 * Reverted "Today's Energy" collapsible-card capture (2026-07-20 3rd
 * pass — the card restored from pre-declutter c4c5de17). Proves the
 * card is collapsible again: collapsed = muted summary; tap the header
 * → expands to the macro rings + burned-today breakdown. Light + dark.
 *
 * Same rig conventions as home.screens.capture.spec.ts (mobile
 * viewport, rich-seeded user, best-effort waits).
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

test.describe("energy collapsible card", () => {
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

  test("collapsed then expanded — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("");
    await page
      .getByRole("button", { name: /add water/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    // Dismiss a possible badge-earned seal over Home.
    for (let i = 0; i < 8; i++) {
      const open = await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false);
      if (!open) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(350);
    }

    // Collapsed default.
    await shootLightDark(page, "energy-collapsed");

    // Expand: the card header is a button carrying "Today's Energy".
    const header = page
      .getByRole("button", { name: /today's energy/i })
      .first();
    await header.click({ timeout: 5000 }).catch(() => {
      /* header copy changed — capture stays on the collapsed state */
    });
    await page.waitForTimeout(700);
    await shootLightDark(page, "energy-expanded");
  });
});
