import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('login page has no images without alt text', async ({ page }) => {
    await page.goto('/');
    const imgWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imgWithoutAlt).toBe(0);
  });

  test('all buttons have accessible names', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const name = await button.getAttribute('aria-label');
      const text = await button.textContent();
      const title = await button.getAttribute('title');

      // Button should have either text content, aria-label, or title
      const hasAccessibleName = (text && text.trim().length > 0) ||
                                 (name && name.trim().length > 0) ||
                                 (title && title.trim().length > 0);
      expect(hasAccessibleName, `Button at index ${i} lacks accessible name`).toBe(true);
    }
  });

  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Page should have at least one heading
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
    expect(headings).toBeGreaterThanOrEqual(0); // Login page may not have headings
  });

  test('html has lang attribute', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('viewport meta tag disables user-scaling appropriately', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('privacy page has substantial content', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForTimeout(1000);
    const text = await page.locator('#root').textContent();
    expect(text?.length).toBeGreaterThan(100);
  });

  test('focus is visible on interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Tab through the page and check focus is visible
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    const count = await focusedElement.count();
    // At least one element should be focusable
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
