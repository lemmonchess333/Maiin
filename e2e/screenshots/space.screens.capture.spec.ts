/**
 * Community Space page — the members' page, light + dark at 393px.
 *
 *   - space-member: Women's Running, which the rich seed joins the test
 *     user to, with a pinned Tropos Team note and one member's post. The
 *     hero reads "Joined" and the members' heading offers "Write a post".
 *   - space-visitor-empty: Runners, which the test user has not joined and
 *     nobody has posted in. The hero offers "Join" and the empty state
 *     asks the visitor to join.
 *   - space-leave: the confirmation Joined opens.
 *
 * Asserted before each shot, so a wrong state fails rather than filming.
 */
import { expect, test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { settleImages } from "../helpers/settleImages";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("space page screenshots", () => {
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

  async function shootLightDark(page: Page, name: string) {
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" })
      );
      await page.waitForTimeout(300);
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/${name}-${theme}.png`,
      });
    }
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("a member's space — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("space/womens-running");
    await expect(
      page.getByRole("heading", { name: "From members" })
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: /^Joined\. Leave/ })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("6 weeks in!")).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "Write a post" })
    ).toBeVisible();
    await expect(page.getByText("Tropos Coach")).toHaveCount(0);
    await settleImages(page);
    await shootLightDark(page, "space-member");

    await page.getByRole("button", { name: /^Joined\. Leave/ }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Leave Women's Running?")).toBeVisible({
      timeout: 5000,
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      animations: "disabled",
      path: "screenshots/space-leave-light.png",
    });
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("an empty space a visitor has not joined — light + dark", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("space/runners");
    await expect(page.getByText("No posts from members yet")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("button", { name: "Join" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("Join to post here.")).toBeVisible();
    await settleImages(page);
    await shootLightDark(page, "space-visitor-empty");
  });
});
