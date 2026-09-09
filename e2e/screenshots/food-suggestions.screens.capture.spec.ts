/**
 * Food suggestion rows — what each one does when you tap it.
 *
 * Four look-alike rows sit in this dropdown with four different
 * outcomes: a local database match types the name into the field, a
 * pantry match saves a meal on the spot, a database result opens the
 * portion drawer, and a Quick Add row saves — unless it is a seeded
 * example, which types instead. Nothing in the rows said so, and a
 * pantry row and a local match render identically.
 *
 * Two frames, because the dropdown has two populations and only one is
 * reachable per state: the empty field shows Quick Add, and a typed
 * query shows pantry + local matches. Open Food Facts rows need the
 * live OFF API, which the emulator rig has no network for — the
 * "Choose portion" label on those is covered by the unit test instead.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";
import { suppressCoachmarks } from "../helpers/suppressCoachmarks";
import { settleImages } from "../helpers/settleImages";

test.use({
  viewport: { width: 393, height: 852 },
  ...(process.env.PW_CHROMIUM
    ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } }
    : {}),
});

test.describe("food suggestion actions", () => {
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

  /* CLIPPED to the composer and the rows beneath it. A full-page shot
     buries the dropdown under the diary; a plain viewport shot lets the
     bottom nav sit over the lower rows, which is what the first run of
     this spec filmed. The clip is computed from the input's own box so
     it tracks the layout instead of hard-coding a y. */
  async function shootLightDark(page: Page, name: string) {
    const box = await page
      .getByRole("textbox", { name: "What did you eat" })
      .boundingBox();
    const clip = box
      ? {
          x: 0,
          y: Math.max(0, box.y - 16),
          width: 393,
          height: Math.min(430, 852 - Math.max(0, box.y - 16)),
        }
      : undefined;
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
      }, theme);
      await page.waitForTimeout(300);
      /* The diary below the composer renders meal photos, and a
         partially-decoded one churns the frame between runs for no code
         change — the failure captureAnimationsFrozen's ratchet exists to
         stop spreading. */
      await settleImages(page);
      await page.screenshot({
        animations: "disabled",
        path: `screenshots/${name}-${theme}.png`,
        ...(clip ? { clip } : {}),
      });
    }
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  }

  /* The rig has no network, so the Open Food Facts fetch fails and
     raises "Couldn't search foods." over the rows this spec exists to
     film. Correct app behaviour, wrong thing to photograph. */
  async function dismissSearchError(page: Page) {
    await page
      .getByRole("button", { name: /close|dismiss/i })
      .last()
      .click({ timeout: 1500 })
      .catch(() => {});
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(200);
  }

  async function openComposer(page: Page) {
    await page.goto("food");
    await page
      .getByRole("navigation", { name: /main navigation/i })
      .waitFor({ state: "visible", timeout: 20000 });
    const input = page.getByRole("textbox", { name: "What did you eat" });
    await input.waitFor({ state: "visible", timeout: 20000 });
    await input.click({ timeout: 5000 });
    return input;
  }

  test("empty field — Quick Add rows say what a tap does", async ({ page }) => {
    test.setTimeout(120_000);
    await openComposer(page);
    await page.waitForTimeout(800);
    await shootLightDark(page, "food-suggest-quickadd");
  });

  test("typed query — pantry logs, local match only fills the field", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const input = await openComposer(page);
    // Short enough to keep several rows on screen, common enough to hit
    // the local FOOD_DB. A longer query narrows to one row and stops
    // showing the pantry-vs-local contrast that is the point here.
    await input.fill("chicken");
    await page.waitForTimeout(1500);
    await dismissSearchError(page);
    await shootLightDark(page, "food-suggest-typed");
  });
});
