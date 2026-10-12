/**
 * Home's food card ("Today's food"), light + dark.
 *
 * One state, filmed per theme: the Food page's calorie ring and its three
 * macro tiles, drawn smaller and side by side, and the log action, none
 * of it behind a disclosure. The ring and tiles are Food's own components,
 * so this card and the Food page show the same object.
 *
 * Light AND dark both matter here beyond the usual: the tiles sit on the
 * muted tint, so their bar track is the stronger neutral groove at
 * `--muted-foreground / 0.22` (a track tinted with the macro's own hue
 * measured 1.06:1 against the card for carbs, and the Food page's muted
 * track vanishes on the tint). These frames are where that reads as fixed
 * or does not.
 *
 * Same rig conventions as home.screens.capture.spec.ts (mobile
 * viewport, rich-seeded user, best-effort waits).
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

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
       an unloaded card's ring shows a dash with its tiles counting from
       nothing — a frame that looks like a legitimate empty day rather
       than a miss. The same anchor surfaces.screens uses (the ring's
       accessible name, plain digits in every locale), pinned against a
       real render in `energyCaptureAnchor.test.tsx`. */
    await page
      .getByRole("button", { name: /of [1-9]\d* calories/ })
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
    await shootLightDark(page, "nutrition-card");
  });
});
