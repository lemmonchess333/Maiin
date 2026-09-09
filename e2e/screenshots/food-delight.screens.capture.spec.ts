/** Food summary, compact meal slots and manual logging in both themes. */
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

test.describe("food delight", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
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

  async function dismissSeal(page: Page) {
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(8, 8).catch(() => {});
      await page.waitForTimeout(150);
    }
    const nice = page.getByRole("button", { name: /^nice$/i });
    if (await nice.isVisible().catch(() => false)) {
      await nice.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  for (const theme of ["light", "dark"] as const) {
    test(`Food summary, meal slots and manual entry — ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto("food");
      await page
        .getByRole("navigation", { name: /main navigation/i })
        .waitFor({ state: "visible", timeout: 20000 });
      await dismissSeal(page);
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      await expect(
        page.getByRole("button", {
          name: /toggle between calories left and calories eaten/i,
        })
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await settleImages(page);
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/food-delight-${theme}.png`,
      });

      const slots = page.getByRole("radiogroup", { name: "Add to meal" });
      const choices = slots.getByRole("radio");
      await expect(choices).toHaveCount(4);
      await slots.evaluate((element) =>
        element.scrollIntoView({ block: "center" })
      );
      const bounds = await choices.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        })
      );
      for (const box of bounds) {
        // A lone fourth pill on a second line was the phone regression.
        expect(Math.abs(box.y - bounds[0].y)).toBeLessThan(1);
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(393);
      }
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/food-composer-${theme}.png`,
      });

      // At narrow widths the explicit two-column fallback stays balanced.
      await page.setViewportSize({ width: 320, height: 852 });
      const narrowRows = await choices.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().y)
      );
      expect(Math.abs(narrowRows[0] - narrowRows[1])).toBeLessThan(1);
      expect(Math.abs(narrowRows[2] - narrowRows[3])).toBeLessThan(1);
      expect(narrowRows[2] - narrowRows[0]).toBeGreaterThanOrEqual(44);
      await page.setViewportSize({ width: 393, height: 852 });

      await page.getByRole("button", { name: "Enter manually" }).click();
      const sheet = page.getByRole("dialog", { name: "Log a meal" });
      await expect(sheet).toBeVisible();
      const save = sheet.getByRole("button", { name: "Log meal", exact: true });
      await expect(save).toBeDisabled();
      await sheet
        .getByRole("textbox", { name: "Meal name" })
        .fill("Chicken & rice");
      for (const [label, value] of [
        ["Calories (kcal)", "450"],
        ["Protein (g)", "35"],
        ["Carbs (g)", "50"],
        ["Fat (g)", "12"],
      ]) {
        await sheet
          .getByRole("spinbutton", { name: label, exact: true })
          .fill(value);
      }
      // A title click starts Vaul's drag press/release cycle; blur the
      // last field directly so a capture does not trigger drawer movement.
      await sheet
        .getByRole("spinbutton", { name: "Fat (g)", exact: true })
        .evaluate((input: HTMLInputElement) => input.blur());
      await expect(save).toBeEnabled();
      const footerBounds = () =>
        save.evaluate((button) => {
          const drawer = button.closest('[role="dialog"]')!;
          const drawerBox = drawer.getBoundingClientRect();
          const buttonBox = button.getBoundingClientRect();
          const viewport = window.visualViewport;
          return {
            drawerTop: drawerBox.top,
            drawerBottom: drawerBox.bottom,
            buttonBottom: buttonBox.bottom,
            visibleBottom: viewport
              ? viewport.offsetTop + viewport.height
              : window.innerHeight,
            drawerStyle: drawer.getAttribute("style"),
            transform: getComputedStyle(drawer).transform,
          };
        });
      await expect(async () => {
        const before = await footerBounds();
        const diagnostic = JSON.stringify(before);
        expect(
          Math.abs(before.drawerBottom - before.visibleBottom),
          diagnostic
        ).toBeLessThan(1);
        expect(
          before.visibleBottom - before.buttonBottom,
          diagnostic
        ).toBeGreaterThanOrEqual(15);
        await page.waitForTimeout(150);
        const after = await footerBounds();
        expect(
          Math.abs(after.drawerTop - before.drawerTop),
          JSON.stringify(after)
        ).toBeLessThan(1);
        expect(
          Math.abs(after.buttonBottom - before.buttonBottom),
          JSON.stringify(after)
        ).toBeLessThan(1);
      }).toPass({ timeout: 5000, intervals: [100, 200, 300] });
      const saveBox = (await save.boundingBox())!;
      expect(saveBox.height).toBeGreaterThanOrEqual(44);
      expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(852);
      for (const input of await sheet.getByRole("spinbutton").all()) {
        const box = (await input.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(393);
        expect(box.y + box.height).toBeLessThanOrEqual(saveBox.y);
      }
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/food-manual-${theme}.png`,
      });
      const capturedBounds = await footerBounds();
      expect(
        capturedBounds.visibleBottom - capturedBounds.buttonBottom,
        JSON.stringify(capturedBounds)
      ).toBeGreaterThanOrEqual(15);
      // Capture only: no meal is written by either theme scenario.
    });
  }
});
