/**
 * Tooltip visibility capture (pre-launch QA backlog, tooltip-primitive
 * section) — the light + dark "body and arrow must register in both
 * themes" row, filmed on the Performance Index tooltip in Analytics
 * (the rich seed carries 6 performance weeks, so the tab renders).
 *
 * The TrajectoryCard delta-chip wire-up stays a manual check — it needs
 * trajectory data the shared seeds don't stage.
 *
 * Rig conventions: fresh context, emulator banner hidden, 393px.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("tooltip screenshots", () => {
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
    });
  }

  test("Performance Index tooltip — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("history");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20_000 });

    // Analytics → Performance tab (SegmentedControls are role=radio).
    await page
      .getByRole("radio", { name: /performance/i })
      .click({ timeout: 15_000 })
      .catch(() => {
        /* already on Performance / control absent — the anchor wait decides */
      });

    const openTooltip = async () => {
      await page
        .getByRole("button", { name: /about performance index/i })
        .click({ timeout: 15_000 });
      await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(300);
    };

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await openTooltip();
    await shoot(page, "tooltip-performance-index-light");

    // Theme flip closes nothing by itself, but re-open defensively in
    // case the flip re-rendered the portal.
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    if (
      !(await page
        .getByRole("tooltip")
        .isVisible()
        .catch(() => false))
    ) {
      await openTooltip();
    }
    await shoot(page, "tooltip-performance-index-dark");
  });
});
