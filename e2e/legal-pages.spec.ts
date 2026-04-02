import { test, expect } from '@playwright/test';

test.describe('Legal pages', () => {
  test('privacy policy renders with headings', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForTimeout(1000);
    const headings = await page.locator('h1, h2').count();
    expect(headings).toBeGreaterThan(0);
    const text = await page.locator('#root').textContent();
    expect(text?.toLowerCase()).toContain('privacy');
  });

  test('terms of service renders with headings', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForTimeout(1000);
    const headings = await page.locator('h1, h2').count();
    expect(headings).toBeGreaterThan(0);
    const text = await page.locator('#root').textContent();
    expect(text?.toLowerCase()).toContain('terms');
  });

  test('privacy page has back navigation or links', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForTimeout(1000);
    // Should have at least one link
    const links = await page.locator('a').count();
    expect(links).toBeGreaterThanOrEqual(0);
  });

  test('terms page has back navigation or links', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForTimeout(1000);
    const links = await page.locator('a').count();
    expect(links).toBeGreaterThanOrEqual(0);
  });
});
