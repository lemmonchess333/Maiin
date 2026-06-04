import { test, expect } from "@playwright/test";

test.describe("Security & CSP", () => {
  test("Content-Security-Policy meta tag exists", async ({ page }) => {
    await page.goto("/");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test("CSP allows required script sources", async ({ page }) => {
    await page.goto("/");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("https://js.stripe.com");
  });

  test("CSP allows required connect sources", async ({ page }) => {
    await page.goto("/");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://*.googleapis.com");
    expect(csp).toContain("https://*.firebaseio.com");
    expect(csp).toContain("https://*.cloudfunctions.net");
    expect(csp).toContain("wss://*.firebaseio.com");
  });

  test("CSP restricts frame sources to Stripe and Firebase", async ({
    page,
  }) => {
    await page.goto("/");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain(
      "frame-src https://js.stripe.com https://*.firebaseapp.com"
    );
  });

  test("CSP allows Firebase Analytics (gtag) domains", async ({ page }) => {
    // Firebase Analytics loads gtag.js from googletagmanager.com and beacons
    // to *.google-analytics.com. A CSP tightening that drops these silently
    // breaks all analytics delivery (regression guard — see index.html CSP).
    await page.goto("/");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://www.google-analytics.com");
  });

  test("no inline scripts in body (CSP compliance)", async ({ page }) => {
    await page.goto("/");
    // Body should not contain inline script tags (head has the dark mode IIFE which is allowed by unsafe-inline)
    const bodyScripts = await page
      .locator('body script:not([src]):not([type="module"])')
      .count();
    expect(bodyScripts).toBe(0);
  });

  test("external resources use HTTPS", async ({ page }) => {
    await page.goto("/");
    // All link[href] and script[src] should use https or relative paths
    const insecureLinks = await page.locator('link[href^="http:"]').count();
    const insecureScripts = await page.locator('script[src^="http:"]').count();
    expect(insecureLinks).toBe(0);
    expect(insecureScripts).toBe(0);
  });

  test("noscript fallback exists", async ({ page }) => {
    await page.goto("/");
    const noscript = await page.locator("noscript").count();
    expect(noscript).toBeGreaterThan(0);
  });
});
