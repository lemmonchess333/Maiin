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
    content: ".firebase-emulator-warning { display: none !important; }",
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
  await page.getByLabel("Weight unit").selectOption("kg");
  await page.getByLabel("Weight (kg)", { exact: true }).fill("81.6");
  // The centered readout must stay readable beside the unit picker.
  const numberBox = await page
    .getByLabel("Weight (kg)", { exact: true })
    .boundingBox();
  const unitBox = await page.getByLabel("Weight unit").boundingBox();
  expect(numberBox!.width).toBeGreaterThan(88);
  expect(numberBox!.height).toBeGreaterThanOrEqual(44);
  expect(numberBox!.x + numberBox!.width).toBeLessThanOrEqual(unitBox!.x);
  expect(unitBox!.width).toBeGreaterThanOrEqual(44);
  expect(unitBox!.width).toBeLessThanOrEqual(88);

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
  await page.getByLabel("Weight unit").selectOption("st");
  await expect(page.getByLabel("Pounds", { exact: true })).toBeVisible();
  for (const name of ["Weight (st)", "Pounds"]) {
    const box = await page.getByLabel(name, { exact: true }).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(80);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  await expect(
    page.getByRole("button", { name: "Today", exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByLabel("Date measured")).toHaveAttribute(
    "max",
    /\d{4}-\d{2}-\d{2}/
  );
  await page.getByRole("button", { name: "Today", exact: true }).click();
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
  await page.getByLabel("Weight unit").selectOption("kg");
  await page.getByLabel("Weight (kg)", { exact: true }).fill("81.6");
  await page
    .getByRole("button", { name: /^(Log weight|Save changes)$/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Weight / })).toContainText(
    /81\.6|179\.9/
  );
  await page.reload();
  await page.addStyleTag({
    content: ".firebase-emulator-warning { display: none !important; }",
  });
  await page.getByRole("button", { name: /^Weight / }).click();
  await expect(page.getByRole("dialog", { name: "Edit weight" })).toBeVisible();
  const correction = page.getByRole("button", {
    name: /^(Remove entry|Undo last change)$/,
  });
  await expect(correction).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await page.screenshot({
      path: `screenshots/weight-edit-${dark ? "dark" : "light"}.png`,
      animations: "disabled",
    });
  }
  await correction.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
