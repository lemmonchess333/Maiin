import { test, expect } from '@playwright/test';

test.describe('PWA features', () => {
  test('manifest has required fields', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.status()).toBe(200);
    const manifest = await response?.json();

    expect(manifest.name).toBe('Tropos');
    expect(manifest.short_name).toBe('Tropos');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/Maiin/');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    // Verify maskable icons exist
    const maskable = manifest.icons.filter((i: { purpose?: string }) =>
      i.purpose?.includes('maskable')
    );
    expect(maskable.length).toBeGreaterThan(0);
  });

  test('app has apple-mobile-web-app meta tags', async ({ page }) => {
    await page.goto('/');

    const capable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
    expect(capable).toBe('yes');

    const title = await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content');
    expect(title).toBe('Tropos');
  });

  test('theme-color meta tag is set', async ({ page }) => {
    await page.goto('/');
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('app renders within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.locator('#root').waitFor({ state: 'attached' });
    const childCount = await page.locator('#root').evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThan(0);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
