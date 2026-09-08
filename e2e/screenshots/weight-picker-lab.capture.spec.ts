import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({ viewport: { width: 375, height: 852 } });
test("production scale is available in the development lab", async ({
  page,
}) => {
  test.skip(!emulatorActive, "emulator capture only");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("dev/weight-picker");
  await expect(
    page.getByRole("heading", { name: "Weight scale lab" })
  ).toBeVisible();
  await expect(
    page.getByRole("slider", { name: "Weight scale" })
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(375);
  const slider = page.getByRole("slider", { name: "Weight scale" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("81.7");
  const dial = slider.locator("..");
  const bounds = await dial.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + 65);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width * 0.45, bounds!.y + 65, {
    steps: 8,
  });
  await page.mouse.up();
  expect(Number(await slider.inputValue())).toBeGreaterThan(81.7);
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      path: `screenshots/weight-picker-lab-${dark ? "dark" : "light"}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("weight sheet offers stone and a bounded date without saving", async ({
  page,
}) => {
  test.skip(!emulatorActive, "emulator capture only");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("");
  await page.addStyleTag({
    content:
      ".firebase-emulator-warning { pointer-events: none !important; font-size: 10px !important; padding: 2px !important; }",
  });
  for (let i = 0; i < 10; i++) {
    if (
      !(await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false))
    )
      break;
    await page.mouse.click(8, 8);
    await page.waitForTimeout(400);
  }
  await page.getByRole("button", { name: /^Weight / }).click();
  await page.getByRole("radio", { name: "kg", exact: true }).click();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("81.6");
  await expect(page.getByRole("slider", { name: "Weight scale" })).toHaveValue(
    "81.6"
  );
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/weight-scale-kg-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
  await page.getByRole("radio", { name: "st", exact: true }).click();
  await expect(page.getByLabel("Pounds", { exact: true })).toBeVisible();
  /* The day picker is a radiogroup, not a pair of buttons: Today /
     Yesterday / Earlier, with the chosen day shown rather than merely
     set. Asserted here so the stone frame is filmed on a fully-rendered
     sheet, and so a change of ROLE fails in this spec rather than
     quietly dropping the assertion. */
  await expect(
    page.getByRole("radio", { name: "Yesterday", exact: true })
  ).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await settleImages(page);
    await page.screenshot({
      path: `screenshots/weight-scale-st-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
});
