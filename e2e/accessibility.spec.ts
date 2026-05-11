/**
 * Sprint 8 — accessibility regression tests.
 *
 * Pre-Sprint-8 this file had two assertions that always passed
 * (`expect(headings).toBeGreaterThanOrEqual(0)` and the same shape
 * on the focus test). Rewriting them to assert real conditions that
 * actually catch regressions:
 *
 * 1. Login page has exactly one h1 (heading hierarchy contract).
 * 2. First Tab focuses the skip-to-main-content link (the canonical
 *    a11y entry point — Sprint 5 deduplicated this so we now pin
 *    it).
 * 3. Exactly ONE skip link exists in the rendered DOM (regression
 *    against the Sprint-5 duplicate-skip-link bug).
 * 4. Icon-only buttons (no text child) have a non-empty aria-label
 *    (regression against the most common a11y miss; the Sprint-1
 *    IconButton primitive enforces this at compile time, but pages
 *    that ship raw <button> elements bypass that gate).
 * 5. No role="button" applied to non-button elements (the Sprint-1
 *    audit flagged this anti-pattern in Settings/UserProfile
 *    backdrops; the fix is to use real <button> elements).
 * 6. Touch targets for login interactive elements meet the IconButton
 *    primitive's documented size floors (Sprint 1).
 *
 * Stable, behaviour-checking, and tied to real defects we've seen.
 * No `>= 0` cargo-cult assertions.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe('Accessibility — content invariants', () => {
  test('html has lang=en', async ({ page }) => {
    await page.goto('/');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('viewport meta enables responsive scaling', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('login page has an h1 (real heading-hierarchy assertion)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Pre-Sprint-8 this was `expect(headings).toBeGreaterThanOrEqual(0)`
    // which always passed. The login page renders the Tropos
    // wordmark as an h1 (Login.tsx:86-88).
    const h1Count = await page.locator('h1').count();
    expect(h1Count, 'Login page must render exactly one h1').toBe(1);
    const h1Text = await page.locator('h1').first().textContent();
    expect(h1Text?.trim()).toBe('Tropos');
  });

  test('no images without alt text on login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const imgWithoutAlt = await page.locator('img:not([alt])').count();
    expect(imgWithoutAlt).toBe(0);
  });

  test('privacy page returns substantial content', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    const text = await page.locator('#root').textContent();
    expect(text?.length).toBeGreaterThan(100);
  });
});

test.describe('Accessibility — skip link contract (Sprint 5)', () => {
  test('exactly one skip-to-content link in the DOM', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Pre-Sprint-5 there were TWO: index.html:99 (loads before React)
    // and Layout.tsx:79 (rendered during React lifecycle). Each was
    // a separate Tab stop. Sprint 5 removed the Layout one; this test
    // guards against a regression where Layout or another component
    // re-adds a duplicate.
    const skipLinks = page.locator('a[href="#main-content"]');
    const count = await skipLinks.count();
    expect(count, 'Exactly one skip-to-main-content link should exist').toBe(1);
  });

  test('first Tab focuses the skip link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    const href = await focused.getAttribute('href');
    expect(href, 'First Tab should focus the skip link').toBe('#main-content');
  });
});

test.describe('Accessibility — button names (Sprint 1 IconButton contract)', () => {
  test('every button on the login page has an accessible name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count, 'login page must render at least one button').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const ariaLabel = (await button.getAttribute('aria-label'))?.trim();
      const text = (await button.textContent())?.trim();
      const title = (await button.getAttribute('title'))?.trim();
      // title-only accessible name is a desktop-hover-only fallback
      // we accept reluctantly, but record it as the weakest path.
      const hasAccessibleName = !!ariaLabel || !!text || !!title;
      expect(
        hasAccessibleName,
        `Button at index ${i} lacks an accessible name (no aria-label, no text, no title)`,
      ).toBe(true);
    }
  });

  test('icon-only buttons (zero visible text) have a non-empty aria-label', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const buttons = page.locator('button');
    const count = await buttons.count();
    const offenders: number[] = [];
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const text = (await button.textContent())?.trim() ?? '';
      if (text.length > 0) continue; // text-bearing button — already accessible
      const ariaLabel = (await button.getAttribute('aria-label'))?.trim() ?? '';
      if (ariaLabel.length === 0) offenders.push(i);
    }
    expect(
      offenders,
      `Icon-only buttons missing aria-label at indices: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

test.describe('Accessibility — anti-patterns', () => {
  test('no role="button" on non-button elements (use real <button>)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Pre-Sprint-1 audit flagged this on Settings backdrop +
    // UserProfile backdrop. The fix is to wrap dismissal logic in a
    // real <button aria-label="Close">. role="button" on a <div>
    // produces a phantom Tab-stop with no native keyboard handling
    // and screen readers announce it inconsistently. This test
    // catches re-regressions on the login page; other pages need
    // their own auth fixture to test similarly.
    const fakeButtons = page.locator(
      '[role="button"]:not(button):not([type])',
    );
    const count = await fakeButtons.count();
    expect(
      count,
      `Found ${count} element(s) with role="button" that should be real <button> elements`,
    ).toBe(0);
  });
});

async function tapSize(page: Page, selector: string): Promise<{ width: number; height: number } | null> {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  const box = await el.boundingBox();
  return box ? { width: box.width, height: box.height } : null;
}

test.describe('Accessibility — touch targets (iOS HIG 44pt floor, Sprint 1)', () => {
  test('login submit button is at least 44px tall', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const size = await tapSize(page, 'button[type="submit"]');
    expect(size, 'submit button must be rendered').not.toBeNull();
    expect(size!.height, `Login submit button height = ${size!.height}px (need >= 44)`).toBeGreaterThanOrEqual(44);
  });

  test('password show/hide toggle meets the IconButton size=sm floor (36px)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // The IconButton size=sm on the password eye toggle deliberately
    // accepts 36px (under the 44px HIG floor) because the parent row
    // provides additional tap area around it. The size=sm contract
    // is in Button.tsx; this test guards against a regression where
    // the toggle shrinks back to its pre-Sprint-1 ~32px state.
    const size = await tapSize(page, 'button[aria-label*="password" i]');
    expect(size, 'password toggle must be rendered on login screen').not.toBeNull();
    if (size) {
      expect(size.height, `Password toggle height = ${size.height}px (need >= 36)`).toBeGreaterThanOrEqual(36);
      expect(size.width, `Password toggle width = ${size.width}px (need >= 36)`).toBeGreaterThanOrEqual(36);
    }
  });
});
