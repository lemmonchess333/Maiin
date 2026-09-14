/**
 * The badge seal, filmed. The ceremony is otherwise reachable only by
 * earning a badge, so its seal had no frame in the channel. The dev lab
 * renders one ceremony per tier; this films the sealed row in both themes,
 * then walks the bronze seal through the break: one tap (two cracks),
 * two taps (four), three (open, badge revealed).
 *
 * Reduced motion is NOT requested here: under it the ceremony collapses to
 * a single tap and the cracked states do not exist. The waits after each
 * tap let the jolt settle before the shutter.
 */
import { test, expect, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";
import { settleFullPageHeight } from "../helpers/settleHeight";

test.use({ viewport: { width: 393, height: 852 } });

async function shoot(page: Page, name: string) {
  await settleImages(page);
  await settleFullPageHeight(page);
  await page.screenshot({
    animations: "disabled",
    path: `screenshots/${name}.png`,
    fullPage: true,
  });
}

test("badge seal — four tiers sealed, then the bronze one broken open", async ({
  page,
}) => {
  test.skip(!emulatorActive, "emulator capture only");
  test.setTimeout(120_000);
  await suppressCoachmarks(page);
  await signInAsTestUser(page);
  await page.goto("dev/badge-seal");
  await expect(
    page.getByRole("heading", { name: "Badge seal lab" })
  ).toBeVisible();
  const seals = page.getByRole("button", { name: /break the seal/i });
  await expect(seals).toHaveCount(4);

  for (const dark of [false, true]) {
    await page.evaluate(
      (value) => document.documentElement.classList.toggle("dark", value),
      dark
    );
    await page.waitForTimeout(400);
    await shoot(page, `badge-seal-lab-${dark ? "dark" : "light"}`);
  }
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  const bronze = page.locator('[data-seal-tier="bronze"]');
  const seal = bronze.getByRole("button", { name: /break the seal/i });
  await seal.click();
  await page.waitForTimeout(700);
  await shoot(page, "badge-seal-cracked-light");
  await seal.click();
  await page.waitForTimeout(700);
  await shoot(page, "badge-seal-cracked-2-light");
  await seal.click();
  await expect(bronze.getByText("First Step")).toBeVisible();
  await page.waitForTimeout(1200);
  await shoot(page, "badge-seal-open-light");
});
