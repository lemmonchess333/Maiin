import { test, expect } from '@playwright/test';

test.describe('Performance & resilience', () => {
  test('initial bundle loads in under 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.locator('#root').waitFor({ state: 'attached' });
    const childCount = await page.locator('#root').evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThan(0);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  test('no uncaught JS exceptions on page load', async ({ page }) => {
    const exceptions: string[] = [];
    page.on('pageerror', (err) => {
      exceptions.push(err.message);
    });

    await page.goto('/');
    await page.waitForTimeout(2000);
    expect(exceptions).toHaveLength(0);
  });

  test('404 route does not crash the app', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await page.waitForTimeout(1000);
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    const childCount = await root.evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThan(0);
  });

  test('skip-to-content link exists', async ({ page }) => {
    await page.goto('/');
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });

  test('dark mode script in head executes without error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    // The IIFE in <head> should run without throwing
    expect(errors).toHaveLength(0);
  });

  test('fonts are self-hosted and load successfully', async ({ page }) => {
    // Fonts moved off the Google Fonts CDN to bundled @fontsource-variable
    // packages. Assert the inverse of the old test: nothing should ever hit
    // Google's font origins, and the self-hosted variable face should still
    // be registered and usable.
    const cdnRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        cdnRequests.push(url);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(cdnRequests).toEqual([]);

    const displayFontReady = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('700 16px "Plus Jakarta Sans Variable"');
    });
    expect(displayFontReady).toBe(true);
  });

  test('Open Graph meta tags are present', async ({ page }) => {
    await page.goto('/');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogTitle).toBeTruthy();
    expect(ogDesc).toBeTruthy();
    expect(ogImage).toBeTruthy();
  });

  test('Twitter Card meta tags are present', async ({ page }) => {
    await page.goto('/');
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content');
    expect(twitterCard).toBeTruthy();
    expect(twitterTitle).toBeTruthy();
  });
});
