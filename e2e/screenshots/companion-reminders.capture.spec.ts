import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({ viewport: { width: 375, height: 852 } });
test("companion notification settings — light and dark", async ({ page }) => {
  test.skip(!emulatorActive, "needs Auth and Firestore emulators");
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("settings/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      path: `screenshots/companion-notifications-${dark ? "dark" : "light"}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
