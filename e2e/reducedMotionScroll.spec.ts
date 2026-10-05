import { test, expect, type Page } from "@playwright/test";

/**
 * Reduce Motion has to reach scrolling, not just animation.
 *
 * `animations.css` carries the widely-copied reduced-motion reset, and
 * the widely-copied reset covers `animation-duration`,
 * `animation-iteration-count` and `transition-duration` — not
 * `scroll-behavior`, which is neither. So `index.css`'s
 * `html { scroll-behavior: smooth }` ran for everyone, and a
 * page-length smooth scroll is among the most reliable vestibular
 * triggers there is.
 *
 * Measured rather than argued, in Chromium with the preference
 * emulated. Before the fix a scroll moved 48px in 30ms; after it, 4346.
 *
 * This runs against the real built app, so it reads the stylesheet that
 * actually ships rather than a fixture that restates it.
 */

/** The preference must really be on, or every assertion here is vacuous. */
async function withReduceMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ),
    "the reduced-motion emulation is not active — nothing below is measuring anything"
  ).toBe(true);
}

const computedScrollBehavior = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior
  );

test.describe("Reduce Motion reaches scrolling", () => {
  test("the document scrolls instantly under the preference", async ({
    page,
  }) => {
    await withReduceMotion(page);
    expect(await computedScrollBehavior(page)).toBe("auto");
  });

  test("and still scrolls smoothly without it", async ({ page }) => {
    /* The paired positive. Deleting `html { scroll-behavior: smooth }`
       would satisfy the test above while taking the motion away from
       everyone, which is not the ask. */
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await computedScrollBehavior(page)).toBe("smooth");
  });

  test("a default-behavior scroll lands in one frame under the preference", async ({
    page,
  }) => {
    /* The behavioural half. The computed property above is what the app
       sets; this is what the browser then does with it. */
    await withReduceMotion(page);
    const travelled = await page.evaluate(async () => {
      const probe = document.createElement("div");
      probe.style.cssText = "height:4000px";
      const mark = document.createElement("div");
      mark.id = "rm-probe-target";
      document.body.append(probe, mark);
      window.scrollTo(0, 0);
      mark.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const y = window.scrollY;
      probe.remove();
      mark.remove();
      return Math.round(y);
    });
    expect(
      travelled,
      `a scroll under Reduce Motion travelled only ${travelled}px in one frame — it is animating`
    ).toBeGreaterThan(1000);
  });

  /* No source may pass an explicit `behavior: "smooth"`: it beats the
     computed property by spec. That ban is an ESLint rule now
     (no-restricted-syntax in eslint.config.js), so `npm run lint` catches
     it in seconds instead of this file catching it after a CI build. */
});
