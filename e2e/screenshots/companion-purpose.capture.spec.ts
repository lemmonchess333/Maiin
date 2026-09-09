import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { settleFullPageHeight } from "../helpers/settleHeight";
import { settleImages } from "../helpers/settleImages";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { emulatorActive } from "../helpers/emulator";

test.use({ viewport: { width: 375, height: 852 } });
test("companion purpose — narrow light and dark", async ({ page }) => {
  test.skip(!emulatorActive, "needs Auth and Firestore emulators");
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("program");
  const card = page
    .getByRole("region")
    .filter({ has: page.getByRole("button", { name: "Start workout" }) });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/\d+ exercises/);
  await expect(card).not.toContainText(/Week \d+ of \d+/);
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settleFullPageHeight(page);
    await page.screenshot({
      path: `screenshots/companion-purpose-lift-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
      fullPage: true,
    });
    const title = await card
      .getByRole("heading")
      .evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth }));
    expect(title.content).toBeLessThanOrEqual(title.width);
  }
});
