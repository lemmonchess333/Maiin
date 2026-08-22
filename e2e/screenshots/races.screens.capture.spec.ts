/**
 * Races & Events directory capture (races plan PR2 — the 393px
 * light+dark visual QA for the new directory section).
 *
 * Signs in as the shared e2e user and opens Social → Together, where
 * CommunityView renders the FULL SpacesDirectory: interest carousel +
 * the new Races & Events row (race cards with RACE chip, race date +
 * city, soonest first). Same rig conventions as
 * home.screens.capture.spec.ts: mobile viewport, best-effort waits
 * with SHORT timeouts, one spec file = fresh browser context.
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

test.describe("races & events directory screenshots", () => {
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

  /**
   * D25 probe — deliberately scoped to THIS spec, not swept across all 27.
   *
   * After D22 (frozen animations) and D23 (settled theme toggles), most
   * frames stopped churning between runs. `races-directory-light` did not:
   * it went 7.4% → 10.9%. Reading the diff mask rather than guessing put
   * every changed pixel in one band, y 680-839, covering the challenge
   * card's PHOTOGRAPH — not the "20 DAYS LEFT" countdown beside it, which
   * would have diffed as a thin strip. So the hypothesis is remote imagery
   * unfinished at shutter time, which `animations: "disabled"` does nothing
   * about.
   *
   * `decode()` rather than polling `.complete`, because complete is true
   * for a failed load too and false only until the bytes arrive — decode
   * resolves when the frame is actually paintable. Failures are swallowed:
   * a broken image should not fail a capture, and it will show up in the
   * frame anyway.
   *
   * If the next diff shows this frame quiet, the same three lines belong in
   * the other helpers. If it does not, the hypothesis was wrong and the
   * cost was one file.
   */
  async function settleImages(page: Page) {
    await page
      .evaluate(async () => {
        const imgs = Array.from(document.images);
        await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
      })
      .catch(() => undefined);
  }

  async function shoot(page: Page, name: string) {
    await settleImages(page);
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
    });
  }

  /* Re-anchor on the races row before every shot — late-settling
     sections above (the Circles selector) can reflow the page between
     theme flips and silently scroll the target out of frame. */
  async function shootLightDark(page: Page, name: string) {
    const anchor = page.getByText("Races & Events");
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shoot(page, `${name}-light`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await anchor.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await shoot(page, `${name}-dark`);
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  test("together tab — races & events row, light + dark", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("social?tab=crews");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });

    // The full directory's second row is the surface under review.
    const racesLabel = page.getByText("Races & Events");
    await racesLabel.waitFor({ state: "visible", timeout: 15000 });
    await racesLabel.scrollIntoViewIfNeeded();
    // First race card (soonest, The Big Half) settles once its photo
    // + date line paint.
    await page
      .getByText(/6 Sep 2026/)
      .first()
      .waitFor({ state: "visible", timeout: 8000 })
      .catch(() =>
        console.log("[capture] race date line not visible — capturing as-is")
      );
    await page.waitForTimeout(900);
    await shootLightDark(page, "races-directory");
  });
});
