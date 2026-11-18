/**
 * The two badge directions (DS4 call 4), filmed. The dev lab draws six
 * badges both ways at the shelf's, the grid's and the reveal's sizes; this
 * films it at a phone's width, where the directions stack, and at a
 * desktop's, where they stand side by side, in both themes.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

async function shoot(page: Page, name: string) {
  await settleImages(page);
  await settleFullPageHeight(page);
  await page.screenshot({
    animations: "disabled",
    path: `screenshots/${name}.png`,
    fullPage: true,
  });
}

for (const width of [393, 1100]) {
  test(`badge directions at ${width} px, light and dark`, async ({ page }) => {
    test.skip(!emulatorActive, "emulator capture only");
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await signInAsTestUser(page);
    await page.goto("dev/badge-directions");
    await expect(
      page.getByRole("heading", { name: "Badge directions" })
    ).toBeVisible();
    await expect(page.locator("[data-direction]")).toHaveCount(2);

    for (const dark of [false, true]) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle("dark", value),
        dark
      );
      await page.waitForTimeout(400);
      await shoot(page, `badge-directions-${width}-${dark ? "dark" : "light"}`);
    }
  });
}
