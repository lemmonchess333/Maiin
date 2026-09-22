/**
 * The lift day's exercise list, on screen with the day.
 *
 * Three frames for two states. The default pair is fullPage and light +
 * dark, because the claim this spec exists to hold is about the whole
 * page: the card states the session and the rows are directly under it,
 * with nothing to tap to reach them. The third is the drag mode, which
 * is a different rendering of the same rows — drag handles in place of
 * the per-row manage button — and is filmed nowhere else
 * (`reorder-overflow` shoots the header and its menu, viewport only).
 *
 * fullPage, deliberately. A viewport shot at 393x852 ends above the
 * list on the seeded account, which is the half the frames are for.
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

test.describe("exercise list", () => {
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

  /* Both settles before every shot, not once per test. A fullPage
     frame's dimensions are a claim about final layout, and the list is
     the tallest thing on this page — so the frame this spec exists for
     is exactly the one a premature shutter gets wrong. The theme flip
     gets its own pair because it can relayout (`dark:` variants change
     type and card metrics), and the rows carry no raster art but the
     cards around them do. */
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

  test("the day's exercises, under the card — light + dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTrain(page);

    // No control stands between the card and the rows: both affordances
    // the list owns are reachable on arrival.
    await expect(
      page.getByRole("button", { name: /^More options for / }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add exercise$/i })
    ).toBeVisible();
    await shoot(page, "exercise-list-default");
  });

  test("the drag mode swaps the row's menu for a handle — dark", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTrain(page);

    /* The page header's overflow, EXACTLY — with the list on screen a
       loose /more options/ also matches every row's own manage button,
       and the first match is not the header's. */
    await page
      .getByRole("button", { name: "More options", exact: true })
      .click();
    await page.getByText(/reorder exercises/i).click();
    await page.waitForTimeout(400);

    // The mode's exit is the header's own Done. The rows are the same
    // rows, rendered with handles — so the per-row manage button is the
    // thing that goes, and Add exercise is the thing that stays.
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^More options for / })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Add exercise$/i })
    ).toBeVisible();

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await settleFullPageHeight(page);
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: "screenshots/exercise-list-reorder-dark.png",
    });
  });
});
