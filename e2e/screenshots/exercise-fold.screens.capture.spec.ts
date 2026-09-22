/**
 * The lift session's exercise list, as the command card's footer.
 *
 * Three frames, because the design is three states and the middle one is
 * the whole point: collapsed (what the page now costs, with the names
 * still readable), expanded (nothing lost, one tap away), and the drag
 * mode entered from the PAGE HEADER's overflow while the list was
 * collapsed — the case where a naive fold would put a user into reorder
 * with nothing on screen to drag.
 *
 * fullPage, deliberately. The change is about page height, and a viewport
 * shot cannot show it.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("exercise list fold", () => {
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

  async function openTrain(page: Page) {
    await page.goto("program");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    await dismissSeal(page);
    await page
      .getByRole("heading", { name: /^train$/i })
      .waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(400);
  }

  /* Both settles before every shot, not once per test. A fullPage frame's
     dimensions are a claim about final layout, and the fold CHANGES that
     layout by ~478px on the seeded account — so the frame this spec
     exists to measure is exactly the one a premature shutter gets wrong.
     The theme flip gets its own pair because it can relayout (`dark:`
     variants change type and card metrics), and the exercise rows carry
     no raster art but the cards around them do. */
  async function shoot(page: Page, name: string) {
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await settleFullPageHeight(page);
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: `screenshots/${name}-light.png`,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await settleFullPageHeight(page);
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: `screenshots/${name}-dark.png`,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("collapsed, then expanded — light + dark", async ({ page }) => {
    test.setTimeout(180_000);
    await openTrain(page);

    const row = page.getByRole("button", { name: /^Exercises,/ });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-expanded", "false");
    // The footer earns its place by naming the day's first lift.
    await expect(row).not.toHaveText(/^\s*$/);
    await shoot(page, "exercise-fold-collapsed");

    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    // The affordance the fold defers rather than removes.
    // The panel itself, not a per-row "…": in reorder mode the rows
    // carry drag handles and the manage button is not rendered.
    await expect(page.locator("#lift-exercise-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add exercise$/i })
    ).toBeVisible();
    await shoot(page, "exercise-fold-expanded");
  });

  test("the drag mode opens the fold it was launched over — dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTrain(page);

    // Leave the list collapsed, then enter reorder from the page header.
    await expect(
      page.getByRole("button", { name: /^Exercises,/ })
    ).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: /more options/i }).click();
    await page.getByText(/reorder exercises/i).click();
    await page.waitForTimeout(400);

    // The panel is open and the footer reads as open. Its chevron is
    // gone — the exit is the header's own Done — but the footer itself
    // stays, because it is the card's own edge rather than a row.
    await expect(
      page.getByRole("button", { name: /^Exercises,/ })
    ).toHaveAttribute("aria-expanded", "true");
    // The panel itself, not a per-row "…": in reorder mode the rows
    // carry drag handles and the manage button is not rendered.
    await expect(page.locator("#lift-exercise-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await settleFullPageHeight(page);
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: "screenshots/exercise-fold-reorder-dark.png",
    });
  });
});
