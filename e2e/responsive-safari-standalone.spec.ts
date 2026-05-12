import { test, expect, devices } from '@playwright/test';

/* Safari-standalone (PWA-ish) regression guard.
 *
 * Lives in its own file so `test.use({ ...devices['iPhone 14'] })`
 * can sit at file-level top scope. Playwright rejects the same
 * pattern inside `test.describe()` because device configs include
 * `defaultBrowserType`, which forces a new worker — see PR B for
 * the captured error. Splitting the test out also avoids
 * accidentally switching the rest of `responsive.spec.ts` to
 * webkit by applying file-wide `test.use`.
 *
 * Approximates iOS Safari "Add to Home Screen" mode. The app's
 * manifest declares `display: standalone`, so this is the closest
 * E2E can get without a real device. Validates the privacy route
 * renders meaningful content against an iPhone-shaped UA + small
 * viewport + webkit engine — covers the path real iOS users hit
 * when they install the app from Safari. */
test.use({ ...devices['iPhone 14'] });

test('privacy page renders meaningful content on iPhone-shaped UA', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('#root')).toBeAttached();

  // Privacy page must render real content, not just a shell. >100
  // chars catches an empty-app crash; the explicit "privacy"
  // substring assertion catches a route that loaded the wrong page
  // (e.g. caught by the SPA's fallback and showed Home / Login).
  const text = (await page.locator('#root').textContent()) ?? '';
  expect(text.length).toBeGreaterThan(100);
  expect(text.toLowerCase()).toContain('privacy');
});

test('iOS Safari user agent is detected by the page', async ({ page }) => {
  await page.goto('/');
  // The whole point of running under devices['iPhone 14'] is to
  // exercise the webkit + iOS UA code path. Sanity-check the UA
  // string actually shows iPhone — if Playwright ever drops device
  // emulation for a project, this test catches the silent regression
  // before assertions on iOS-specific behaviour give false-greens.
  const userAgent = await page.evaluate(() => navigator.userAgent);
  expect(userAgent).toMatch(/iPhone|iPad|iPod/i);
});
