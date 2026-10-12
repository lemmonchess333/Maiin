/**
 * The break-food lab, filmed and measured. The food diary's timeline with
 * the data real logs produce (src/pages/dev/breakFoodFixtures.ts): Open
 * Food Facts product names and servings, portions that multiply into
 * floats, long, right-to-left and emoji names, a twelve-times snack and a
 * 12,480 cal entry.
 *
 * Each frame is also measured, at ordinary and at double text size, at
 * the narrowest phone and at 393px: nothing may spill past the diary card
 * or the screen, and no text may be wider than its own box
 * (e2e/helpers/layoutBreaks.ts).
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { layoutBreaks } from "../helpers/layoutBreaks";

const DATASETS = ["demo", "worst", "one"] as const;

async function shoot(page: Page, name: string) {
  await settleImages(page);
  await settleFullPageHeight(page);
  await page.screenshot({
    animations: "disabled",
    path: `screenshots/${name}.png`,
    fullPage: true,
  });
}

/** The diary's rows, measured against the diary card. */
const breaks = (page: Page) =>
  layoutBreaks(page, 'section[aria-label="Food diary"] *', ".rounded-xl");

for (const width of [320, 393]) {
  test(`break-food lab at ${width}px — nothing spills or overflows`, async ({
    page,
  }) => {
    test.skip(!emulatorActive, "emulator capture only");
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 852 });
    await signInAsTestUser(page);

    const found: string[] = [];
    for (const data of DATASETS) {
      await page.goto(`dev/break-food?data=${data}`);
      await expect(
        page.getByRole("heading", { name: "Break food" })
      ).toBeVisible();
      for (const dark of [false, true]) {
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        await page.waitForTimeout(300);
        await shoot(
          page,
          `break-food-${data}-${width}-${dark ? "dark" : "light"}`
        );
      }
      found.push(...(await breaks(page)).map((s) => `${data}: ${s}`));

      // Double text size: text grows, and boxes sized in px do not.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await page.waitForTimeout(300);
      await shoot(page, `break-food-${data}-${width}-text200`);
      found.push(...(await breaks(page)).map((s) => `${data} 200%: ${s}`));
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
        document.documentElement.classList.remove("dark");
      });
    }
    expect(found).toEqual([]);
  });
}
