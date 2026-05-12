import { test, expect } from '@playwright/test';

/* PR F regression guard. Sweeps the unauthenticated entry surface
 * across iPhone SE (1st gen 320px → smallest viewport we still
 * support), iPhone 14 (375px → primary mobile target), and iPhone 14
 * Pro Max (430px → upper end of phone widths) to catch horizontal
 * scroll regressions and CSS-token bundle issues introduced by
 * Social-page polish PRs (D/E especially).
 *
 * The Social page itself is gated behind auth and not reachable
 * without Firebase mocking, but the legal pages share the same
 * stylesheet, root layout, and token pipeline — if --primary-strong
 * fails to build into the CSS or a hardcoded width breaks small-screen
 * layout, these surfaces will surface the failure first.
 *
 * PR B (audit follow-up): the Safari-standalone test was previously
 * in this file inside a `test.describe` with
 * `test.use({ ...devices['iPhone 14'] })`. Playwright rejects that
 * pattern at config-load time because the `devices` config spread
 * includes `defaultBrowserType`, which forces a new worker — and
 * Playwright disallows that inside `describe`. Moved to
 * `e2e/responsive-safari-standalone.spec.ts` (file-level scope) so
 * the rest of this file can run, and so other responsive tests
 * here aren't silently switched to webkit by an over-broad
 * `test.use`. */

const VIEWPORTS = [
  { name: 'iPhone SE (320×568)', width: 320, height: 568 },
  { name: 'iPhone 14 (390×844)', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max (430×932)', width: 430, height: 932 },
];

test.describe('Responsive — unauthenticated surfaces sweep', () => {
  for (const vp of VIEWPORTS) {
    test(`no horizontal scroll on / at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(() => {
        return {
          body: document.body.scrollWidth,
          html: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        };
      });
      // +1 px tolerance for sub-pixel rounding on certain DPRs.
      expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
      expect(overflow.html).toBeLessThanOrEqual(overflow.viewport + 1);
    });

    test(`no horizontal scroll on /privacy at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/privacy');
      await page.waitForLoadState('domcontentloaded');
      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);
    });
  }

  test('CSS bundle includes the --primary-strong token (PR D)', async ({ page }) => {
    await page.goto('/');
    /* The token has to land somewhere in the active stylesheet for
       bg-primary-strong / THEME.brandStrong to resolve at runtime. We
       don't depend on the Social page being reachable to validate
       this — the property either exists on :root or it doesn't. */
    const value = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return root.getPropertyValue('--primary-strong').trim();
    });
    expect(value.length).toBeGreaterThan(0);
  });
});

// Safari-standalone test moved to e2e/responsive-safari-standalone.spec.ts.
// See the file header for the rationale.
