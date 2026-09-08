/**
 * Home's "Today's nutrition" card, light + dark.
 *
 * This spec previously filmed the card's two states — collapsed summary,
 * then tapped open to the macro rings. There is one state now: calories
 * against their target, the three macros against theirs, and the log
 * action, none of it behind a disclosure. So the pair of frames became
 * one pair per theme, and the tap step went with the button it drove.
 *
 * Light AND dark both matter here beyond the usual: the ring track is a
 * neutral groove at `--muted-foreground / 0.22`, chosen because a track
 * tinted with the macro's own hue measured 1.06:1 against the card for
 * carbs. These frames are where that reads as fixed or does not.
 *
 * Same rig conventions as home.screens.capture.spec.ts (mobile
 * viewport, rich-seeded user, best-effort waits).
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("today's nutrition card", () => {
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
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-light.png`,
      fullPage: true,
    });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(300);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}-dark.png`,
      fullPage: true,
    });
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("the one state — light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("");
    await page
      .getByRole("button", { name: /add water/i })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1000);
    // Dismiss a possible badge-earned seal over Home.
    for (let i = 0; i < 8; i++) {
      const open = await page
        .getByRole("dialog")
        .isVisible()
        .catch(() => false);
      if (!open) break;
      await page.mouse.click(8, 8);
      await page.waitForTimeout(350);
    }

    /* Anchor on the card being LOADED, not merely present. The heading
       renders immediately while the target arrives from the profile, and
       an unloaded card shows "/ 0 kcal" with every ring at 0g — a frame
       that looks like a legitimate empty day rather than a miss.
       Separator-agnostic for the reason `energyCaptureAnchor.test.tsx`
       records: `formatCalories` is `toLocaleString()` with no locale. */
    await page
      .getByText(/Target [1-9][\d.,\s\u00a0\u202f]*kcal/)
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await shootLightDark(page, "nutrition-card");
  });
});
