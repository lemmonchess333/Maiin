import { test, expect } from "@playwright/test";

test.describe("Security & CSP", () => {
  test("Content-Security-Policy meta tag exists", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP allows required script sources", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("script-src 'self'");
    // The app loads no Stripe script and makes no Stripe request (Sub4),
    // so no Stripe host is allowed anywhere in the policy.
    expect(csp).not.toContain("stripe.com");
  });

  test("CSP allows required connect sources", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://*.googleapis.com");
    expect(csp).toContain("https://*.firebaseio.com");
    expect(csp).toContain("https://*.cloudfunctions.net");
    expect(csp).toContain("wss://*.firebaseio.com");
  });

  test("CSP restricts frame sources to Firebase sign-in", async ({ page }) => {
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("frame-src https://*.firebaseapp.com");
  });

  test("CSP allows Firebase Analytics (gtag) domains", async ({ page }) => {
    // Firebase Analytics loads gtag.js from googletagmanager.com and beacons
    // to *.google-analytics.com. A CSP tightening that drops these silently
    // breaks all analytics delivery (regression guard — see index.html CSP).
    await page.goto("");
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute("content");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://www.google-analytics.com");
  });

  test("no inline scripts in body (CSP compliance)", async ({ page }) => {
    await page.goto("");
    // Body should not contain inline script tags (head has the dark mode IIFE which is allowed by unsafe-inline)
    const bodyScripts = await page
      .locator('body script:not([src]):not([type="module"])')
      .count();
    expect(bodyScripts).toBe(0);
  });

  test("external resources use HTTPS", async ({ page }) => {
    await page.goto("");
    // The app's own files take the page's scheme. Vite's preload helper
    // writes them as absolute URLs, so on the http://localhost test server
    // every lazy chunk the sign-in screen preloads starts "http:" (28 of
    // them, which turned the nightly run red); on the product they are
    // https. What must never be plain http is a file from anywhere else.
    const insecureExternal = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("link[href], script[src]")]
          .map(
            (el) =>
              new URL(
                el.getAttribute(el.tagName === "LINK" ? "href" : "src") ?? "",
                document.baseURI
              )
          )
          .filter(
            (url) => url.protocol === "http:" && url.origin !== location.origin
          )
          .map((url) => url.href)
      );
    expect(await insecureExternal()).toEqual([]);

    // The anchor: a plain-http file from elsewhere is still caught.
    await page.evaluate(() => {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = "http://example.com/";
      document.head.append(link);
    });
    expect(await insecureExternal()).toEqual(["http://example.com/"]);
  });

  test("noscript fallback exists", async ({ page }) => {
    await page.goto("");
    const noscript = await page.locator("noscript").count();
    expect(noscript).toBeGreaterThan(0);
  });
});
