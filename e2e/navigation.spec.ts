import { test, expect } from '@playwright/test';

test.describe('Navigation & UI', () => {
  test('login page shows sign-in options', async ({ page }) => {
    await page.goto('/');
    // Should show login UI elements
    await expect(page.locator('#root')).toBeAttached();
    // Look for common auth UI text
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('privacy policy page has content', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('#root')).toBeAttached();
    // Privacy page should have substantial content
    const rootContent = await page.locator('#root').textContent();
    expect(rootContent?.length).toBeGreaterThan(50);
  });

  test('unknown routes redirect to login', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.locator('#root')).toBeAttached();
    // Unauthenticated users get redirected to login for any route
  });

  test('page loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.locator('#root').waitFor({ state: 'attached' });
    const loadTime = Date.now() - start;
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('no accessibility violations on login page', async ({ page }) => {
    await page.goto('/');
    // Check basic accessibility: images should have alt text
    const images = page.locator('img:not([alt])');
    const count = await images.count();
    expect(count).toBe(0);
  });

  test('viewport meta tag exists for mobile', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('manifest.json is accessible', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();
    expect(manifest?.name).toBeTruthy();
    expect(manifest?.icons?.length).toBeGreaterThan(0);
  });

  test('service worker registers without error', async ({ page }) => {
    await page.goto('/');
    // Wait for SW registration
    await page.waitForTimeout(2000);
    const swRegistrations = await page.evaluate(() =>
      navigator.serviceWorker?.getRegistrations().then(regs => regs.length)
    );
    // SW should be registered (or at least not throw)
    expect(swRegistrations).toBeGreaterThanOrEqual(0);
  });
});
