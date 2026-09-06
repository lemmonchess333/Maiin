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

test("weight sheet offers stone and a bounded date without saving", async ({ page }) => {
  test.skip(!emulatorActive, "emulator capture only");
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("");
  await page.addStyleTag({ content: ".firebase-emulator-warning { pointer-events: none !important; }" });
  for (let i = 0; i < 10; i++) {
    if (!(await page.getByRole("dialog").isVisible().catch(() => false))) break;
    await page.mouse.click(8, 8);
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: /^Weight / }).click();
  await page.getByRole("radio", { name: "st", exact: true }).click();
  await expect(page.getByLabel("Pounds", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Yesterday", exact: true })).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
    await settleImages(page);
    await page.screenshot({ path: `screenshots/companion-weight-${dark ? "dark" : "light"}.png`, animations: "disabled" });
  }
});
