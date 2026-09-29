/**
 * Weekly Review capture (Rev1 PR1 — design-review channel).
 *
 * Same rig as home.screens.capture.spec.ts: runs in CI against the
 * emulator (auth-emulator project), commits PNGs to the app-screenshots
 * branch. Captures the /review page for the rich-seeded user, light +
 * dark. The quiet-week and thin-first-week states need dedicated seed
 * users — noted in the Rev1 lock as follow-up captures.
 */
import { test, type Page } from "@playwright/test";
import { signInAsTestUser } from "../helpers/auth";
import { emulatorActive } from "../helpers/emulator";

test.use({ viewport: { width: 393, height: 852 } });

test.describe("weekly review screenshots", () => {
  test.skip(
    !emulatorActive,
    "needs the Firebase emulator (auth-emulator project)"
  );

  test.beforeEach(async ({ page }) => {
    await signInAsTestUser(page);
  });

  /* `animations: "disabled"` is load-bearing here, not tidiness.
     The theme is switched below by toggling the `dark` class and shooting
     straight after, and the SegmentedControl's options carry
     `motion-safe:transition-colors` — so the frame caught them at the START
     of that colour transition, still holding the LIGHT muted-foreground.
     `weekly-review-dark.png` showed the check-in's three options at 2.96:1
     against their track while every other muted string on the same frame
     sat at 5.51:1, and the component was innocent: identical markup on
     Social measured correctly. A design review reading that frame chases a
     contrast bug that does not exist in the app.

     Playwright fast-forwards finite transitions to completion under this
     option, so the colour lands on its end state. Every capture spec now
     passes it — see `captureAnimationsFrozen.test.ts`. */
  async function shoot(page: Page, name: string) {
    await page.screenshot({
      animations: "disabled",
      path: `screenshots/${name}.png`,
      fullPage: true,
    });
  }

  test("weekly review — light + dark", async ({ page }) => {
    // Relative (no leading slash) — a leading '/' escapes the /Maiin/
    // baseURL and lands on the server's base-path error page.
    await page.goto("review");
    /* DS3: the recap is cards now. The first card's heading is the
       anchor that the fetch-on-open assembly has settled. */
    await page
      .getByRole("heading", {
        name: /^(Your week|A quiet week|Your first review)$/,
      })
      .waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);

    const track = page.locator('[aria-roledescription="carousel"]');
    const cards = await page.getByRole("group").count();
    /* An instant scroll, not the app's smooth one: a smooth scroll lands
       mid-flight inside any fixed wait (CLAUDE.md, capture gotchas). */
    const showCard = (i: number) =>
      track.evaluate((el, index) => {
        el.scrollTo({ left: index * el.clientWidth, behavior: "instant" });
      }, i);

    for (const theme of ["light", "dark"] as const) {
      /* The settle is the other half of the fix in `shoot` above, and it
         is the half `animations: "disabled"` cannot supply. Freezing
         transitions lands CSS colours on their end state, but
         `useMacroPalette` and `MuscleHeatMap` read this class in
         JAVASCRIPT — they need a React re-render before their colours
         change, and a screenshot taken in the same tick catches the
         previous theme. */
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark"
      );
      await page.waitForTimeout(400);
      for (let i = 0; i < cards; i++) {
        await showCard(i);
        await page.waitForTimeout(400);
        // The first card keeps the frame's old name, so the diff report
        // compares it with the page it replaced.
        await shoot(
          page,
          i === 0 ? `weekly-review-${theme}` : `weekly-review-${i + 1}-${theme}`
        );
      }
    }

    await page.evaluate(() =>
      document.documentElement.classList.remove("dark")
    );
  });
});
