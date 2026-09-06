import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({ viewport: { width: 393, height: 852 } });
test("weight picker prototypes are available for the device trial", async ({ page }) => {
  test.skip(!emulatorActive, "emulator capture only");
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("dev/weight-picker");
  await expect(page.getByRole("heading", { name: "Weight picker lab" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Ruler weight" })).toBeVisible();
  await expect(page.getByRole("listbox", { name: "Whole weight" })).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({ path: `screenshots/weight-picker-lab-${dark ? "dark" : "light"}.png`, fullPage: true, animations: "disabled" });
  }
});
