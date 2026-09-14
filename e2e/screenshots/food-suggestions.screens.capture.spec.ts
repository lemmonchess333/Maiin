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

  /* The frame is the composer plus the rows under it. A full-page shot
   buries the dropdown under the diary; a plain viewport shot lets the
   bottom nav sit over the lower rows, which is what the first run of
   this spec filmed. */
  const FRAME_HEIGHT = 430;
  const ANCHOR_MARGIN = 16;
  /* The floor is DERIVED, not picked: FoodSuggestionsDropdown caps itself
   at `max-h-80` (320px) and hangs `mt-1` (4px) below a ~56px composer
   input, so 16 + 56 + 4 + 320 = 396px is the least that can still hold
   the whole panel. 400 rounds that up. A frame at 429.5px — what the
   current layout actually affords — clears it; the 142px this spec was
   filming does not, which is the case the floor exists for. */
  const MIN_FRAME_HEIGHT = 400;

  /* CLIPPED, and the clip is ANCHORED then CHECKED — both halves matter.
     It is computed from the input's own box so it tracks the layout
     rather than hard-coding a y, and that part was always right. What it
     lacked was a floor: `Math.min(430, 852 - y)` silently SHRINKS when
     the composer sits low on the page, so the frame kept its name and
     quietly stopped containing its subject.

     It really happened. The 2026-09-14 diff report showed these two
     frames at 393x142 — the input had been sitting at y~726, so 142px
     was all the room left below it and the Quick Add rows this spec
     exists to film were almost entirely outside the shot. It self-
     corrected when the Food page got shorter, surfacing as a routine-
     looking `resized` row rather than a failure, which is the whole
     problem: a capture spec is only a gate while the thing it came to
     film is actually in frame.

     So: scroll the anchor to the top of the viewport first, which makes
     the room deterministic instead of dependent on wherever the page
     happened to be scrolled, and then REFUSE to shoot a short frame. A
     loud failure naming the height beats a quiet sliver that still
     lands in the report looking like a screenshot. */
  async function shootLightDark(page: Page, name: string) {
    const anchor = page.getByRole("textbox", { name: "What did you eat" });
    /* Scroll the composer up before measuring. Under the full seed chain
       the diary below it is long enough to push it to y~726, which is
       where the 142px frame came from — the page CAN scroll, it just was
       not being asked to. (Measured both ways: with only `seed:e2e` the
       page is too short to scroll and this is a no-op, which is why the
       problem is invisible on a light seed.) */
    await anchor.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(200);
    const box = await anchor.boundingBox();
    if (!box) {
      throw new Error(
        `${name}: the composer input has no bounding box — nothing to anchor the frame to.`
      );
    }
    /* Read the viewport rather than repeating the 852 from `test.use`.
       Two copies of a height that must agree is the same shape as the
       clip bug itself — one of them drifts and nothing says so. */
    const viewportHeight = page.viewportSize()?.height ?? 852;
    const y = Math.max(0, box.y - ANCHOR_MARGIN);
    const height = Math.min(FRAME_HEIGHT, viewportHeight - y);
    if (height < MIN_FRAME_HEIGHT) {
      throw new Error(
        `${name}: only ${height}px below the composer (it sits at y=${Math.round(box.y)}), ` +
          `under the ${MIN_FRAME_HEIGHT}px needed to hold the suggestion panel. ` +
          `The frame would keep its name and stop containing its subject — ` +
          `fix the framing rather than filming a sliver.`
      );
    }
    const clip = { x: 0, y, width: 393, height };
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
        clip,
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
