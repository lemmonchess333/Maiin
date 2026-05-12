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
    // PR B (audit): pre-fix this asserted `links >= 0` which always
    // passes. The test's stated purpose is to confirm at least one
    // link exists (back-nav, contact, related policy). Strengthened
    // to require at least one anchor — a regression where the
    // privacy page renders without ANY link would break user
    // navigation back to the app.
    const links = await page.locator('a').count();
    expect(links, 'privacy page must render at least one link for navigation').toBeGreaterThan(0);
  });

  test('terms page has back navigation or links', async ({ page }) => {
    await page.goto('/terms');
    await page.waitForTimeout(1000);
    const links = await page.locator('a').count();
    expect(links, 'terms page must render at least one link for navigation').toBeGreaterThan(0);
  });
});
